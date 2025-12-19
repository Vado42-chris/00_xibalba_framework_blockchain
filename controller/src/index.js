import express from "express";
import bodyParser from "body-parser";
import {
  getRepoClient,
  getBranchCommitSha,
  createBlob,
  createTree,
  createCommit,
  updateRef,
} from "./github.js";
import { verifySignature, handleWebhookEvent } from "./webhook.js";

const app = express();

// Keep the raw body available for webhook signature verification
app.use(
  bodyParser.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
    limit: "1mb",
  })
);

const PORT = process.env.PORT || 4000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

function safeLog(...args) {
  // Lightweight logger - replace with structured logger if needed
  console.log(new Date().toISOString(), ...args);
}

/**
 * POST /changes
 * Body:
 * {
 *   owner: "owner",
 *   repo: "repo",
 *   base: "main",
 *   files: [{ path: "file/path.txt", content: "..." }, ...],
 *   title: "Change title",
 *   request_id: "unique-id"
 * }
 *
 * Creates a branch, commits files via Git DB API, and opens a draft PR.
 */
app.post("/changes", async (req, res) => {
  try {
    const payload = req.body || {};
    const owner = payload.owner;
    const repo = payload.repo;
    const base = payload.base || process.env.DEFAULT_BASE_BRANCH || "main";
    const files = Array.isArray(payload.files) ? payload.files : [];
    const title = payload.title || `Automated change (${payload.request_id || Date.now()})`;
    const requestId = payload.request_id || null;

    if (!owner || !repo) {
      return res.status(400).json({ error: "owner and repo are required" });
    }
    if (!files.length) {
      return res.status(400).json({ error: "files array is required and must not be empty" });
    }

    safeLog("Received /changes request", { owner, repo, base, files: files.length, requestId });

    // Create Octokit client authenticated for this repo
    const octokit = await getRepoClient(owner, repo);

    // Get the base commit and tree
    const { commitSha: baseCommitSha, treeSha: baseTreeSha } = await getBranchCommitSha(
      octokit,
      owner,
      repo,
      base
    );

    // Create blobs and prepare tree entries
    const treeOps = [];
    for (const f of files) {
      if (!f.path || typeof f.content === "undefined") {
        return res
          .status(400)
          .json({ error: "each file must include 'path' and 'content' fields" });
      }
      const blobSha = await createBlob(octokit, owner, repo, f.content);
      treeOps.push({
        path: f.path,
        mode: "100644",
        type: "blob",
        sha: blobSha,
      });
    }

    // Create a new tree based on baseTreeSha
    const newTreeSha = await createTree(octokit, owner, repo, treeOps, baseTreeSha);

    // Create a commit
    const commitMessage = title;
    const newCommitSha = await createCommit(octokit, owner, repo, commitMessage, newTreeSha, [
      baseCommitSha,
    ]);

    // Create a new branch pointing to the new commit
    const branchName = `auto/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await updateRef(octokit, owner, repo, branchName, newCommitSha, true);

    // Create draft PR
    const prResp = await octokit.pulls.create({
      owner,
      repo,
      title: commitMessage,
      head: branchName,
      base,
      body: `Automated change requested${requestId ? ` (request_id=${requestId})` : ""}.`,
      draft: true,
    });

    safeLog("Draft PR created", { prUrl: prResp.data.html_url, prNumber: prResp.data.number });

    return res.json({
      prUrl: prResp.data.html_url,
      prNumber: prResp.data.number,
      branch: branchName,
    });
  } catch (err) {
    safeLog("Error in /changes:", err && err.message ? err.message : err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

/**
 * POST /webhook
 * GitHub App webhook receiver. Verifies signature and dispatches events.
 *
 * Expected events to handle:
 *  - workflow_run (completed -> success)
 *  - check_suite (completed -> success)
 *
 * The github client used inside handlers will be created per-repository as needed.
 */
app.post("/webhook", async (req, res) => {
  try {
    // Verify signature if secret configured
    if (WEBHOOK_SECRET && !verifySignature(req, WEBHOOK_SECRET)) {
      safeLog("Webhook signature verification failed");
      return res.status(401).send("Invalid signature");
    }

    const event = req.headers["x-github-event"];
    const payload = req.body || {};

    safeLog("Received webhook event", event);

    // Attempt to extract repo info for creating an octokit client
    const repository = payload.repository;
    let octokit = null;
    if (repository && repository.owner && repository.name) {
      try {
        octokit = await getRepoClient(repository.owner.login, repository.name);
      } catch (err) {
        // Non-fatal: some webhook payloads may not require repo-level actions
        safeLog("Could not create repo client for webhook handling:", err.message || err);
        octokit = null;
      }
    }

    // Delegate to webhook handler which knows how to process workflow_run/check_suite
    try {
      await handleWebhookEvent(octokit, event, payload);
    } catch (err) {
      safeLog("Error handling webhook event:", err && err.message ? err.message : err);
      // proceed to return 200 to ack the webhook; errors are logged and retriable by GitHub
    }

    return res.status(200).send("ok");
  } catch (err) {
    safeLog("Unhandled webhook processing error:", err && err.message ? err.message : err);
    return res.status(500).send("error");
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.listen(PORT, () => {
  safeLog(`Controller listening on port ${PORT}`);
});
