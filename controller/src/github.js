import jwt from "jsonwebtoken";
import { Octokit } from "@octokit/rest";

/**
 * GitHub helpers for the Controller service.
 *
 * Exports:
 *  - createAppJWT()
 *  - getInstallationTokenForRepo(owner, repo)
 *  - getRepoClient(owner, repo)
 *  - getBranchCommitSha(octokit, owner, repo, branch)
 *  - createBlob(octokit, owner, repo, content)
 *  - createTree(octokit, owner, repo, treeOps, baseTree)
 *  - createCommit(octokit, owner, repo, message, treeSha, parents)
 *  - updateRef(octokit, owner, repo, refName, commitSha, createIfMissing=false)
 *
 * Notes:
 *  - The module prefers GitHub App auth (GH_APP_ID + GH_APP_PRIVATE_KEY).
 *  - For local testing a GITHUB_TOKEN env var can be used instead (not for prod).
 */

// Environment helpers
const GH_APP_ID = process.env.GH_APP_ID;
const GH_APP_PRIVATE_KEY = process.env.GH_APP_PRIVATE_KEY;
const DEFAULT_TIMEOUT = 60_000;

/**
 * Create a short-lived JWT for the GitHub App.
 * Used to request installation access tokens.
 */
export function createAppJWT() {
  if (!GH_APP_ID || !GH_APP_PRIVATE_KEY) {
    throw new Error("GH_APP_ID and GH_APP_PRIVATE_KEY must be set to use GitHub App authentication");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 540, // 9 minutes
    iss: GH_APP_ID,
  };

  return jwt.sign(payload, GH_APP_PRIVATE_KEY, { algorithm: "RS256" });
}

/**
 * Given an owner/repo, obtain an installation access token.
 * Uses the App JWT to call the GitHub App endpoints.
 */
export async function getInstallationTokenForRepo(owner, repo) {
  if (!owner || !repo) throw new Error("owner and repo required");

  // Use App JWT to list/get installation
  const appOctokit = new Octokit({
    auth: createAppJWT(),
    request: { timeout: DEFAULT_TIMEOUT },
  });

  // Get installation for this repository
  const installResp = await appOctokit.request("GET /repos/{owner}/{repo}/installation", {
    owner,
    repo,
  });

  const installationId = installResp.data?.id;
  if (!installationId) throw new Error("Could not determine installation ID for repository");

  // Create installation access token
  const tokenResp = await appOctokit.request("POST /app/installations/{installation_id}/access_tokens", {
    installation_id: installationId,
  });

  const token = tokenResp.data?.token;
  if (!token) throw new Error("Failed to create installation token");

  return token;
}

/**
 * Return an Octokit client authenticated for repository operations.
 * Prefers GITHUB_TOKEN env for simple testing; otherwise uses App installation token.
 */
export async function getRepoClient(owner, repo) {
  if (process.env.GITHUB_TOKEN) {
    return new Octokit({ auth: process.env.GITHUB_TOKEN, request: { timeout: DEFAULT_TIMEOUT } });
  }
  const token = await getInstallationTokenForRepo(owner, repo);
  return new Octokit({ auth: token, request: { timeout: DEFAULT_TIMEOUT } });
}

/**
 * Get the current commit SHA and tree SHA for the given branch.
 * Returns { commitSha, treeSha }.
 */
export async function getBranchCommitSha(octokit, owner, repo, branch = "main") {
  if (!octokit) throw new Error("octokit client required");
  // getRef expects ref like 'heads/branch'
  const ref = `heads/${branch}`;
  const refResp = await octokit.repos.getRef({ owner, repo, ref });
  const commitSha = refResp.data.object.sha;

  // Fetch commit to obtain tree sha
  const commitResp = await octokit.repos.getCommit({ owner, repo, ref: commitSha });
  const treeSha = commitResp.data.commit.tree.sha;

  return { commitSha, treeSha };
}

/**
 * Create a blob for file content. Content will be base64 encoded.
 * Returns the blob SHA.
 */
export async function createBlob(octokit, owner, repo, content) {
  if (!octokit) throw new Error("octokit client required");
  // GitHub API allows passing raw content or base64 with encoding flag
  const resp = await octokit.git.createBlob({
    owner,
    repo,
    content: Buffer.from(String(content)).toString("base64"),
    encoding: "base64",
  });
  return resp.data.sha;
}

/**
 * Create a tree from treeOps array and optional baseTree.
 * treeOps example: [{ path: "file.txt", mode: "100644", type: "blob", sha: "..." }]
 * Returns the new tree SHA.
 */
export async function createTree(octokit, owner, repo, treeOps = [], baseTree = undefined) {
  if (!octokit) throw new Error("octokit client required");
  const params = {
    owner,
    repo,
    tree: treeOps,
  };
  if (baseTree) params.base_tree = baseTree;

  const resp = await octokit.git.createTree(params);
  return resp.data.sha;
}

/**
 * Create a commit given a tree SHA and parent commit(s).
 * Returns the commit SHA.
 */
export async function createCommit(octokit, owner, repo, message, treeSha, parents = []) {
  if (!octokit) throw new Error("octokit client required");
  const resp = await octokit.git.createCommit({
    owner,
    repo,
    message: String(message || "Automated commit"),
    tree: treeSha,
    parents,
  });
  return resp.data.sha;
}

/**
 * Update a ref to point to commitSha. If createIfMissing is true, create the ref when it doesn't exist.
 * refName should be a branch name like 'auto/123abc' (without refs/heads/).
 */
export async function updateRef(octokit, owner, repo, refName, commitSha, createIfMissing = false) {
  if (!octokit) throw new Error("octokit client required");
  const fullRef = `refs/heads/${refName}`;
  try {
    const resp = await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${refName}`, // octokit expects the ref parameter as 'heads/branch'
      sha: commitSha,
      force: false,
    });
    return resp.data;
  } catch (err) {
    // If not found and createIfMissing -> create ref
    const isNotFound = err?.status === 404 || String(err).toLowerCase().includes("not found");
    if (isNotFound && createIfMissing) {
      const createResp = await octokit.git.createRef({
        owner,
        repo,
        ref: fullRef,
        sha: commitSha,
      });
      return createResp.data;
    }
    // rethrow
    throw err;
  }
}
