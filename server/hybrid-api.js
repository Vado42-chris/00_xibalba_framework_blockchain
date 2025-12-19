#!/usr/bin/env node
/**
 * Minimal hybrid API server (no external dependencies)
 *
 * Endpoints:
 *  - POST /api/hybrid/run    { name, token? } -> { id }
 *  - GET  /api/hybrid/result?id=<id>         -> 200 { ...result... } or 404 if not ready
 *
 * This bridge writes .cmd files into the hybrid-queue directory used by the hybrid-agent
 * and reads .result files from hybrid-results. It intentionally uses only built-in Node APIs
 * so it can be run as: `node server/hybrid-api.js`
 *
 * Safety notes:
 *  - Configure HYBRID_API_TOKEN to require a token in requests or leave unset for no token.
 *  - ALLOWED contains a safe whitelist of command names mapped to actual shell commands.
 *  - This server only enqueues commands; execution is performed by the hybrid-agent process.
 */

import http from 'http'
import { parse } from 'url'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001
const QUEUE_DIR = path.resolve(process.cwd(), 'hybrid-queue')
const RESULTS_DIR = path.resolve(process.cwd(), 'hybrid-results')
const SECRET = process.env.HYBRID_API_TOKEN || null

// Map of friendly command keys to the actual command to enqueue.
// Keep this list minimal and explicit for safety.
const ALLOWED = {
  build: 'npm run build',
  ci: 'npm ci',
  preview: 'npm run preview',
  // add other safe commands here as needed
}

async function ensureDir(dir) {
  try {
    await fsPromises.mkdir(dir, { recursive: true })
  } catch (e) {
    // ignore
  }
}

function randomId() {
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

async function enqueueCommand(cmd) {
  await ensureDir(QUEUE_DIR)
  const id = randomId()
  const file = path.join(QUEUE_DIR, `${id}.cmd`)
  const content = ['#hybrid-mode', '', cmd].join('\n')
  await fsPromises.writeFile(file, content, 'utf8')
  return id
}

function sendJSON(res, code, body) {
  const json = JSON.stringify(body)
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*', // convenient for local dev; restrict in production
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  })
  res.end(json)
}

async function handleRun(req, res, body) {
  try {
    const data = JSON.parse(body || '{}')
    const { name, token } = data
    if (!name || !Object.prototype.hasOwnProperty.call(ALLOWED, name)) {
      return sendJSON(res, 400, { error: 'missing or invalid command name' })
    }
    if (SECRET && token !== SECRET) {
      return sendJSON(res, 403, { error: 'invalid token' })
    }
    const id = await enqueueCommand(ALLOWED[name])
    return sendJSON(res, 200, { id })
  } catch (err) {
    return sendJSON(res, 500, { error: String(err) })
  }
}

async function handleResult(req, res, id) {
  try {
    if (!id) return sendJSON(res, 400, { error: 'missing id' })
    const file = path.join(RESULTS_DIR, `${id}.result`)
    if (!fs.existsSync(file)) return sendJSON(res, 404, { error: 'result not ready' })
    const txt = await fsPromises.readFile(file, 'utf8')
    // try to parse JSON; if not JSON, return plain text
    try {
      const parsed = JSON.parse(txt)
      // send JSON with CORS headers
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(JSON.stringify(parsed))
    } catch {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
      res.end(txt)
    }
  } catch (err) {
    return sendJSON(res, 500, { error: String(err) })
  }
}

function handleOptions(req, res) {
  // Preflight CORS response
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  })
  res.end()
}

const server = http.createServer(async (req, res) => {
  try {
    const u = parse(req.url || '', true)
    const { pathname, query } = u

    if (req.method === 'OPTIONS') {
      return handleOptions(req, res)
    }

    if (req.method === 'POST' && pathname === '/api/hybrid/run') {
      let body = ''
      for await (const chunk of req) body += chunk
      return handleRun(req, res, body)
    }

    if (req.method === 'GET' && pathname === '/api/hybrid/result') {
      const id = (query && query.id) ? String(query.id) : null
      return handleResult(req, res, id)
    }

    // simple index/help for convenience
    if (req.method === 'GET' && (pathname === '/' || pathname === '/api')) {
      return sendJSON(res, 200, {
        info: 'Hybrid API bridge',
        endpoints: {
          run: { method: 'POST', path: '/api/hybrid/run', body: '{ name, token? }' },
          result: { method: 'GET', path: '/api/hybrid/result?id=<id>' },
        },
        allowedCommands: Object.keys(ALLOWED),
      })
    }

    // fallback 404
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: String(err) }))
  }
})

server.listen(PORT, () => {
  console.log(`Hybrid API listening on http://localhost:${PORT}`)
  console.log('Allowed commands:', Object.keys(ALLOWED))
  if (SECRET) console.log('API token required (HYBRID_API_TOKEN is set)')
})
