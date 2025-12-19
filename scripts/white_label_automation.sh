#!/usr/bin/env bash
#
# white_label_automation.sh
#
# Deploy a built frontend (or full dist directory) to multiple white-label client hosts.
#
# Features:
# - Reads client list from a JSON config (default: white-label-clients.json)
# - Builds project once (supports npm or a pre-built `dist/` folder)
# - Deploys to each client via rsync over ssh
# - Supports dry-run mode, concurrency, retry logic and logging
# - Exposes per-client pre/post deploy hooks (optional)
#
# Usage:
#   chmod +x scripts/white_label_automation.sh
#   ./scripts/white_label_automation.sh [--config path] [--concurrency N] [--dry-run]
#
# Examples:
#   ./scripts/white_label_automation.sh
#   ./scripts/white_label_automation.sh --config clients.json --concurrency 4
#   ./scripts/white_label_automation.sh --dry-run
#
# Config file format (JSON):
# {
#   "clients": [
#     {
#       "name": "acme",
#       "domain": "acme.example.com",
#       "host": "root@203.0.113.45",
#       "path": "/var/www/acme",
#       "pre_deploy_cmd": "sudo systemctl stop nginx || true",
#       "post_deploy_cmd": "sudo systemctl restart nginx || true"
#     },
#     ...
#   ]
# }
#
# Security:
# - Do NOT store private SSH keys in the repo. Use deploy keys / GitHub Secrets.
# - This script can use SSH agent or an explicit SSH key file via SSH_KEY env var:
#     export SSH_KEY="/path/to/key.pem"
#
# Exit codes:
#  0 success (all clients deployed or dry-run)
#  1 fatal usage / missing tools
#  2 build failed
#  3 deploy failures (one or more clients failed)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_CONFIG="${PROJECT_ROOT}/white-label-clients.json"
LOG_DIR="${PROJECT_ROOT}/logs"
mkdir -p "${LOG_DIR}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
LOG_FILE="${LOG_DIR}/white_label_deploy_${TIMESTAMP}.log"

# Defaults
CONFIG_FILE="${DEFAULT_CONFIG}"
CONCURRENCY=2
DRY_RUN=false
RETRIES=2
RSYNC_OPTS=(-az --delete --info=progress2 --exclude='.git' --exclude='node_modules' --exclude='*.map')
SSH_OPTS=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10)
BUILD_CMD=("npm" "run" "build") # attempted if package.json exists
DIST_DIR="${PROJECT_ROOT}/dist"

usage() {
  cat <<EOF
white_label_automation.sh - deploy built artifacts to multiple client hosts

Usage:
  $0 [--config PATH] [--concurrency N] [--dry-run] [--retries N] [--skip-build]

Options:
  --config PATH       Path to JSON config (default: ${DEFAULT_CONFIG})
  --concurrency N     Number of concurrent deploys (default: ${CONCURRENCY})
  --dry-run           Run rsync with --dry-run (no changes will be applied)
  --retries N         Number of deploy retries per client (default: ${RETRIES})
  --skip-build        Do not run build step; require ${DIST_DIR} to exist
  --help              Show this help

Environment:
  SSH_KEY             Optional path to private SSH key to use (added to ssh command)
  ARGS passed through are ignored.

Examples:
  $0 --config white-label-clients.json --concurrency 4
  SSH_KEY=~/.ssh/deploy_key $0 --skip-build
EOF
}

log() {
  local level="$1"; shift
  local msg="$*"
  local now
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '%s %s %s\n' "${now}" "${level}" "${msg}" | tee -a "${LOG_FILE}"
}

die() {
  log "ERROR" "$*"
  exit 1
}

# Check required tools
require_tool() {
  command -v "$1" >/dev/null 2>&1 || die "Required tool '$1' is not installed or not in PATH."
}

ensure_tools() {
  require_tool jq
  require_tool rsync
  require_tool ssh
  # build tools optional; checked later
}

parse_args() {
  local skip_build=false
  while [ $# -gt 0 ]; do
    case "$1" in
      --config) CONFIG_FILE="$2"; shift 2 ;;
      --concurrency) CONCURRENCY="$2"; shift 2 ;;
      --dry-run) DRY_RUN=true; shift ;;
      --retries) RETRIES="$2"; shift 2 ;;
      --skip-build) skip_build=true; shift ;;
      --help) usage; exit 0 ;;
      *) echo "Unknown arg: $1"; usage; exit 1 ;;
    esac
  done

  if [ "${skip_build}" = true ]; then
    SKIP_BUILD=true
  else
    SKIP_BUILD=false
  fi
}

build_project() {
  if [ "${SKIP_BUILD}" = true ]; then
    log "INFO" "Skipping build step because --skip-build was provided."
    if [ ! -d "${DIST_DIR}" ]; then
      die "DIST directory '${DIST_DIR}' not found. Cannot continue with skip-build."
    fi
    return 0
  fi

  if [ -f "${PROJECT_ROOT}/package.json" ]; then
    log "INFO" "Detected package.json — running build command."
    if command -v npm >/dev/null 2>&1; then
      log "INFO" "Running: ${BUILD_CMD[*]}"
      if "${BUILD_CMD[@]}" >>"${LOG_FILE}" 2>&1; then
        log "INFO" "Build succeeded."
      else
        log "ERROR" "Build failed. Check ${LOG_FILE} for details."
        return 2
      fi
    else
      die "npm not found; cannot run build. Either install npm or run with --skip-build and provide ${DIST_DIR}."
    fi
  else
    # No package.json: expect dist exists
    if [ -d "${DIST_DIR}" ]; then
      log "INFO" "No package.json detected and ${DIST_DIR} exists — using existing build."
    else
      die "No package.json found and ${DIST_DIR} does not exist. Nothing to deploy."
    fi
  fi
  return 0
}

# Deploy one client (synchronous)
# Input: client JSON object string
deploy_client_once() {
  local client_json="$1"
  # Extract fields safely using jq
  local name domain host path pre_cmd post_cmd
  name="$(printf '%s' "${client_json}" | jq -r '.name // empty')"
  domain="$(printf '%s' "${client_json}" | jq -r '.domain // empty')"
  host="$(printf '%s' "${client_json}" | jq -r '.host // empty')"
  path="$(printf '%s' "${client_json}" | jq -r '.path // empty')"
  pre_cmd="$(printf '%s' "${client_json}" | jq -r '.pre_deploy_cmd // empty')"
  post_cmd="$(printf '%s' "${client_json}" | jq -r '.post_deploy_cmd // empty')"

  local identifier="${name:-${domain:-${host}}}"
  if [ -z "${host}" ] || [ -z "${path}" ]; then
    log "WARN" "Skipping client with insufficient host/path info: ${identifier}"
    return 0
  fi

  log "INFO" "Starting deploy for client: ${identifier} -> ${host}:${path}"

  # Optional pre-deploy command
  if [ -n "${pre_cmd}" ] && [ "${pre_cmd}" != "null" ]; then
    log "INFO" "Running pre-deploy command for ${identifier}: ${pre_cmd}"
    ssh_exec "${host}" "${pre_cmd}" || log "WARN" "Pre-deploy command failed for ${identifier} (continuing)."
  fi

  # Ensure target path exists
  ssh_exec "${host}" "mkdir -p '${path}' || true"

  # Rsync options
  local rsync_extra=("${RSYNC_OPTS[@]}")
  if [ "${DRY_RUN}" = true ]; then
    rsync_extra+=("--dry-run")
  fi

  # Rsync over ssh; build ssh command for rsync
  local ssh_cmd="ssh ${SSH_OPTS[*]}"
  if [ -n "${SSH_KEY:-}" ]; then
    ssh_cmd="${ssh_cmd} -i ${SSH_KEY}"
  fi

  # Assemble final rsync command
  local rsync_cmd=(rsync "${rsync_extra[@]}" -e "${ssh_cmd}" "${DIST_DIR}/" "${host}:${path}/")

  log "INFO" "Running rsync for ${identifier}: ${rsync_cmd[*]}"
  if "${rsync_cmd[@]}" >>"${LOG_FILE}" 2>&1; then
    log "INFO" "Rsync complete for ${identifier}"
  else
    log "ERROR" "Rsync failed for ${identifier}. See ${LOG_FILE} for details."
    return 1
  fi

  # Optional post-deploy command
  if [ -n "${post_cmd}" ] && [ "${post_cmd}" != "null" ]; then
    log "INFO" "Running post-deploy command for ${identifier}: ${post_cmd}"
    if ssh_exec "${host}" "${post_cmd}"; then
      log "INFO" "Post-deploy command succeeded for ${identifier}"
    else
      log "WARN" "Post-deploy command failed for ${identifier}"
    fi
  fi

  log "INFO" "Deployment finished for ${identifier}"
  return 0
}

ssh_exec() {
  local host="$1"; shift
  local cmd="$*"
  local ssh_opts=("${SSH_OPTS[@]}")
  if [ -n "${SSH_KEY:-}" ]; then
    ssh_opts+=(-i "${SSH_KEY}")
  fi

  ssh "${ssh_opts[@]}" "${host}" "${cmd}"
}

# Wrapper to perform deploy with retries
deploy_client_with_retries() {
  local client_json="$1"
  local attempt=0
  local rc=0
  while [ $attempt -le "${RETRIES}" ]; do
    attempt=$((attempt + 1))
    log "INFO" "Deploy attempt ${attempt}/${RETRIES} for client..."
    if deploy_client_once "${client_json}"; then
      rc=0
      break
    else
      rc=$?
      log "WARN" "Deploy attempt ${attempt} failed (rc=${rc}). Retrying..."
      sleep $((attempt * 3))
    fi
  done
  return ${rc}
}

# Concurrency control: run deploys in background but cap jobs
run_with_concurrency() {
  local max_jobs="${1}"; shift
  local pids=()
  local name_map=()

  for client_json in "$@"; do
    # Wait until we have less than max_jobs background jobs
    while true; do
      # Clean pids array of finished jobs
      local new_pids=()
      for pid in "${pids[@]:-}"; do
        if kill -0 "${pid}" >/dev/null 2>&1; then
          new_pids+=("${pid}")
        fi
      done
      pids=("${new_pids[@]}")

      if [ "${#pids[@]}" -lt "${max_jobs}" ]; then
        break
      fi
      sleep 1
    done

    # Start deploy in background
    (
      # We capture client name for nicer logs inside subshell
      local nm; nm="$(printf '%s' "${client_json}" | jq -r '.name // empty')"
      log "INFO" "Background job starting for ${nm:-unknown}"
      if deploy_client_with_retries "${client_json}"; then
        log "INFO" "Background deploy succeeded for ${nm:-unknown}"
        exit 0
      else
        log "ERROR" "Background deploy failed for ${nm:-unknown}"
        exit 1
      fi
    ) &
    pids+=($!)
  done

  # Wait for all
  local final_rc=0
  for pid in "${pids[@]:-}"; do
    if wait "${pid}"; then
      true
    else
      final_rc=3
    fi
  done

  return ${final_rc}
}

main() {
  parse_args "$@"
  ensure_tools

  log "INFO" "White-label automation starting"
  log "INFO" "Config: ${CONFIG_FILE} | Concurrency: ${CONCURRENCY} | Dry run: ${DRY_RUN} | Retries: ${RETRIES}"

  if [ ! -f "${CONFIG_FILE}" ]; then
    die "Config file not found: ${CONFIG_FILE}"
  fi

  # Read clients into bash array (JSON objects as strings)
  mapfile -t clients < <(jq -c '.clients[]' "${CONFIG_FILE}")

  if [ "${#clients[@]}" -eq 0 ]; then
    die "No clients found in ${CONFIG_FILE}"
  fi

  # Build step
  if ! build_project; then
    die "Build failed"
  fi

  # Export SSH_KEY detection
  if [ -n "${SSH_KEY:-}" ] && [ ! -f "${SSH_KEY}" ]; then
    die "SSH_KEY is set to '${SSH_KEY}' but file not found."
  fi

  # Deploy with concurrency
  local rc
  run_with_concurrency "${CONCURRENCY}" "${clients[@]}" || rc=$?
  rc="${rc:-0}"

  if [ "${rc}" -ne 0 ]; then
    log "ERROR" "One or more client deployments failed. Check ${LOG_FILE}"
    exit 3
  fi

  log "INFO" "All deployments completed successfully."
  log "INFO" "Log file: ${LOG_FILE}"
  return 0
}

# Entry point
main "$@"
