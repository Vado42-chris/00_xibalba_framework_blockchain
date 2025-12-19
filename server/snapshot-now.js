#!/usr/bin/env node
/**
 * snapshot-now.js
 *
 * One-shot snapshot + summarizer script.
 *
 * Usage:
 *   node server/snapshot-now.js
 *
 * What it does (safe, local-only):
 *  - Creates a new WIP branch: salvage/autosave-<timestamp> (if possible)
 *  - Runs `git add -A` and attempts a commit (if there are changes)
 *  - Creates a tar.gz snapshot at `_incoming/snapshot-<timestamp>.tar.gz`
 *    excluding `.git` and `node_modules`
 *  - Computes SHA256 and size of the tar
 *  - Gathers a short text summary:
 *      - branch name, whether commit was created
 *      - git status (porcelain)
 *      - changed files list
 *      - a small extract of recent hybrid-results (if any)
 *      - client package info (if present)
 *  - Writes summary to `_incoming/snapshot-<timestamp>.summary.txt`
 *  - Writes metadata JSON to `_incoming/snapshot-<timestamp>.meta.json`
 *  - Prints JSON result to stdout
 *
 * Notes:
 *  - This script uses only Node built-ins and the system `git` and `tar` commands.
 *  - Do NOT run this as root; run as the user who owns the repository files.
 *  - It is intentionally conservative: failures are reported but do not stop
 *    other steps when safe to continue.
 */

import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const INCOMING_DIR = path.resolve(ROOT, "_incoming");
const HYBRID_RESULTS_DIR = path.resolve(ROOT, "hybrid-results");
const TIMESTAMP = Date.now();
const BRANCH = `salvage/autosave-${TIMESTAMP}`;
const OUT_NAME = `snapshot-${TIMESTAMP}.tar.gz`;
const OUT_PATH = path.join(INCOMING_DIR, OUT_NAME);
const SUMMARY_PATH = path.join(
  INCOMING_DIR,
  `snapshot-${TIMESTAMP}.summary.txt`,
);
const META_PATH = path.join(INCOMING_DIR, `snapshot-${TIMESTAMP}.meta.json`);

function safeSpawn(cmd, args, opts = {}) {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
    return {
      status: r.status,
      stdout: r.stdout ? String(r.stdout) : "",
      stderr: r.stderr ? String(r.stderr) : "",
    };
  } catch (err) {
    return { status: 127, stdout: "", stderr: String(err) };
  }
}

async function ensureIncoming() {
  try {
    await fsPromises.mkdir(INCOMING_DIR, { recursive: true });
  } catch (err) {
    // ignore
  }
}

function computeSha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function humanBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function readRecentHybridResults(maxFiles = 5, tailLines = 20) {
  try {
    if (!fs.existsSync(HYBRID_RESULTS_DIR)) return [];
    const files = (await fsPromises.readdir(HYBRID_RESULTS_DIR))
      .filter((f) => f.endsWith(".result"))
      .sort()
      .slice(-maxFiles);
    const out = [];
    for (const f of files) {
      const p = path.join(HYBRID_RESULTS_DIR, f);
      try {
        const txt = await fsPromises.readFile(p, "utf8");
        // Take first and last bits to avoid huge dumps
        const lines = txt.split(/\r?\n/);
        const head = lines.slice(0, 6).join("\n");
        const tail = lines.slice(-Math.min(tailLines, lines.length)).join("\n");
        out.push({ file: f, head, tail });
      } catch (err) {
        out.push({ file: f, error: String(err) });
      }
    }
    return out;
  } catch (err) {
    return [{ error: String(err) }];
  }
}

async function readClientPackageInfo() {
  try {
    const pkgPath = path.join(ROOT, "client", "package.json");
    if (!fs.existsSync(pkgPath)) return null;
    const txt = await fsPromises.readFile(pkgPath, "utf8");
    const json = JSON.parse(txt);
    return {
      name: json.name || null,
      version: json.version || null,
      dependencies: json.dependencies
        ? Object.keys(json.dependencies).slice(0, 20)
        : [],
    };
  } catch (err) {
    return { error: String(err) };
  }
}

async function runSnapshot() {
  const result = {
    branch: BRANCH,
    commitCreated: false,
    commitSummary: null,
    gitStatus: null,
    changedFiles: [],
    tar: null,
    sha256: null,
    size: null,
    summaryPath: SUMMARY_PATH,
    metaPath: META_PATH,
    incomingPath: OUT_PATH,
    errors: [],
    timestamp: new Date().toISOString(),
  };

  await ensureIncoming();

  // 1) check we are in a git repo
  const inGit = safeSpawn("git", ["rev-parse", "--is-inside-work-tree"]);
  if (inGit.status !== 0 || (inGit.stdout || "").trim() !== "true") {
    result.errors.push("Not inside a git work tree or git not available");
    // continue; still allow tarball creation
  }

  // 2) create branch (if possible)
  const checkout = safeSpawn("git", ["checkout", "-b", BRANCH]);
  if (checkout.status === 0) {
    // created branch
  } else {
    // If branch exists, try checkout existing branch
    const tryCheckout = safeSpawn("git", ["checkout", BRANCH]);
    if (tryCheckout.status !== 0) {
      // report but continue
      result.errors.push(
        `git checkout branch failed: ${checkout.stderr || checkout.stdout || tryCheckout.stderr || tryCheckout.stdout}`,
      );
    }
  }

  // 3) git status & changed files
  const status = safeSpawn("git", ["status", "--porcelain"]);
  result.gitStatus = status.stdout ? status.stdout.trim() : "";
  if (status.stdout) {
    const lines = status.stdout.split(/\r?\n/).filter(Boolean);
    result.changedFiles = lines.slice(0, 200);
  }

  // 4) git add & commit if there are changes
  try {
    safeSpawn("git", ["add", "-A"]);
    // Attempt commit; if no changes, commit will return non-zero and message will indicate
    const commit = safeSpawn("git", [
      "commit",
      "-m",
      `WIP snapshot ${TIMESTAMP}`,
    ]);
    if (commit.status === 0) {
      result.commitCreated = true;
      result.commitSummary = commit.stdout ? commit.stdout.trim() : null;
    } else {
      // commit failed or nothing to commit; record message
      result.commitCreated = false;
      result.commitSummary = (commit.stderr || commit.stdout || "").trim();
    }
  } catch (err) {
    result.errors.push("git commit failed: " + String(err));
  }

  // 5) create tar.gz snapshot excluding .git, node_modules, and _incoming
  try {
    // Ensure previous file is removed if exists
    try {
      await fsPromises.unlink(OUT_PATH);
    } catch (e) {}
    // Use tar CLI for portability. Exclude the _incoming directory so the archive
    // file being written doesn't get picked up while tar walks the tree.
    const tarRes = safeSpawn("tar", [
      "--exclude=.git",
      "--exclude=node_modules",
      "--exclude=_incoming",
      "-czf",
      OUT_PATH,
      ".",
    ]);
    if (tarRes.status !== 0) {
      result.errors.push(
        "tar failed: " + (tarRes.stderr || tarRes.stdout || "(no output)"),
      );
    } else {
      // read file and compute sha
      const buf = await fsPromises.readFile(OUT_PATH);
      const sha = computeSha256(buf);
      result.sha256 = sha;
      result.size = buf.length;
      result.tar = OUT_PATH;
    }
  } catch (err) {
    result.errors.push("snapshot creation error: " + String(err));
  }

  // 6) read recent hybrid-results content to include in summary
  try {
    result.recentHybridResults = await readRecentHybridResults(6, 30);
  } catch (err) {
    result.recentHybridResults = [{ error: String(err) }];
  }

  // 7) read client package info (helpful for context)
  try {
    result.clientPackage = await readClientPackageInfo();
  } catch (err) {
    result.clientPackage = { error: String(err) };
  }

  // 8) compose a human summary text
  const lines = [];
  lines.push(`Snapshot summary - ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Branch: ${result.branch}`);
  lines.push(`Commit created: ${result.commitCreated ? "yes" : "no"}`);
  if (result.commitSummary) {
    lines.push("");
    lines.push("Commit output:");
    lines.push(result.commitSummary);
  }
  lines.push("");
  lines.push("Git status (porcelain):");
  if (result.gitStatus && result.gitStatus.length) {
    lines.push(result.gitStatus.split(/\r?\n/).slice(0, 200).join("\n"));
  } else {
    lines.push("(clean)");
  }
  lines.push("");
  if (result.changedFiles && result.changedFiles.length) {
    lines.push("Changed files (sample):");
    for (const f of result.changedFiles.slice(0, 50)) lines.push(`  ${f}`);
    if (result.changedFiles.length > 50)
      lines.push(`  ... (${result.changedFiles.length - 50} more)`);
  }
  lines.push("");
  if (result.tar) {
    lines.push(`Snapshot tar: ${result.tar}`);
    lines.push(`Size: ${result.size ? humanBytes(result.size) : "unknown"}`);
    lines.push(`SHA256: ${result.sha256}`);
  } else {
    lines.push("Snapshot tar: (not created)");
  }
  lines.push("");
  if (result.clientPackage) {
    if (result.clientPackage.error) {
      lines.push(
        `Client package: error reading package.json: ${result.clientPackage.error}`,
      );
    } else {
      lines.push(
        `Client package: ${result.clientPackage.name || "unknown"}@${result.clientPackage.version || "unknown"}`,
      );
      if (
        result.clientPackage.dependencies &&
        result.clientPackage.dependencies.length
      ) {
        lines.push(
          `Top dependencies: ${result.clientPackage.dependencies.slice(0, 10).join(", ")}`,
        );
      }
    }
    lines.push("");
  }
  if (result.recentHybridResults && result.recentHybridResults.length) {
    lines.push("Recent hybrid-results (heads and tails):");
    for (const r of result.recentHybridResults) {
      if (r.error) {
        lines.push(`  ${r.file || "(unknown)"}: error: ${r.error}`);
      } else {
        lines.push(`  File: ${r.file}`);
        if (r.head) {
          lines.push("    Head:");
          lines.push("      " + r.head.replace(/\n/g, "\n      "));
        }
        if (r.tail) {
          lines.push("    Tail:");
          lines.push("      " + r.tail.replace(/\n/g, "\n      "));
        }
      }
      lines.push("");
    }
  }

  if (result.errors && result.errors.length) {
    lines.push("Non-fatal errors / notes:");
    for (const e of result.errors) lines.push(`  - ${e}`);
    lines.push("");
  }

  const summaryText = lines.join("\n");

  // 9) write summary and meta files
  try {
    await fsPromises.writeFile(SUMMARY_PATH, summaryText, "utf8");
  } catch (err) {
    result.errors.push("failed to write summary: " + String(err));
  }

  try {
    await fsPromises.writeFile(
      META_PATH,
      JSON.stringify(result, null, 2),
      "utf8",
    );
  } catch (err) {
    // if meta fails, still proceed
  }

  // 10) print result json to stdout (concise)
  const out = {
    snapshotPath: result.tar || null,
    summaryPath: result.summaryPath,
    metaPath: result.metaPath,
    sha256: result.sha256 || null,
    size: result.size || null,
    branch: result.branch,
    errors: result.errors || [],
    timestamp: result.timestamp,
  };

  // Write a short machine-readable file as well
  try {
    await fsPromises.writeFile(
      path.join(INCOMING_DIR, `snapshot-${TIMESTAMP}.result.json`),
      JSON.stringify(out, null, 2),
      "utf8",
    );
  } catch (err) {
    // ignore
  }

  console.log(JSON.stringify(out, null, 2));
  return out;
}

/* ESM-compatible "main" check and top-level invocation.
   In ESM we cannot use `require.main === module`. Detect if this
   module was executed directly by comparing import.meta.url to the
   file URL for process.argv[1], and only then run the snapshot.
*/
const __isMain = (() => {
  try {
    // process.argv[1] is the executed script path; convert to file URL and compare
    return import.meta.url === new URL(process.argv[1], "file:").href;
  } catch {
    return false;
  }
})();

if (__isMain) {
  try {
    await runSnapshot();
  } catch (err) {
    console.error("Fatal snapshot error:", String(err));
    process.exit(2);
  }
}
