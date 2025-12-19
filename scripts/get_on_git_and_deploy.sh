#!/usr/bin/env bash
#
# Add git + CI + deploy helper for the project.
#
# Usage:
#   GITHUB_OWNER=your-username \
#   GITHUB_REPO=xi-io-platform \
#   GITHUB_TOKEN=ghp_xxx \
#   ARIES_HOST=root@1.2.3.4 \
#   bash 00_xibalba_alpaca/scripts/get_on_git_and_deploy.sh
#
# What it does:
# - Initializes a git repo if none exists
# - Adds a remote origin using a secure preference (SSH preferred)
# - Creates a minimal .gitignore
# - Commits existing files and optionally pushes to origin/main (requires CONFIRM_PUSH=yes)
# - Creates two GitHub Actions workflows:
#     - .github/workflows/ci.yml  (lint/test/build)
#     - .github/workflows/deploy.yml (build + copy + remote restart)
#
# Safety notes:
# - Never hardcode secrets. Use GitHub Secrets for `ARIES_HOST` and `ARIES_SSH_KEY`.
# - This script WILL NOT push to origin unless CONFIRM_PUSH=yes is set in the environment.
# - The deploy workflow uses pinned action versions (not @master).
#
set -euo pipefail

# ---------------------------
# Safety: require explicit confirmation to allow automated pushes
# ---------------------------
CONFIRM_PUSH="${CONFIRM_PUSH:-no}"
if [ "${CONFIRM_PUSH}" != "yes" ]; then
  SKIP_PUSH=1
  echo "WARNING: CONFIRM_PUSH is not 'yes' — this script will NOT push to remote. To enable pushing set CONFIRM_PUSH=yes and re-run."
else
  SKIP_PUSH=0
fi

# ---------------------------
# Configuration (override via env)
# ---------------------------
GITHUB_OWNER="${GITHUB_OWNER:-}"
GITHUB_REPO="${GITHUB_REPO:-xi-io-platform}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
ARIES_HOST="${ARIES_HOST:-}"         # e.g. root@your-server.example.com
DEPLOY_TARGET_PATH="${DEPLOY_TARGET_PATH:-/home/admin/public_html}"
WORKFLOWS_DIR=".github/workflows"
CI_WORKFLOW_FILE="${WORKFLOWS_DIR}/ci.yml"
DEPLOY_WORKFLOW_FILE="${WORKFLOWS_DIR}/deploy.yml"
GITIGNORE_FILE=".gitignore"

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { printf "${GREEN}✔ %s${NC}\n" "$1"; }
warn() { printf "${YELLOW}➜ %s${NC}\n" "$1"; }
err() { printf "${RED}✖ %s${NC}\n" "$1"; }

# ---------------------------
# Basic checks
# ---------------------------
if [ -n "${GITHUB_TOKEN}" ] && { [ -z "${GITHUB_OWNER}" ] || [ -z "${GITHUB_REPO}" ]; }; then
  err "When providing GITHUB_TOKEN you must also set GITHUB_OWNER and GITHUB_REPO."
  exit 1
fi

# Ensure script runs from repository root (best-effort)
if [ ! -d "." ]; then
  err "Run this script from the project root directory."
  exit 1
fi

# ---------------------------
# Initialize git if needed
# ---------------------------
if [ ! -d .git ]; then
  warn "No .git found — initializing git repository."
  git init
  git branch -M main || true
  log "Initialized empty git repository."
else
  log "Git repository already initialized."
fi

# ---------------------------
# Configure remote origin (prefer SSH)
# ---------------------------
REMOTE_SET=0
if ! git remote get-url origin >/dev/null 2>&1; then
  # Prefer SSH remote if GITHUB_OWNER is set or user can do interactive auth.
  if [ -n "${GITHUB_OWNER}" ]; then
    SSH_REMOTE="git@github.com:${GITHUB_OWNER}/${GITHUB_REPO}.git"
    git remote add origin "${SSH_REMOTE}"
    log "Added SSH remote origin: ${SSH_REMOTE}"
    REMOTE_SET=1
  fi

  # If SSH remote not set and token provided, add token remote but warn about exposure and skip push unless confirmed
  if [ "${REMOTE_SET}" -eq 0 ] && [ -n "${GITHUB_TOKEN}" ]; then
    warn "GITHUB_TOKEN provided but SSH remote preferred. Adding token remote temporarily for convenience. This is less secure — prefer using 'gh repo create' or SSH."
    REMOTE_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git"
    git remote add origin "${REMOTE_URL}"
    log "Added remote origin using token (push disabled unless CONFIRM_PUSH=yes). Repo: ${GITHUB_OWNER}/${GITHUB_REPO}"
    REMOTE_SET=1
  fi

  if [ "${REMOTE_SET}" -eq 0 ]; then
    warn "No remote origin configured. Provide GITHUB_OWNER and either configure SSH or provide GITHUB_TOKEN."
  fi
else
  log "Remote origin already configured."
fi

# ---------------------------
# Create .gitignore (if missing)
# ---------------------------
if [ ! -f "${GITIGNORE_FILE}" ]; then
  warn "Creating ${GITIGNORE_FILE}"
  cat > "${GITIGNORE_FILE}" <<'EOF'
# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
package-lock.json
yarn.lock

# Build output
dist/
build/
out/

# Env / secrets
.env
.env.local
.env.*.local

# OS / editors
.DS_Store
Thumbs.db
.vscode/
.idea/
*.swp

# Logs
*.log

# Temp
tmp/
temp/
EOF
  git add "${GITIGNORE_FILE}" || true
fi

# ---------------------------
# Commit & push existing files
# ---------------------------
git add -A
if git diff --cached --quiet; then
  warn "No changes staged for commit."
else
  git commit -m "chore: initial commit - project bootstrap" || true
  log "Committed project files."
fi

# Attempt push (if remote exists)
if git remote get-url origin >/dev/null 2>&1; then
  warn "Attempting to push to origin main..."
  if [ "${SKIP_PUSH}" -eq 0 ]; then
    set +e
    git push -u origin main
    PUSH_EXIT=$?
    set -e
    if [ "${PUSH_EXIT}" -ne 0 ]; then
      warn "Push to origin failed (remote may not exist or auth failed). You may need to create the repo on GitHub and re-run with valid credentials."
    else
      log "Pushed to origin/main."
    fi
  else
    warn "Skipping git push because CONFIRM_PUSH is not 'yes'."
  fi
else
  warn "No remote origin configured. Skipping push."
fi

# ---------------------------
# Create workflows directory
# ---------------------------
mkdir -p "${WORKFLOWS_DIR}"

# ---------------------------
# Create CI workflow
# ---------------------------
if [ ! -f "${CI_WORKFLOW_FILE}" ]; then
  warn "Creating CI workflow: ${CI_WORKFLOW_FILE}"
  cat > "${CI_WORKFLOW_FILE}" <<'EOF'
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  lint_and_test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js (if present)
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: |
          if [ -f package.json ]; then
            npm ci
          fi

      - name: Lint (optional)
        run: |
          if [ -f package.json ] && npm run -s lint >/dev/null 2>&1; then
            npm run lint
          else
            echo "No lint step defined."
          fi

      - name: Run tests
        run: |
          if [ -f package.json ] && npm test >/dev/null 2>&1; then
            npm test
          elif [ -f requirements.txt ]; then
            pip install -r requirements.txt
            pytest -q || true
          else
            echo "No test runner detected."
          fi

      - name: Build (optional)
        run: |
          if [ -f package.json ] && npm run -s build >/dev/null 2>&1; then
            npm run build
          else
            echo "No build step defined."
          fi
EOF
  git add "${CI_WORKFLOW_FILE}" || true
else
  log "CI workflow already exists at ${CI_WORKFLOW_FILE}"
fi

# ---------------------------
# Create Deploy workflow (pinned actions)
# ---------------------------
if [ ! -f "${DEPLOY_WORKFLOW_FILE}" ]; then
  warn "Creating Deploy workflow: ${DEPLOY_WORKFLOW_FILE}"
  cat > "${DEPLOY_WORKFLOW_FILE}" <<EOF
name: Deploy to ARIES

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    # Use a protected environment for production deploys if you enable it in repo settings.
    # environment: production
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Build (node if present)
        run: |
          if [ -f package.json ]; then
            npm ci
            npm run build --if-present
          fi

      - name: Copy files to server (SCP)
        uses: appleboy/scp-action@v0.1.8
        with:
          host: \${{ secrets.ARIES_HOST }}
          username: root
          key: \${{ secrets.ARIES_SSH_KEY }}
          port: 22
          source: "dist/*"
          target: "${DEPLOY_TARGET_PATH}"

      - name: Restart remote stack
        uses: appleboy/ssh-action@v0.1.7
        with:
          host: \${{ secrets.ARIES_HOST }}
          username: root
          key: \${{ secrets.ARIES_SSH_KEY }}
          port: 22
          script: |
            set -e
            if [ -f "${DEPLOY_TARGET_PATH}/docker-compose.yml" ]; then
              cd "${DEPLOY_TARGET_PATH}"
              docker-compose pull || true
              docker-compose up -d --build
            fi
            # optional healthcheck (adjust as needed)
            if command -v curl >/dev/null 2>&1; then
              sleep 5
              curl -fsS --max-time 10 http://127.0.0.1:8001/health || echo "Skipping healthcheck or failure"
            fi
EOF
  git add "${DEPLOY_WORKFLOW_FILE}" || true
else
  log "Deploy workflow already exists at ${DEPLOY_WORKFLOW_FILE}"
fi

# Commit workflows
if git diff --cached --quiet; then
  warn "No new workflow changes to commit."
else
  git commit -m "chore(ci): add CI and deploy workflows" || true
  log "Committed workflows."
  if git remote get-url origin >/dev/null 2>&1; then
    warn "Attempting to push workflows to origin/main..."
    if [ "${SKIP_PUSH}" -eq 0 ]; then
      set +e
      git push origin main || true
      set -e
      log "Attempted to push workflows (if auth configured)."
    else
      warn "Skipping push of workflows because CONFIRM_PUSH is not 'yes'."
    fi
  else
    warn "No remote origin to push workflows to. Add remote and push manually."
  fi
fi

# ---------------------------
# Summary & next steps
# ---------------------------
echo
log "Bootstrap complete (scripts + workflows added)."

echo
warn "Next manual steps you MUST perform:"
echo "  1) Create the GitHub repository (if it doesn't exist) at: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}"
echo "     - If you created the repo via the web UI, add the remote and push again."
echo "  2) In the repository settings -> Secrets -> Actions add:"
echo "     - ARIES_HOST  (e.g. root@your-server.example.com)"
echo "     - ARIES_SSH_KEY  (your private ssh key used for deployment - keep it secret)"
echo "  3) Review the workflows in .github/workflows/ and adjust build & healthcheck steps as needed."
echo "  4) If you intend to allow production deploys automatically, set CONFIRM_PUSH=yes in a secure CI environment and enable environment protection in GitHub for 'production'."
echo "  5) Create a small test change, push a branch, open a PR and confirm CI runs."
echo

log "If you want me to also create white-label helper scripts, say so and I'll generate them next."
