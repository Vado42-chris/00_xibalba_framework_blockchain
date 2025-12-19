# Controller — README

A minimal GitHub App controller used to automate draft PR creation, CI monitoring, and auto-merge for white-label workflows.

Purpose
- Accept change requests from a UI or agent.
- Create a branch and commit files using the Git Database API.
- Open a draft pull request.
- Monitor CI (via webhooks), and auto-approve + merge when required checks pass.
- Provide a safe, auditable, reversible automation surface for tenant deployments.

Contents
- `controller/src/` — controller implementation (API, GitHub helpers, webhook handler)
- `.env.example` — environment examples
- `scripts/run-local.sh` — local helper script
- `README.md` (this file)

Quick summary
- API endpoints:
  - `POST /changes` — create branch, commit files, open draft PR
  - `POST /webhook` — GitHub App webhook receiver (workflow_run, check_suite)
  - `GET  /health` — simple healthcheck
- Auth: GitHub App (JWT → installation token). For local testing `GITHUB_TOKEN` can be used (not for production).

Prerequisites
- Node.js 18+ (or LTS)
- Git configured with push access to the target repo
- GitHub App created and installed on your target repo/org (see GitHub App Setup below)
- (Optional, recommended) GitHub CLI (`gh`) for creating PRs from the machine

Create & run locally (quickstart)
1. Copy env example:
```00_xibalba_alpaca/controller/README.md#L1-8
cp controller/.env.example controller/.env
# Edit controller/.env and add GH_APP_ID and GH_APP_PRIVATE_KEY (or use GITHUB_TOKEN for quick tests)
```

2. Install dependencies and start:
```00_xibalba_alpaca/controller/README.md#L9-16
cd controller
npm ci
npm start
# Controller listens on PORT (default 4000)
```

Environment variables
Add these to `controller/.env` (do NOT commit real secrets):

```00_xibalba_alpaca/controller/README.md#L17-30
PORT=4000
# GitHub App (preferred)
GH_APP_ID=12345
GH_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
# Optional (local testing only)
# GITHUB_TOKEN=ghp_xxx
# Webhook HMAC secret (set the same value in the GitHub App webhook settings)
WEBHOOK_SECRET=change-this-secret
# Default base branch for PRs
DEFAULT_BASE_BRANCH=main
```

Controller API

- POST /changes
  - Creates a branch, commits the provided files, and opens a draft pull request.
  - Body (JSON):
```00_xibalba_alpaca/controller/README.md#L31-48
{
  "owner": "repo-owner",
  "repo": "repo-name",
  "base": "main",                         // optional, defaults to DEFAULT_BASE_BRANCH
  "files": [
    { "path": "public/healthcheck.txt", "content": "automation live" }
  ],
  "title": "Update branding assets",
  "request_id": "unique-request-id",
  "tenant_id": "tenant-123"
}
```
  - Success response:
```00_xibalba_alpaca/controller/README.md#L49-54
{
  "prUrl": "https://github.com/owner/repo/pull/123",
  "prNumber": 123,
  "branch": "auto/xyz123"
}
```

- POST /webhook
  - GitHub App webhook endpoint. Configure the App webhook URL to: `https://<controller-host>/webhook`.
  - Verifies HMAC with `WEBHOOK_SECRET`.
  - Handles: `workflow_run.completed` and `check_suite.completed` (when conclusion is `success`) to trigger auto-merge attempt.

- GET /health
  - Returns `{ status: "ok", uptime: <seconds> }`.

GitHub App setup (permissions)
Create a GitHub App (upload or use the provided manifest) with the following minimal permissions:
- Repository contents: Read & Write
- Pull requests: Read & Write
- Checks: Read & Write
- Actions / Workflows: Read
- Webhook events: subscribe to `workflow_run`, `check_suite`, and `pull_request` (optional)

Security & governance
- Use a GitHub App — do not rely on long-lived personal tokens in production.
- Store `GH_APP_PRIVATE_KEY` in a secure secrets manager (vault, cloud secret store or GitHub Secrets for Actions).
- Verify webhook HMAC signatures with `WEBHOOK_SECRET`.
- Do not allow direct commits to `main`; use branch-protection policies.
- Keep an audit trail: log request IDs, tenant IDs, commit SHAs and PR URLs.

Webhook configuration
- Payload URL: `https://<controller-host>/webhook`
- Content type: `application/json`
- Secret: same as `WEBHOOK_SECRET`
- Events: `workflow_run`, `check_suite` (and `pull_request` if you want additional hooks)

Example: Create a change via curl
```00_xibalba_alpaca/controller/README.md#L55-67
curl -X POST http://localhost:4000/changes \
  -H "Content-Type: application/json" \
  -d '{
    "owner":"Vado42-chris",
    "repo":"00_xibalba_framework_blockchain",
    "files":[{"path":"public/healthcheck.txt","content":"automation live"}],
    "title":"Automation system live test",
    "request_id":"test-001"
  }'
```

Local testing tips
- For rapid local testing you can set `GITHUB_TOKEN` in `.env` (personal token with repo scope). This is not recommended for production.
- Use `ngrok` or similar to expose a local `https` endpoint for GitHub App webhooks while developing.
- `gh` CLI can be used to manually create PRs when needed:
```00_xibalba_alpaca/controller/README.md#L68-72
gh pr create --title "Test PR" --body "Testing" --base main --head safety/add-controller-automation --draft
```

Logging & troubleshooting
- Controller prints minimal logs to stdout. If running as a service, redirect logs to a file or a log aggregator.
- Common issues:
  - "Could not determine installation ID": App not installed in the target repo/org.
  - "Signature verification failed": `WEBHOOK_SECRET` mismatch.
  - "Insufficient permissions": ensure App has required repository permissions and installation grants.

Deploy guidance
- Deploy the controller to an environment with a stable public HTTPS endpoint (required for GitHub App webhooks).
- Use a process manager (systemd, pm2, or Docker) to ensure restarts.
- Do not store `GH_APP_PRIVATE_KEY` in the repo — use environment variables or secrets manager in production.

CI / Dry-run deploy integration
- This controller intentionally opens draft PRs and waits for CI to pass before attempting merge.
- Keep branch protection rules in your repo; if auto-merge requires the App to be a reviewer, ensure App is authorized or adjust policies appropriately.
- For white-label deployments, produce build artifacts in CI and use per-tenant deploy scripts (rsync or artifact push). Always run `rsync --dry-run` first to verify mappings.

Contributing
- Keep the controller focused: small, well-tested changes only.
- Add unit tests for helper functions where possible.
- Use consistent logging and add metrics (request count, PR created, merges, errors) if running at scale.

License
- MIT (or change to your project's preferred license)

Contact / support
- If you need help configuring the GitHub App, webhook, or running the controller, paste logs from the controller (`/tmp/controller.log` or systemd journal) and the last 100 lines of the failing GitHub Actions job — I will triage.

----
END