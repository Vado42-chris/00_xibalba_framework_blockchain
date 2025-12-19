/**
 * server/serve-with-proxy.js
 *
 * Minimal static server that:
 * - Serves files from `client/dist` (or env STATIC_DIR)
 * - Proxies requests under `/api/` to the hybrid bridge (default http://localhost:3001)
 * - SPA friendly: unknown GET paths return `index.html`
 *
 * Usage:
 *   node server/serve-with-proxy.js
 *
 * Environment:
 *   PORT           - port to listen on (default 5000)
 *   STATIC_DIR     - directory to serve static files from (default: client/dist)
 *   BRIDGE_HOST    - backend host to proxy API requests to (default: localhost)
 *   BRIDGE_PORT    - backend port to proxy API requests to (default: 3001)
 *   PROXY_TOKEN    - optional token to attach as `Authorization: Bearer <token>` when proxying
 *
 * Notes:
 * - Avoids external dependencies; implements a simple streaming proxy using Node's `http` module.
 * - For production, put this behind a hardened reverse-proxy (nginx/Caddy) and use TLS.
 */

import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { pipeline } from "stream";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const ROOT = process.cwd();

const DEFAULT_STATIC = path.resolve(ROOT, "client", "dist");
const STATIC_DIR = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : DEFAULT_STATIC;
const PORT = Number(process.env.PORT || 5000);
const BRIDGE_HOST = process.env.BRIDGE_HOST || "127.0.0.1";
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || 3001);
const PROXY_TOKEN = process.env.PROXY_TOKEN || process.env.HYBRID_API_TOKEN || null;

// content-type mapping (very small)
const MIME = {
  ".html": "text/html; charset=UTF-8",
  ".js": "application/javascript; charset=UTF-8",
  ".mjs": "application/javascript; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/octet-stream",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// small logger
function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// safe path join to avoid directory traversal
function resolveStatic(p) {
  const target = path.join(STATIC_DIR, p);
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(STATIC_DIR))) {
    throw new Error("path outside static dir");
  }
  return resolved;
}

// serve static file if exists. returns true if served, false otherwise
async function tryServeStatic(req, res, reqPath) {
  try {
    // default to index.html for directory or empty path
    let filePath = reqPath;
    if (!filePath || filePath === "/") filePath = "/index.html";

    // resolve and check existence
    const resolved = resolveStatic(filePath);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      const ext = path.extname(resolved).toLowerCase();
      const ct = MIME[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": ct,
        "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
      });
      const stream = fs.createReadStream(resolved);
      await new Promise((resolve, reject) => pipeline(stream, res, (err) => (err ? reject(err) : resolve())));
      return true;
    }
    return false;
  } catch (err) {
    // log and continue
    log("serve error:", err && err.message);
    return false;
  }
}

// SPA-friendly: return index.html for GET navigation requests when file not found
function serveIndex(res) {
  try {
    const indexPath = resolveStatic("/index.html");
    if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
      const html = fs.readFileSync(indexPath);
      res.writeHead(200, { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-cache" });
      res.end(html);
      return true;
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("index.html not found");
      return false;
    }
  } catch (err) {
    log("serveIndex error:", err && err.message);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("internal server error");
    return false;
  }
}

// proxy /api/* requests to bridge
function proxyToBridge(req, res) {
  const targetPath = req.url; // keep the full path (/api/...)
  const isSecure = false; // bridge is http by default
  const proxyModule = isSecure ? https : http;

  const headers = { ...req.headers };
  // remove hop-by-hop headers that should not be forwarded
  // (simplified)
  delete headers["connection"];
  delete headers["keep-alive"];
  delete headers["transfer-encoding"];
  delete headers["upgrade"];
  delete headers["proxy-authorization"];
  delete headers["proxy-authenticate"];
  delete headers["te"];

  // optionally attach a bearer token if configured
  if (PROXY_TOKEN) {
    headers["authorization"] = `Bearer ${PROXY_TOKEN}`;
  }

  const options = {
    hostname: BRIDGE_HOST,
    port: BRIDGE_PORT,
    path: targetPath,
    method: req.method,
    headers,
  };

  log(`proxy -> http://${BRIDGE_HOST}:${BRIDGE_PORT}${targetPath} [${req.method}]`);

  const proxyReq = proxyModule.request(options, (proxyRes) => {
    // copy status and headers
    const outHeaders = { ...proxyRes.headers };
    // avoid some hop-by-hop headers
    delete outHeaders["transfer-encoding"];
    res.writeHead(proxyRes.statusCode || 502, outHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    log("proxy error:", err && err.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "bad gateway", detail: String(err && err.message) }));
  });

  // pipe request body to backend
  req.pipe(proxyReq);
}

// a tiny healthcheck endpoint
function handleHealth(req, res) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
}

// start server
const server = http.createServer(async (req, res) => {
  try {
    const { method, url: reqUrl } = req;

    // normalize URL path (avoid query)
    const urlObj = new URL(reqUrl, `http://${req.headers.host || "localhost"}`);
    const pathname = urlObj.pathname;

    // quick health check
    if (pathname === "/-/health" || pathname === "/health") {
      return handleHealth(req, res);
    }

    // Proxy API calls
    if (pathname.startsWith("/api/") || pathname === "/api") {
      return proxyToBridge(req, res);
    }

    // serve static files for GET/HEAD
    if (method === "GET" || method === "HEAD") {
      const served = await tryServeStatic(req, res, pathname);
      if (served) return;
      // fallback to SPA index.html
      if (method === "GET") {
        const ok = serveIndex(res);
        if (ok) return;
      }
      // not found
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }

    // For non-GET methods that are not /api, return 405
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("method not allowed");
  } catch (err) {
    log("server error:", err && err.stack ? err.stack : err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("internal server error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  log(`Static+Proxy server listening on http://0.0.0.0:${PORT}`);
  log(`Serving static files from: ${STATIC_DIR}`);
  log(`Proxying '/api/' -> http://${BRIDGE_HOST}:${BRIDGE_PORT}`);
  if (PROXY_TOKEN) log("Proxy will attach Authorization bearer token from PROXY_TOKEN/HYBRID_API_TOKEN");
});

// graceful shutdown
function shutdown(code = 0) {
  log("shutting down...");
  server.close(() => {
    log("server closed");
    process.exit(code);
  });
  // force exit after 5s
  setTimeout(() => process.exit(code), 5000).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
