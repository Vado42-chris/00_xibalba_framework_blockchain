#!/usr/bin/env bash
#
# start_services_auto_commit.sh
#
# Wrapper to start UI + agent services with automatic diagnostics collection
# and optional local commit (and optional push).
#
# Intended usage:
#   chmod +x 00_xibalba_alpaca/scripts/start_services_auto_commit.sh
#   ./00_xibalba_alpaca/scripts/start_services_auto_commit.sh       # safe: collect diagnostics on failure, commit disabled
#   ./00_xibalba_alpaca/scripts/start_services_auto_commit.sh --commit
#   ./00_xibalba_alpaca/scripts/start_services_auto_commit.sh --commit --push
#
# Behavior:
#  - Runs the existing ensure_services helper to start UI + agent.
#  - On failure, runs diagnostics (via run_local_diagnostics.sh) and will
#    optionally extract & commit diagnostics into the repo using agent_autorun.sh.
#  - Commits are local unless --push is provided.
#
# Safety:
#  - Default is to NOT push to remote.
#  - No secrets or credentials are written by this script.
#
set -euo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "$0")/.." >/dev/null 2>&1 && pwd)"
SCRIPTS_DIR="$ROOT_DIR/00_xibalba_alpaca/scripts"
LOGS_DIR="$ROOT_DIR/00_xibalba_alpaca/local-agent-logs"

ENSURE_SCRIPT="$SCRIPTS_DIR/ensure_services.sh"
DIAG_SCRIPT="$SCRIPTS_DIR/run_local_diagnostics.sh"
AUTORUN_SCRIPT="$SCRIPTS_DIR/agent_autorun.sh"

AUTO_COMMIT=0   # whether to commit diagnostics automatically
AUTO_PUSH=0     # whether to push committed diagnostics to remote
FORCE_BIND_ALL=0
TIMEOUT_OVERRIDE=""

print_help() {
  cat <<EOF
start_services_auto_commit.sh - Start local UI+agent and auto-collect diagnostics on failure

Usage:
  $0 [options]

Options:
  --help            Show this help
  --commit          If diagnostics are produced, extract and commit them locally
  --push            If --commit is set, also attempt to push the created branch (use with caution)
  --force-bind-all  Pass FORCE_BIND_ALL=1 to the underlying helper (try binding 0.0.0.0 earlier)
  --timeout N       Override health timeout (seconds) for ensure_services.sh
  --no-auto-diag    Do not run diagnostics automatically on failure (opposite of default behavior)
EOF
}

# Simple logger
log() { printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"; }
err() { printf '%s ERROR: %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" >&2; }

# Parse args
while [ $# -gt 0 ]; do
  case "$1" in
    --help) print_help; exit 0 ;;
    --commit) AUTO_COMMIT=1; shift ;;
    --push) AUTO_PUSH=1; shift ;;
    --force-bind-all) FORCE_BIND_ALL=1; shift ;;
    --timeout)
      if [ -n "${2:-}" ] && [[ "$2" =~ ^[0-9]+$ ]]; then
        TIMEOUT_OVERRIDE="$2"
        shift 2
      else
        err "--timeout requires a numeric argument"
        exit 2
      fi
      ;;
    --no-auto-diag) export AUTO_DIAG=0; shift ;;
    *)
      err "Unknown argument: $1"
      print_help
      exit 2
      ;;
  esac
done

# Validate scripts exist (we don't execute remote tools here; just guard)
if [ ! -x "$ENSURE_SCRIPT" ]; then
  if [ -f "$ENSURE_SCRIPT" ]; then
    chmod +x "$ENSURE_SCRIPT" || true
  else
    err "ensure_services helper not found at: $ENSURE_SCRIPT"
    exit 3
  fi
fi

# Ensure diagnostics & autorun scripts exist (we'll run them only on failure)
if [ -f "$DIAG_SCRIPT" ] && [ ! -x "$DIAG_SCRIPT" ]; then
  chmod +x "$DIAG_SCRIPT" || true
fi
if [ -f "$AUTORUN_SCRIPT" ] && [ ! -x "$AUTORUN_SCRIPT" ]; then
  chmod +x "$AUTORUN_SCRIPT" || true
fi

# Build environment for ensure_services invocation
ENV_VARS=()
# Default behavior: allow ensure_services to run its own AUTO_DIAG; but expose control.
export AUTO_DIAG="${AUTO_DIAG:-1}"
if [ "$AUTO_DIAG" = "1" ]; then
  ENV_VARS+=("AUTO_DIAG=1")
else
  ENV_VARS+=("AUTO_DIAG=0")
fi

# If FORCE_BIND_ALL requested, pass it through
if [ "$FORCE_BIND_ALL" -eq 1 ]; then
  ENV_VARS+=("FORCE_BIND_ALL=1")
fi

# If user provided a timeout override, pass it to helper
if [ -n "$TIMEOUT_OVERRIDE" ]; then
  ENV_VARS+=("TIMEOUT=$TIMEOUT_OVERRIDE")
fi

# Run ensure_services.sh
log "Starting services via: $ENSURE_SCRIPT (AUTO_DIAG=${AUTO_DIAG}, FORCE_BIND_ALL=${FORCE_BIND_ALL})"
set +e
# shellcheck disable=SC2086
( ${ENV_VARS[*]} bash "$ENSURE_SCRIPT" )
ENSURE_EXIT=$?
set -e

if [ "$ENSURE_EXIT" -eq 0 ]; then
  log "ensure_services completed successfully (exit=0). UI should be healthy."
  exit 0
fi

err "ensure_services failed (exit=$ENSURE_EXIT). Proceeding to collect diagnostics."

# Attempt to run diagnostics script (it writes an archive to /tmp). We try to capture its stdout.
DIAG_ARCHIVE=""
if [ -x "$DIAG_SCRIPT" ]; then
  log "Running diagnostics script: $DIAG_SCRIPT"
  TMP_OUT="$(mktemp /tmp/start_services_diag.XXXXXX)"
  set +e
  bash "$DIAG_SCRIPT" 2>&1 | tee "$TMP_OUT"
  DIAG_RC=$?
  set -e
  # Look for known archive patterns in output
  DIAG_ARCHIVE="$(grep -o '/tmp/xibalba_local_diagnostics_[0-9_]*\\.tar\\.gz' "$TMP_OUT" | tail -n1 || true)"
  if [ -z "$DIAG_ARCHIVE" ]; then
    DIAG_ARCHIVE="$(grep -o '/tmp/local-agent-diag-[0-9T_.-]*\\.tar\\.gz' "$TMP_OUT" | tail -n1 || true)"
  fi
  # fallback: most recent matching file in /tmp
  if [ -z "$DIAG_ARCHIVE" ]; then
    DIAG_ARCHIVE="$(ls -1t /tmp/xibalba_local_diagnostics_*.tar.gz 2>/dev/null | head -n1 || true)"
  fi
  if [ -z "$DIAG_ARCHIVE" ]; then
    DIAG_ARCHIVE="$(ls -1t /tmp/local-agent-diag-*.tar.gz 2>/dev/null | head -n1 || true)"
  fi

  if [ -n "$DIAG_ARCHIVE" ] && [ -f "$DIAG_ARCHIVE" ]; then
    log "Found diagnostics archive: $DIAG_ARCHIVE"
  else
    err "Diagnostics script did not produce an archive or none was found in /tmp."
    log "You can inspect the diagnostics script output at: $TMP_OUT"
  fi
else
  err "Diagnostics script not executable or missing at: $DIAG_SCRIPT"
fi

# If diagnostics archive found, copy to repo logs dir and optionally autorun commit
if [ -n "${DIAG_ARCHIVE:-}" ] && [ -f "$DIAG_ARCHIVE" ]; then
  mkdir -p "$LOGS_DIR/diagnostics"
  cp -a "$DIAG_ARCHIVE" "$LOGS_DIR/diagnostics/" || true
  COPIED_ARCHIVE="$LOGS_DIR/diagnostics/$(basename "$DIAG_ARCHIVE")"
  log "Copied diagnostics archive to: $COPIED_ARCHIVE"

  if [ "$AUTO_COMMIT" -eq 1 ] && [ -x "$AUTORUN_SCRIPT" ]; then
    log "AUTO_COMMIT requested: running autorun to extract & commit diagnostics."
    ARGS=(--archive "$COPIED_ARCHIVE" --commit)
    if [ "$AUTO_PUSH" -eq 1 ]; then
      ARGS+=(--push --confirm-push)
      # allow autorun to skip interactive confirmation if environment variable set
      export AGENT_AUTORUN_PUSH_CONFIRMATION="${AGENT_AUTORUN_PUSH_CONFIRMATION:-no}"
    fi

    set +e
    bash "$AUTORUN_SCRIPT" "${ARGS[@]}"
    AUTORUN_RC=$?
    set -e
    if [ "$AUTORUN_RC" -ne 0 ]; then
      err "agent_autorun.sh returned non-zero ($AUTORUN_RC). Check output above."
    else
      log "agent_autorun.sh completed successfully (commit created)."
      if [ "$AUTO_PUSH" -eq 1 ]; then
        log "AUTO_PUSH requested: autorun attempted to push the branch (see output)."
      fi
    fi
  else
    if [ "$AUTO_COMMIT" -eq 1 ]; then
      err "AUTO_COMMIT requested but autorun script is not available or not executable: $AUTORUN_SCRIPT"
    else
      log "AUTO_COMMIT not requested. Diagnostics preserved at: $COPIED_ARCHIVE"
      log "To commit diagnostics into the repo manually, run:"
      log "  $AUTORUN_SCRIPT --archive \"$COPIED_ARCHIVE\" --commit"
    fi
  fi
else
  err "No diagnostics archive available to copy/commit."
fi

err "start_services_auto_commit.sh finished with failures. Inspect logs under $LOGS_DIR and the diagnostics bundle (if created)."
exit "$ENSURE_EXIT"
