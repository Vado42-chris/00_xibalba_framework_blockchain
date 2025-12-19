#!/usr/bin/env node
/**
 * hybrid-agent.js
 *
 * Minimal, fairly safe local agent that watches a `queue` folder for .cmd files
 * and runs allowed commands. Produces a .result file for each command with
 * stdout/stderr/exit code/timestamps.
 *
 * Usage:
 *   mkdir -p ~/hybrid-agent/queue ~/hybrid-agent/results
 *   SECRET_TOKEN=yourtoken node hybrid-agent.js --queue ~/hybrid-agent/queue --results ~/hybrid-agent/results --once
 *
 * Command file format (plain text):
 *   #hybrid-mode
 *   SECRET_TOKEN: yourtoken      <- optional if SECRET_TOKEN env var required
 *   # comment lines allowed
 *   <shell command to run>
 *
 * Notes:
 * - This script supports a `--once` flag to process pending commands and exit.
 *   Without `--once` it will poll the queue directory continuously.
 * - Be careful: exec() spawns a shell and will run commands. Keep the whitelist
 *   small and explicit. Use a secret token if you want to restrict who can
 *   submit jobs.
 *
 * Safety checklist (please read):
 * - Run as a non-root user whenever possible.
 * - Use SECRET_TOKEN and keep it outside the repo (export in your shell).
 * - Keep WHITELIST minimal and explicit.
 * - Test first with HYBRID_DRY=1 (dry-run) and --once to see results without executing.
 */

import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execP = promisify(exec);
const argv = process.argv.slice(2);

function argVal(flag, def) {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return def;
}

const QUEUE_DIR = argVal(
  "--queue",
  path.resolve(process.cwd(), "hybrid-queue"),
);
const RESULTS_DIR = argVal(
  "--results",
  path.resolve(process.cwd(), "hybrid-results"),
);
const POLL_MS = Number(argVal("--poll", 800)) || 800;
const SECRET_TOKEN = process.env.SECRET_TOKEN || null;
const DRY_RUN = process.env.HYBRID_DRY === "1" || false;
const ONCE = argv.includes("--once");

// WHITELIST: exact commands allowed or command prefixes allowed.
// Keep this tiny and explicit. Edit as needed.
const WHITELIST = [
  "ls",
  "cat",
  "tail",
  "du",
  "df",
  "systemctl status",
  "journalctl -u",
  "npm run build",
  "npm ci",
  "rsync",
  "tar -czf",
  "service",

  // Allow client-prefixed npm commands so builds run from the `client/` subdir
  "npm --prefix client run build",
  "npm --prefix client ci",
  "npm --prefix client run preview",
];

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    // ignore
  }
}

function sanitizeCmd(cmd) {
  return cmd.replace(/\r/g, "").trim();
}

function isWhitelisted(cmd) {
  const trimmed = cmd.trim();
  for (const w of WHITELIST) {
    if (trimmed === w) return true;
    if (trimmed.startsWith(w + " ")) return true;
  }
  return false;
}

async function writeResult(id, payload) {
  const out = path.join(RESULTS_DIR, `${id}.result`);
  try {
    await fs.writeFile(out, JSON.stringify(payload, null, 2), "utf8");
  } catch (e) {
    // If writing result fails, log to console as fallback
    console.error("Failed to write result file:", out, e);
  }
}

async function processFile(file) {
  const full = path.join(QUEUE_DIR, file);
  const id = path.basename(file, path.extname(file));
  const resultPath = path.join(RESULTS_DIR, `${id}.result`);

  try {
    const raw = await fs.readFile(full, "utf8");
    const lines = raw.split(/\n/).map((l) => l.trimEnd());
    let i = 0;
    while (i < lines.length && lines[i].trim() === "") i++;
    if (i >= lines.length) {
      await writeResult(id, { error: "Empty command file" });
      await fs.unlink(full).catch(() => {});
      return;
    }

    if (lines[i] !== "#hybrid-mode") {
      await writeResult(id, { error: "Missing #hybrid-mode header" });
      await fs.unlink(full).catch(() => {});
      return;
    }
    i++;

    // skip comment lines
    while (i < lines.length && lines[i].startsWith("#")) i++;

    // optional token line like: SECRET_TOKEN: mytoken
    let fileToken = null;
    if (
      i < lines.length &&
      lines[i].toUpperCase().startsWith("SECRET_TOKEN:")
    ) {
      fileToken = lines[i].split(":")[1]?.trim();
      i++;
    }

    if (SECRET_TOKEN && fileToken !== SECRET_TOKEN) {
      await writeResult(id, { error: "Invalid secret token" });
      await fs.unlink(full).catch(() => {});
      return;
    }

    // skip any further blank/comment lines until actual command
    while (i < lines.length && (lines[i] === "" || lines[i].startsWith("#")))
      i++;
    if (i >= lines.length) {
      await writeResult(id, { error: "No command found" });
      await fs.unlink(full).catch(() => {});
      return;
    }

    const cmd = sanitizeCmd(lines.slice(i).join("\n"));
    if (!isWhitelisted(cmd)) {
      await writeResult(id, { error: "Command not allowed by whitelist", cmd });
      await fs.unlink(full).catch(() => {});
      return;
    }

    const startedAt = new Date().toISOString();
    if (DRY_RUN) {
      await writeResult(id, { id, cmd, dryRun: true, startedAt });
      await fs.unlink(full).catch(() => {});
      return;
    }

    try {
      // execute command
      const { stdout, stderr } = await execP(cmd, {
        maxBuffer: 10 * 1024 * 1024,
      });
      const finishedAt = new Date().toISOString();
      await writeResult(id, {
        id,
        cmd,
        exitCode: 0,
        stdout,
        stderr,
        startedAt,
        finishedAt,
      });
    } catch (err) {
      const finishedAt = new Date().toISOString();
      const exitCode = err?.code ?? 1;
      const stdout = err?.stdout ?? "";
      const stderr = err?.stderr ?? err?.message ?? "Unknown error";
      await writeResult(id, {
        id,
        cmd,
        exitCode,
        stdout,
        stderr,
        startedAt,
        finishedAt,
      });
    } finally {
      // remove processed command
      await fs.unlink(full).catch(() => {});
    }
  } catch (err) {
    await writeResult(id, { error: "Failed to process", detail: String(err) });
    await fs.unlink(full).catch(() => {});
  }
}

async function pollOnceAndExit() {
  await ensureDir(QUEUE_DIR);
  await ensureDir(RESULTS_DIR);
  try {
    const files = await fs.readdir(QUEUE_DIR);
    const cmdFiles = files.filter((f) => f.endsWith(".cmd")).sort();
    for (const f of cmdFiles) {
      await processFile(f);
    }
  } catch (e) {
    const errPath = path.join(RESULTS_DIR, `agent.error`);
    await fs
      .writeFile(errPath, JSON.stringify({ error: String(e) }, null, 2))
      .catch(() => {});
    throw e;
  }
}

async function pollLoop() {
  await ensureDir(QUEUE_DIR);
  await ensureDir(RESULTS_DIR);
  for (;;) {
    try {
      const files = await fs.readdir(QUEUE_DIR);
      const cmdFiles = files.filter((f) => f.endsWith(".cmd")).sort();
      for (const f of cmdFiles) {
        await processFile(f);
      }
    } catch (e) {
      // ignore transient errors
      // but write a heartbeat error file occasionally if needed
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function prettyPrintStartup() {
  console.log("Hybrid agent starting with:");
  console.log("  QUEUE_DIR=", QUEUE_DIR);
  console.log("  RESULTS_DIR=", RESULTS_DIR);
  console.log("  WHITELIST=", WHITELIST);
  console.log("  DRY_RUN=", DRY_RUN);
  console.log("  SECRET_REQUIRED=", !!SECRET_TOKEN);
  console.log("  MODE=", ONCE ? "once" : "poll");
  console.log("");
  console.log("Usage notes:");
  console.log(" - Place files named <id>.cmd into the QUEUE_DIR.");
  console.log(" - Each .cmd file must start with a line: #hybrid-mode");
  console.log(
    " - Optional: include a line 'SECRET_TOKEN: <token>' if SECRET_TOKEN is set.",
  );
  console.log(" - Results are written to RESULTS_DIR/<id>.result as JSON.");
  console.log("");
}

(async function main() {
  prettyPrintStartup();
  try {
    if (ONCE) {
      await pollOnceAndExit();
      console.log("Processed pending commands, exiting (once mode)");
      process.exit(0);
    } else {
      // long-running poll loop
      await pollLoop();
    }
  } catch (err) {
    console.error("Agent fatal:", err);
    process.exit(1);
  }
})();
