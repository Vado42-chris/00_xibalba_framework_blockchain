#!/bin/sh
# CI Fetch Helper
# Prints a single-line result identifying the latest workflow run URL for a branch,
# or a small machine-readable status token if no run / no credentials are available.
#
# Usage:
#   ./ci_fetch_helper.sh                      # uses defaults (repo & branch set below)
#   REPO=org/repo BRANCH=my-branch ./ci_fetch_helper.sh
#   GITHUB_TOKEN=... ./ci_fetch_helper.sh     # if gh is not available, uses token
#
# Environment variables:
#   REPO   - repository in the form owner/name (default: Vado42-chris/00_xibalba_framework_blockchain)
#   BRANCH - branch name to filter runs by (default: safety/add-controller-automation)
#   GITHUB_TOKEN - personal/access token for GitHub API fallback (do NOT echo or paste token here)
#
# Output (single line):
#   - a workflow run URL (e.g. https://github.com/owner/repo/actions/runs/123456789)
#   - NO_RUN                (no runs found for the branch)
#   - NO_GH_AND_NO_TOKEN    (neither an authenticated CLI nor a token is available)
#   - ERR:<short message>   (unexpected error; check stderr/logs)
#
# Notes:
# - This script prefers the authenticated CLI if available. If that fails or is unauthenticated,
#   it falls back to the GitHub REST API using GITHUB_TOKEN.
# - The script is careful to produce exactly one line of useful output for automated callers.

set -eu

# Defaults (override by exporting env variables)
: "${REPO:=Vado42-chris/00_xibalba_framework_blockchain}"
: "${BRANCH:=safety/add-controller-automation}"

# Simple helper: print to stderr
_echo_err() { printf '%s\n' "$*" >&2; }

# Try to fetch using gh CLI (preferred)
_try_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    return 1
  fi

  # Attempt to list runs and filter by head_branch.
  # Suppress stderr from gh to keep output clean.
  # Depending on gh auth state, this may exit non-zero.
  output=$(gh run list --repo "$REPO" --json name,id,html_url,head_branch -q "map(select(.head_branch==\"$BRANCH\")) | .[0].html_url" 2>/dev/null) || true

  # Normalize output
  if [ -z "$output" ] || [ "$output" = "null" ]; then
    # No run found via gh
    printf 'NO_RUN\n'
    return 0
  fi

  # If gh printed something, return it
  printf '%s\n' "$output"
  return 0
}

# Fallback: use GitHub REST API via curl + jq (or python json) with GITHUB_TOKEN
_try_curl() {
  if [ -z "${GITHUB_TOKEN:-}" ]; then
    printf 'NO_GH_AND_NO_TOKEN\n'
    return 0
  fi

  api_url="https://api.github.com/repos/${REPO}/actions/runs?branch=${BRANCH}&per_page=1"

  # Fetch the runs list (quiet on stderr)
  resp=$(curl -sS -H "Authorization: token ${GITHUB_TOKEN}" -H "Accept: application/vnd.github.v3+json" "$api_url") || {
    printf 'ERR:curl\n'
    return 0
  }

  # Try to use jq if available
  if command -v jq >/dev/null 2>&1; then
    url=$(printf '%s' "$resp" | jq -r '.workflow_runs[0].html_url // "NO_RUN"' 2>/dev/null) || url="NO_RUN"
    printf '%s\n' "$url"
    return 0
  fi

  # No jq: use python to parse JSON safely
  if command -v python3 >/dev/null 2>&1; then
    url=$(printf '%s' "$resp" | python3 -c 'import sys,json
data=json.load(sys.stdin)
wr=data.get("workflow_runs")
if not wr:
    print("NO_RUN")
else:
    u=wr[0].get("html_url")
    print(u if u else "NO_RUN")' 2>/dev/null) || url="NO_RUN"
    printf '%s\n' "$url"
    return 0
  fi

  # If neither jq nor python present, give a minimal parse attempt (not ideal)
  # Try a grep-based fallback (best-effort, fragile)
  url=$(printf '%s' "$resp" | grep -o '"html_url"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed -E 's/.*"([^"]*)".*/\1/' || true)
  if [ -n "$url" ]; then
    printf '%s\n' "$url"
  else
    printf 'NO_RUN\n'
  fi
  return 0
}

# Main flow
main() {
  # If asked for help
  if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    cat <<USAGE
Usage: $0
Environment:
  REPO - owner/repo (default: $REPO)
  BRANCH - branch to check (default: $BRANCH)
  GITHUB_TOKEN - token for REST API fallback (do NOT expose)
Output:
  Single-line result: workflow-run-URL | NO_RUN | NO_GH_AND_NO_TOKEN | ERR:...
USAGE
    exit 0
  fi

  # Try gh first
  gh_out=$(_try_gh 2>/dev/null) || gh_out=""
  if [ -n "$gh_out" ]; then
    # _try_gh prints "NO_RUN" when there is no run; accept that as valid output
    printf '%s\n' "$gh_out"
    exit 0
  fi

  # Fall back to curl + token
  _try_curl
  exit 0
}

main "$@"
