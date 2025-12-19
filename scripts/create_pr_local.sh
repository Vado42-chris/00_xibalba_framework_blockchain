#!/usr/bin/env bash
#
# create_pr_local.sh
#
# Lightweight, safe publish helper for local-agent.
# Usage:
#   ./create_pr_local.sh [branch-name] [commit-message]
#
# Behavior:
# - By default the script runs in DRY-RUN mode (no git pushes or PR creation).
# - To perform the actual git push and attempt to open a draft PR, set RUN_REAL=1
#   in the environment before running (e.g. `RUN_REAL=1 ./create_pr_local.sh ...`).
# - The script will create a branch, stage changes, commit (if there are staged changes),
#   push the branch, and attempt to create a draft PR using the `gh` CLI if available.
#
# Safety notes:
# - You must opt in to real changes by setting RUN_REAL=1. This prevents accidental pushes.
# - The agent should run this under the local OS user who owns the git credentials.
# - If there are no changes to commit, the script will push the branch (if requested) but
#   will not create an empty commit by default.
#
set -euo pipefail

# Arguments
BRANCH_ARG="${1:-}"
MSG_ARG="${2:-Publish from local agent}"

# Default branch name if not provided
if [ -z "$BRANCH_ARG" ]; then
  BRANCH="$(printf 'publish/%s' "$(date -u +%Y%m%dT%H%M%SZ)")"
else
  BRANCH="$BRANCH_ARG"
fi

COMMIT_MSG="$MSG_ARG"

# Resolve repo root (two levels up from this script: scripts/ -> 00_xibalba_alpaca/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"

cd "$REPO_ROOT"

echo "[create_pr_local] repo: $REPO_ROOT"
echo "[create_pr_local] branch: $BRANCH"
echo "[create_pr_local] message: $COMMIT_MSG"
echo "[create_pr_local] RUN_REAL=${RUN_REAL:-<unset>}"
echo

# Basic checks
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[create_pr_local] ERROR: Not inside a git repository (cwd: $REPO_ROOT)"
  exit 2
fi

# Warn if running as root
if [ "$(id -u)" = "0" ]; then
  echo "[create_pr_local] WARNING: Running as root (UID 0). It's safer to run under your user account."
fi

echo "---- git status (porcelain) ----"
git status --porcelain || true
echo "--------------------------------"

# Show current branch and last commit
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '(detached)')"
echo "Current branch: $CURRENT_BRANCH"
echo "HEAD: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
echo

# What we will do
echo "Planned actions:"
echo " - create or checkout branch: $BRANCH"
echo " - stage all changes: git add -A"
echo " - commit with message: \"$COMMIT_MSG\" (only if there are staged changes)"
echo " - push: git push -u origin $BRANCH"
echo " - create draft PR via 'gh pr create' (if gh is installed and RUN_REAL=1)"
echo

if [ "${RUN_REAL:-}" != "1" ]; then
  echo "DRY RUN mode (default). To perform real actions set RUN_REAL=1 in the environment."
  echo
  echo "Would run the following commands:"
  echo "  git checkout -b \"$BRANCH\" || git checkout \"$BRANCH\""
  echo "  git add -A"
  echo "  # commit only if there are changes"
  echo "  git commit -m \"$COMMIT_MSG\""
  echo "  git push -u origin \"$BRANCH\""
  echo "  gh pr create --title \"$COMMIT_MSG\" --body \"Automated publish via local-agent\" --draft"
  echo
  echo "Exit without making changes."
  exit 0
fi

# ---- RUN_REAL == 1: perform operations ----
echo "RUN_REAL=1 -> performing git operations"

# create/checkout branch safely
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Branch $BRANCH already exists locally -> checking out"
  git checkout "$BRANCH"
else
  # try checkout remote branch if exists, else create new local branch
  if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
    echo "Remote branch origin/$BRANCH exists -> checking out remote branch"
    git fetch origin "$BRANCH":"$BRANCH"
    git checkout "$BRANCH"
  else
    echo "Creating new branch $BRANCH"
    git checkout -b "$BRANCH"
  fi
fi

# Stage all changes
echo "Staging all changes..."
git add -A

# Determine if there's anything to commit
if git diff --cached --quiet; then
  echo "No staged changes to commit."
  COMMITTED=0
else
  echo "Committing staged changes..."
  # Allow commit to succeed even if there's nothing to commit (race conditions)
  if git commit -m "$COMMIT_MSG"; then
    echo "Committed changes."
    COMMITTED=1
  else
    echo "git commit returned non-zero. Continuing..."
    COMMITTED=0
  fi
fi

# Push branch
echo "Pushing branch to origin..."
if git push -u origin "$BRANCH"; then
  echo "Push succeeded."
else
  echo "Push failed. Inspect the remote/credentials and try again."
  exit 3
fi

# Attempt to create a draft PR using GitHub CLI if available
if command -v gh >/dev/null 2>&1; then
  echo "Attempting to create draft PR via 'gh'..."
  set +e
  gh pr create --title "$COMMIT_MSG" --body "Automated publish via local-agent" --draft
  GH_EXIT=$?
  set -e
  if [ "$GH_EXIT" -eq 0 ]; then
    echo "Draft PR created (via gh)."
  else
    echo "gh pr create returned exit code $GH_EXIT. You may need to run 'gh auth login' or create the PR manually."
  fi
else
  echo "GitHub CLI 'gh' not found. To auto-create a PR, install the GitHub CLI and authenticate it (https://cli.github.com/)."
  # Try to print a suggestion URL if possible
  if git remote get-url origin >/dev/null 2>&1; then
    ORIGIN_URL="$(git remote get-url origin)"
    # Try to convert SSH URL to https if needed (simple heuristics)
    if printf "%s" "$ORIGIN_URL" | grep -qE "^git@"; then
      HTTPS_URL="$(printf "%s" "$ORIGIN_URL" | sed -E 's#git@([^:]+):#https://\\1/#; s#\\.git$##')"
    else
      HTTPS_URL="$(printf "%s" "$ORIGIN_URL" | sed -E 's#\\.git$##')"
    fi
    echo "You can open a PR at: ${HTTPS_URL}/pull/new/${BRANCH}"
  fi
fi

echo
echo "[create_pr_local] Done."
exit 0
