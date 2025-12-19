import crypto from "crypto";

/**
 * Verify GitHub webhook signature (HMAC SHA-256).
 * Expects the raw body to be available on `req.rawBody` (Buffer or string).
 * If no secret is provided, verification is skipped (returns true).
 *
 * @param {Object} req - Express request object with headers and rawBody
 * @param {string} secret - webhook secret
 * @returns {boolean}
 */
export function verifySignature(req, secret) {
  if (!secret || secret.length === 0) return true;

  const signature = req.headers["x-hub-signature-256"] || "";
  if (!signature.startsWith("sha256=")) return false;

  // rawBody should be the exact bytes GitHub sent. The server must set this in bodyParser.verify.
  const raw = req.rawBody;
  if (!raw) {
    // Fallback: try to stringify body (less safe)
    const fallback = JSON.stringify(req.body || "");
    const hmac = crypto.createHmac("sha256", secret).update(fallback).digest("hex");
    const expected = `sha256=${hmac}`;
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch (e) {
      return false;
    }
  }

  const hmac = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const expected = `sha256=${hmac}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch (e) {
    // If buffers are different lengths timingSafeEqual throws; treat as failure
    return false;
  }
}

/**
 * Given an Octokit client and a pull request object, check whether all required checks are successful.
 * If so, attempt to create an APPROVE review (best-effort) and merge the PR using squash.
 *
 * This function is conservative: it will not attempt to bypass branch protections or required reviews.
 *
 * @param {import("@octokit/rest").Octokit} octokit
 * @param {Object} pr - Pull request object (as returned by GitHub APIs)
 */
export async function tryMergePRIfChecksPass(octokit, pr) {
  try {
    const owner = pr.base.repo.owner.login;
    const repo = pr.base.repo.name;
    const prNumber = pr.number;
    const headSha = pr.head.sha;

    // Fetch check runs for the head sha
    const checksResp = await octokit.checks.listForRef({
      owner,
      repo,
      ref: headSha,
      per_page: 100,
    });

    const checkRuns = checksResp.data?.check_runs || [];
    // If there are no check runs, we should be conservative and not merge.
    if (checkRuns.length === 0) {
      console.log(`PR #${prNumber}: no check runs found for ref ${headSha}; skipping merge.`);
      return;
    }

    const allChecksSuccessful = checkRuns.every((c) => c.conclusion === "success");
    if (!allChecksSuccessful) {
      console.log(`PR #${prNumber}: not all check runs are successful; skipping merge.`);
      return;
    }

    // Optionally create an approval review (best-effort).
    try {
      await octokit.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        event: "APPROVE",
        body: "Auto-approval: all checks passed.",
      });
      console.log(`PR #${prNumber}: posted auto-approval review.`);
    } catch (err) {
      // This is non-fatal; approvals may be restricted by branch protection or app permissions.
      console.warn(`PR #${prNumber}: could not create review (non-fatal): ${err.message || err}`);
    }

    // Attempt to merge (squash). If merge fails due to branch protection, permissions, or conflicts, log and exit.
    try {
      const mergeResp = await octokit.pulls.merge({
        owner,
        repo,
        pull_number: prNumber,
        merge_method: "squash",
        commit_title: `Auto-merge PR #${prNumber}`,
      });
      if (mergeResp.data?.merged) {
        console.log(`PR #${prNumber}: merged successfully.`);
      } else {
        console.warn(`PR #${prNumber}: merge returned non-merged response: ${JSON.stringify(mergeResp.data)}`);
      }
    } catch (err) {
      console.error(`PR #${prNumber}: merge failed: ${err.message || err}`);
    }
  } catch (err) {
    console.error("tryMergePRIfChecksPass error:", err);
  }
}

/**
 * Handle incoming GitHub webhook events relevant to CI completion.
 * Supported events:
 *  - workflow_run (when a workflow completes)
 *  - check_suite (when a check suite completes)
 *
 * The function expects an authenticated Octokit client if it needs to list associated PRs.
 *
 * @param {import("@octokit/rest").Octokit|null} octokit - authenticated client for repo operations (may be null for events without repo)
 * @param {string} event - the GitHub event name from X-GitHub-Event header
 * @param {Object} payload - parsed webhook payload
 */
export async function handleWebhookEvent(octokit, event, payload) {
  try {
    if (!event || !payload) {
      console.warn("handleWebhookEvent: missing event or payload");
      return;
    }

    // workflow_run: triggered when a GitHub Actions workflow run changes state.
    if (event === "workflow_run") {
      const action = payload.action;
      const workflowRun = payload.workflow_run;
      if (action === "completed" && workflowRun && workflowRun.conclusion === "success") {
        const pullRequests = workflowRun.pull_requests || [];
        if (pullRequests.length === 0) {
          console.log("workflow_run.completed: no associated PRs; nothing to merge.");
          return;
        }
        for (const pr of pullRequests) {
          if (!octokit) {
            console.warn("No octokit client available to act on PRs.");
            continue;
          }
          await tryMergePRIfChecksPass(octokit, pr);
        }
      }
      return;
    }

    // check_suite: triggered when a check suite completes (aggregates check runs)
    if (event === "check_suite") {
      const action = payload.action;
      const checkSuite = payload.check_suite;
      if (action === "completed" && checkSuite && checkSuite.conclusion === "success") {
        // find PRs associated with this head SHA
        const headSha = checkSuite.head_sha;
        const repository = payload.repository;
        if (!repository) {
          console.warn("check_suite completed but payload missing repository info.");
          return;
        }
        const owner = repository.owner?.login;
        const repo = repository.name;
        if (!owner || !repo) {
          console.warn("check_suite: missing owner/repo.");
          return;
        }
        if (!octokit) {
          // create an octokit client if needed would require auth; caller should pass one.
          console.warn("No octokit client available for check_suite handling.");
          return;
        }

        // List PRs associated with commit
        try {
          const prsResp = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
            owner,
            repo,
            commit_sha: headSha,
          });
          const prs = prsResp.data || [];
          if (prs.length === 0) {
            console.log(`check_suite: no PRs associated with commit ${headSha}`);
            return;
          }
          for (const pr of prs) {
            await tryMergePRIfChecksPass(octokit, pr);
          }
        } catch (err) {
          console.error("Error listing PRs associated with commit:", err);
        }
      }
      return;
    }

    // Fallback: ignore other events
    console.log(`Unhandled webhook event: ${event}`);
  } catch (err) {
    console.error("handleWebhookEvent error:", err);
  }
}

export default {
  verifySignature,
  handleWebhookEvent,
  tryMergePRIfChecksPass,
};
