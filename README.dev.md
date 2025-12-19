# Xibalba — Local Development & Smoke Test

This document provides a minimal, reliable workflow to run the orchestrator API, worker (hybrid-capable), and hybrid-agent locally so you can iterate from your editor (Zed, VS Code, etc.) and finish the UI integration.

Follow each section in order. If something fails, capture the last ~200 lines from the failing terminal and paste them into your issue or support chat.

---

## Prerequisites

- Python 3.10+ and `python3` in PATH
- Node 16+ (only if you plan to run the `hybrid-agent` locally)
- `git`, `curl`, and optionally `jq` (for pretty JSON output)
- (Optional) Docker & Docker Compose if you prefer containerized local stack
- Editor: any (Zed, VS Code, JetBrains). The steps below work in integrated terminals.

---

## Quick local smoke test (recommended)

1. Make the installer executable and run it (one-liner)
```00_xibalba_alpaca/README.dev.md#L1-200
chmod +x 00_xibalba_alpaca/install-and-run-worker-local.sh
./00_xibalba_alpaca/install-and-run-worker-local.sh
```

The installer ensures `requests` is available for the worker and prints the exact commands to run the stack locally.

2. Start the services (each in its own terminal)

- Terminal A — API:
```00_xibalba_alpaca/README.dev.md#L1-200
uvicorn 00_xibalba_alpaca/orchestrator/api/main:app --reload --host 127.0.0.1 --port 8001
```

- Terminal B — hybrid-agent (optional; run only if you have Node and want to test hybrid mode):
```00_xibalba_alpaca/README.dev.md#L1-200
node hybrid-agent/hybrid-agent.js --queue hybrid-queue --results hybrid-results
```

- Terminal C — worker (hybrid mode):
```00_xibalba_alpaca/README.dev.md#L1-200
python3 00_xibalba_alpaca/orchestrator/worker/worker.py --api http://127.0.0.1:8001 --worker-id local1 --hybrid-queue hybrid-queue --hybrid-results hybrid-results
```

If you do not have the hybrid-agent available, run the worker in local/dev mode:
```00_xibalba_alpaca/README.dev.md#L1-200
python3 00_xibalba_alpaca/orchestrator/worker/worker.py --api http://127.0.0.1:8001 --worker-id local1
```

3. Enqueue a test job (Terminal D — run once API is up)
```00_xibalba_alpaca/README.dev.md#L1-200
curl -s -X POST http://127.0.0.1:8001/jobs \
  -H "Content-Type: application/json" \
  -d '{"repo":"local/test","ref":"test","runtime":"container","command":["/bin/echo","hello"],"env":{},"timeout_seconds":60}' | jq .
```

Expected outcome:
- API returns a JSON job object (includes `id`/`job_id`).
- In hybrid mode: worker writes `hybrid-queue/<job_id>.cmd` and waits for `hybrid-results/<job_id>.result`.
- Hybrid-agent (if running) reads the `.cmd` and writes `.result`. Worker posts logs and completion back to API.
- In local mode: worker executes the command and posts results to API.

---

## Simulate hybrid-agent results manually

If you run the worker in hybrid mode but don't have the Node hybrid-agent, you can fake agent results:

1. After the worker creates `hybrid-queue/<job_id>.cmd`, create results:
```00_xibalba_alpaca/README.dev.md#L1-200
mkdir -p hybrid-results
cat > hybrid-results/<job_id>.result <<'JSON'
{"exitCode":0,"stdout":"hello\n","stderr":""}
JSON
```

2. The worker will detect the result file and proceed with log delivery / completion.

---

## Optional quick checks

Run these checks before or during debugging:
```00_xibalba_alpaca/README.dev.md#L1-200
python3 -m py_compile 00_xibalba_alpaca/orchestrator/worker/worker.py
python3 -m pip install --user requests
```

---

## Docker Compose (one-command local stack)

If you prefer containers, create (or use) `docker-compose.yml` and run:
```00_xibalba_alpaca/README.dev.md#L1-200
docker-compose up --build
```

This should expose the API at `http://127.0.0.1:8001` and run the worker and hybrid-agent inside containers. Use `docker-compose logs -f` to watch outputs.

---

## Editor (Zed / VS Code) quick tips

- Open the repo in Zed or VS Code.
- Use integrated terminals to run the API and worker commands above.
- If you want one-click runs, add basic launch/tasks for uvicorn and the worker (see earlier `.vscode/launch.json` examples used by the team).
- When using Zed to edit the UI that calls the orchestrator, point your editor/test client to `http://127.0.0.1:8001` and use the same `/jobs` payload format above.

---

## CI & branch protection (recap)

- CI workflow (lint + matrix tests) is added at `.github/workflows/ci.yml`.
- After a successful run for `CI / test` and `CI / lint`, run the prepared branch-protection command to require those checks on `main`.
- If lint produces many failures initially, you can start with "CI / test" only, fix lint locally, then tighten protection to include lint.

---

## Troubleshooting — what to paste here

If anything fails, paste:
- Last ~200 lines of the failing terminal (API, worker, or hybrid-agent). Example: `tail -n 200 /path/to/log` or copy your terminal buffer.
- If the job enqueue fails, paste the full curl response (body + HTTP status).
- If a GitHub Actions step fails while setting protection, paste the full API response/error.

What I will provide once you paste logs:
- 1–2 line diagnosis and exact copy/paste commands to fix the issue.

---

## Security & recommended best practices

- Do NOT run untrusted production jobs on your host. Use hybrid mode with a sandboxed agent that enforces whitelists and resource limits.
- Use `--worker-secret` / `WORKER_SECRET` so workers send `X-WORKER-SECRET` to the API for authenticated requests.
- Use `--hybrid-secret` / a SECRET_TOKEN in `.cmd` file to authenticate agent handoffs.
- Keep `.venv`, `hybrid-results`, and local caches out of the repository via `.gitignore`.

---

## Next steps (MVP checklist)

1. Run the installer and create the `ci/add-workflow` PR so CI runs and registers checks.
2. Start the API and worker locally and run the smoke test above.
3. If you plan to use Zed for UI work: configure the editor to POST the job payload shown above and verify the job round-trip works.
4. If everything passes, apply branch protection (require `CI / test` and `CI / lint`) using the provided gh/curl commands.

---

If you'd like, I can:
- Produce a ready-to-run `docker-compose.yml`, `Dockerfile.*`, and `.env.example` files and open a PR for you. Reply with: `Create patch & open PR for Local Dev Stack`.
- Output a small sample client snippet (JS or Python) you can load into your Zed UI to call `/jobs`. Reply with: `Show sample DAM client: python` or `...: javascript`.

You’re ready to run the smoke test — run the installer and the API + worker commands above, then paste the job response or any failing terminal output and I’ll assist immediately.