#!/bin/sh
#
# scripts/auto_run_flow.sh
#
# Automation runner for:
#  - creating or locating a draft PR for branch `safety/add-controller-automation`
#  - polling GitHub Actions for the latest run on that branch
#  - listing jobs and optionally downloading job logs
#  - performing a dry-run deploy mapping (rsync --dry-run) if requested
#
# This script tries multiple safe, local-first methods in this order:
#  1) Use `gh` (GitHub CLI) if installed and authenticated
#  2) Use a local Controller API at http://127.0.0.1:4000 if reachable (POST /changes)
#  3) Use GITHUB_TOKEN (env) with the GitHub REST API as a last resort
#
# The script NEVER prints secrets. It will echo short machine-friendly status tokens:
#  - PR_URL:<url>        -> found/created draft PR URL
#  - NO_PR               -> could not find or create a PR
#  - NO_RUN              -> no recent workflow run found for branch
#  - RUN_ID:<id>         -> latest run id for the branch
#  - JOBS: <id> <name> <conclusion> <html_url> -> one line per job
#  - LOGS_SAVED: job-<id>-logs.zip -> when logs downloaded
#  - DRY_RUN_OK:<mapping> -> rsync output when dry-run run (printed)
#  - NO_AUTOMATION       -> no method available to create PR (no gh, controller, or token)
#  - ERR:<message>       -> on unexpected errors
#
# Usage:
#   bash ./scripts/auto_run_flow.sh            # try full flow: create/find PR, poll run, show jobs
#   bash ./scripts/auto_run_flow.sh create-pr  # only attempt to find/create PR and print PR_URL or error token
#   bash ./scripts/auto_run_flow.sh poll-ci    # poll CI for branch and list jobs (requires PR already present)
#   bash ./scripts/auto_run_flow.sh fetch-logs JOB_ID  # download logs for a job id (requires GITHUB_TOKEN)
#   bash ./scripts/auto_run_flow.sh dry-run-deploy  # run rsync --dry-run mapping (requires .next and DEPLOY_ envs)
#
# ENVIRONMENT (optional):
#   GITHUB_TOKEN - personal access token used when gh/controller are not available
#   CONTROLLER_URL - URL of local controller API (default: http://127.0.0.1:4000)
#   BRANCH - branch name (default: safety/add-controller-automation)
#   REPO - owner/repo (defaults to git origin)
#   DEPLOY_HOST / DEPLOY_USER / DEPLOY_PATH / DEPLOY_SSH_KEY - used for dry-run rsync mapping
#   CONFIRM_DEPLOY - must be set to "yes" to allow the real deploy command to run (script defaults to dry-run)
#
set -eu
: "${BRANCH:=safety/add-controller-automation}"
: "${CONTROLLER_URL:=http://127.0.0.1:4000}"
# try to infer repo from git remote
get_repo_from_git() {
  if git rev-parse --git-dir >/dev/null 2>&1; then
    remote_url=$(git remote get-url origin 2>/dev/null || true)
    if [ -n "$remote_url" ]; then
      # handle https and git@ forms
      repo=$(printf '%s' "$remote_url" | sed -E 's#.*[:/]{1}([^/]+/[^/]+)(\.git)?$#\1#')
      printf '%s' "$repo"
      return 0
    fi
  fi
  return 1
}

REPO="${REPO:-$(get_repo_from_git || true)}"
if [ -z "${REPO:-}" ]; then
  echo "ERR:Could not determine repo. Set REPO env like owner/repo" >&2
  exit 2
fi

# Helpers
log() { printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }
err() { printf 'ERR:%s\n' "$*" >&2; }

# Try to locate or create draft PR via gh
create_or_find_pr_via_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    return 10
  fi

  # ensure gh is authenticated
  if ! gh auth status >/dev/null 2>&1; then
    return 11
  fi

  # try to find existing PR for head branch
  pr_url=$(gh pr view --repo "$REPO" --head "$BRANCH" --json url --jq .url 2>/dev/null || true)
  if [ -n "${pr_url:-}" ] && [ "$pr_url" != "null" ]; then
    printf 'PR_URL:%s\n' "$pr_url"
    return 0
  fi

  # create draft PR
  pr_url=$(gh pr create --repo "$REPO" --title "feat(controller): add GitHub App controller for automated PRs" \
    --body "Automated draft PR created by local automation." --base main --head "$BRANCH" --draft --json url --jq .url 2>/dev/null || true)
  if [ -n "${pr_url:-}" ] && [ "$pr_url" != "null" ]; then
    printf 'PR_URL:%s\n' "$pr_url"
    return 0
  fi

  return 12
}

# Try controller local API
create_pr_via_controller() {
  if command -v curl >/dev/null 2>&1; then
    if curl -sS --fail "${CONTROLLER_URL%/}/health" >/dev/null 2>&1; then
      payload=$(cat <<JSON
{"owner":"${REPO%%/*}","repo":"${REPO#*/}","files":[{"path":"public/healthcheck.txt","content":"automation live"}],"title":"Automation system live test","request_id":"auto-run"}
JSON
)
      resp=$(curl -sS -X POST "${CONTROLLER_URL%/}/changes" -H "Content-Type: application/json" -d "$payload" || true)
      # resp may be JSON with prUrl
      prurl=$(printf '%s' "$resp" | awk 'BEGIN{RS="";FS="\n"}{for(i=1;i<=NF;i++) if($i ~ /prUrl/) {match($i, /prUrl[^:]*:.*"([^"]+)"/, a); if(a[1]) print a[1]}}')
      # fallback parse with jq if available
      if command -v jq >/dev/null 2>&1; then
        prurl=$(printf '%s' "$resp" | jq -r '.prUrl // empty' 2>/dev/null || printf '%s' "$prurl")
      fi
      if [ -n "$prurl" ]; then
        printf 'PR_URL:%s\n' "$prurl"
        return 0
      fi
      # If controller responded but no prUrl, return non-zero
      return 20
    fi
  fi
  return 21
}

# Try GitHub REST using GITHUB_TOKEN
create_pr_via_rest() {
  if [ -z "${GITHUB_TOKEN:-}" ]; then
    return 30
  fi
  api="https://api.github.com/repos/${REPO}/pulls"
  body=$(printf '{"title":"%s","head":"%s","base":"%s","body":"%s","draft":true}' \
    "feat(controller): add GitHub App controller for automated PRs" "$BRANCH" "main" "Automated draft PR created by local automation.")
  resp=$(curl -sS -H "Authorization: token ${GITHUB_TOKEN}" -H "Content-Type: application/json" -d "$body" "$api" || true)
  if command -v jq >/dev/null 2>&1; then
    prurl=$(printf '%s' "$resp" | jq -r '.html_url // empty' 2>/dev/null || true)
  else
    prurl=$(printf '%s' "$resp" | awk 'match($0, /"html_url"[[:space:]]*:[[:space:]]*"([^"]+)"/, a){print a[1]}')
  fi
  if [ -n "${prurl:-}" ]; then
    printf 'PR_URL:%s\n' "$prurl"
    return 0
  fi
  return 31
}

# Find or create PR - tries methods in order
create_or_find_pr() {
  # try gh
  create_or_find_pr_via_gh && return 0 || gh_rc=$?
  # try controller
  create_pr_via_controller && return 0 || ctrl_rc=$?
  # try rest api
  create_pr_via_rest && return 0 || rest_rc=$?
  # none succeeded
  if [ "${gh_rc:-0}" -ge 10 ] && [ "${ctrl_rc:-0}" -ge 20 ] && [ "${rest_rc:-0}" -ge 30 ]; then
    echo "NO_AUTOMATION"
    return 1
  fi
  echo "NO_PR"
  return 2
}

# Poll the latest workflow run for the branch and print RUN_ID:<id> or NO_RUN
get_latest_run_for_branch() {
  # prefer gh if available
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    run_url=$(gh run list --repo "$REPO" --json id,head_branch,html_url -L 50 -q 'map(select(.head_branch=="'"$BRANCH"'")) | .[0].html_url' 2>/dev/null || true)
    if [ -n "${run_url:-}" ] && [ "$run_url" != "null" ]; then
      # get id
      run_id=$(gh run list --repo "$REPO" --json id,head_branch -L 50 -q 'map(select(.head_branch=="'"$BRANCH"'")) | .[0].id' 2>/dev/null || true)
      if [ -n "$run_id" ]; then
        printf 'RUN_ID:%s\n' "$run_id"
        return 0
      fi
    fi
    echo "NO_RUN"
    return 1
  fi

  # fallback to REST API using token
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    api="https://api.github.com/repos/${REPO}/actions/runs?branch=${BRANCH}&per_page=1"
    resp=$(curl -sS -H "Authorization: token ${GITHUB_TOKEN}" -H "Accept: application/vnd.github.v3+json" "$api" || true)
    if command -v jq >/dev/null 2>&1; then
      run_id=$(printf '%s' "$resp" | jq -r '.workflow_runs[0].id // empty' 2>/dev/null || true)
      if [ -n "$run_id" ]; then
        printf 'RUN_ID:%s\n' "$run_id"
        return 0
      fi
    else
      # crude parse
      run_id=$(printf '%s' "$resp" | grep -o '"id":[[:space:]]*[0-9]*' | head -1 | sed -E 's/[^0-9]*([0-9]+).*/\1/')
      if [ -n "$run_id" ]; then
        printf 'RUN_ID:%s\n' "$run_id"
        return 0
      fi
    fi
  fi

  echo "NO_RUN"
  return 1
}

# List jobs for a run id
list_jobs_for_run() {
  run_id=$1
  if [ -z "$run_id" ]; then
    err "list_jobs_for_run requires run id"
    return 2
  fi

  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    # gh supports listing jobs for a run via API not directly, but use REST fallback for consistency
    :
  fi

  if [ -n "${GITHUB_TOKEN:-}" ]; then
    api="https://api.github.com/repos/${REPO}/actions/runs/${run_id}/jobs"
    resp=$(curl -sS -H "Authorization: token ${GITHUB_TOKEN}" -H "Accept: application/vnd.github.v3+json" "$api" || true)
    if command -v jq >/dev/null 2>&1; then
      printf '%s\n' "$(printf '%s' "$resp" | jq -r '.jobs[] | "JOBS: \(.id) \(.name) \(.conclusion // "null") \(.html_url)"')"
      return 0
    else
      # fallback parse: print lines with id and html_url occurrences
      echo "$resp" | grep -E '"id":|"html_url":|"name":|"conclusion":' | sed -n '1,200p'
      return 0
    fi
  fi

  echo "ERR:No method available to list jobs (gh not authenticated and no token)"
  return 3
}

# Download logs for a job id
download_job_logs() {
  job_id=$1
  if [ -z "$job_id" ]; then
    err "download_job_logs requires JOB_ID"
    return 2
  fi
  if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "ERR:No GITHUB_TOKEN available to download logs"
    return 3
  fi
  url="https://api.github.com/repos/${REPO}/actions/jobs/${job_id}/logs"
  outzip="job-${job_id}-logs.zip"
  curl -sS -H "Authorization: token ${GITHUB_TOKEN}" -L "$url" -o "$outzip" || { echo "ERR:download_failed"; return 4; }
  printf 'LOGS_SAVED:%s\n' "$outzip"
  return 0
}

# Dry-run deploy mapping using rsync --dry-run
dry_run_deploy() {
  # require .next build
  if [ ! -d ".next" ]; then
    echo "ERR:.next not found — build your Next.js app first"
    return 2
  fi
  if [ -z "${DEPLOY_HOST:-}" ] || [ -z "${DEPLOY_USER:-}" ] || [ -z "${DEPLOY_PATH:-}" ]; then
    echo "ERR:Set DEPLOY_HOST, DEPLOY_USER, DEPLOY_PATH environment variables for dry-run mapping"
    return 3
  fi
  key_arg=""
  if [ -n "${DEPLOY_SSH_KEY:-}" ]; then
    key_arg="-e \"ssh -i ${DEPLOY_SSH_KEY}\""
  fi
  # run rsync dry-run
  # Use a subshell to evaluate the -e argument correctly
  printf '%s\n' "Running rsync --dry-run to ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
  eval rsync -avz --dry-run .next/ "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}" ${key_arg} | sed -n '1,400p'
  return 0
}

# Main execution dispatcher
cmd=${1:-all}

case "$cmd" in
  create-pr)
    create_or_find_pr
    exit $?
    ;;
  poll-ci)
    get_latest_run_for_branch
    ;;
  fetch-logs)
    if [ -z "${2:-}" ]; then
      echo "ERR:fetch-logs requires JOB_ID arg"
      exit 2
    fi
    download_job_logs "$2"
    ;;
  dry-run-deploy)
    dry_run_deploy
    ;;
  all)
    # 1) create or find PR
    create_or_find_pr || {
      echo "NO_AUTOMATION_OR_PR"
      exit 1
    }

    # 2) poll CI for latest run
    # try a few times with backoff
    tries=0
    while [ $tries -lt 6 ]; do
      tries=$((tries + 1))
      out=$(get_latest_run_for_branch 2>/dev/null || true)
      if printf '%s' "$out" | grep -q '^RUN_ID:'; then
        echo "$out"
        runid=$(printf '%s' "$out" | sed -n 's/^RUN_ID:\(.*\)$/\1/p')
        # list jobs
        list_jobs_for_run "$runid"
        exit 0
      fi
      if printf '%s' "$out" | grep -q '^NO_RUN'; then
        # wait and retry (backoff)
        sleep $((tries * 4))
        continue
      fi
      # other outputs, print and exit
      printf '%s\n' "$out"
      break
    done
    echo "NO_RUN"
    ;;
  *)
    echo "ERR:Unknown command. Usage: $0 [create-pr|poll-ci|fetch-logs JOB_ID|dry-run-deploy|all]"
    exit 2
    ;;
esac

exit 0
