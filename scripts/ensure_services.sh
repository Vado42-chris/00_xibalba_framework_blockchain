#!/usr/bin/env bash
# ensure_services.sh
#
# Start the UI and agent services (background) and wait for the UI health endpoint.
# Extended behavior:
#  - Try to start using wrapper scripts in ./scripts/ (created by the UI server).
#  - Wait for health endpoint on 127.0.0.1 first.
#  - If health fails, attempt a fallback: restart UI bound to 0.0.0.0 (all interfaces).
#  - If health still fails, automatically collect diagnostics into /tmp via
#    run_local_diagnostics.sh and (optionally) extract/commit them into the repo
#    using agent_autorun.sh.
#  - Intended to be safe by default: automatic commit/push are opt-in.
#
# Usage:
#   chmod +x ./00_xibalba_alpaca/scripts/ensure_services.sh
#   ./00_xibalba_alpaca/scripts/ensure_services.sh
#
# Environment:
#   TIMEOUT   - how many seconds to wait for health (default 30)
#   INTERVAL  - seconds between checks (default 1)
#   HOST/PORT - alternative host/port for health checks (defaults to 127.0.0.1:8765)
#   AUTO_DIAG - if set to "0" skip automatic diagnostics collection on failure (default: 1)
#   AUTO_COMMIT - if set to "1" attempt to commit extracted diagnostics into git (default: 0)
#   AUTO_PUSH - if set to "1" attempt to push committed diagnostics (default: 0) -- use with caution
#   AGENT_AUTORUN_PUSH_CONFIRMATION - if set to "yes" will bypass interactive push confirmation
#
set -euo pipefail

# ---- Config ----
TIMEOUT=${TIMEOUT:-30}
INTERVAL=${INTERVAL:-1}
HOST=${HOST:-127.0.0.1}
PORT=${PORT:-8765}
HEALTH_PATH="/health"
HEALTH_URL_HOST="http://127.0.0.1:${PORT}${HEALTH_PATH}"
HEALTH_URL_ANY="http://0.0.0.0:${PORT}${HEALTH_PATH}"  # for messaging only; curl to 0.0.0.0 is not meaningful

# Auto diagnostics/commit settings (safe defaults)
AUTO_DIAG=${AUTO_DIAG:-1}      # 1 = run diagnostics on failure, 0 = skip
AUTO_COMMIT=${AUTO_COMMIT:-0}  # 1 = commit extracted diagnostics into git (local commit)
AUTO_PUSH=${AUTO_PUSH:-0}      # 1 = attempt to push branch to remote (use with caution)

# Resolve paths relative to this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRIPTS_DIR="$REPO_ROOT/scripts"
LOG_DIR="$REPO_ROOT/local-agent-logs"
UI_LOG="$LOG_DIR/ui_server.log"
AGENT_LOG="$LOG_DIR/agent.log"
UI_PIDFILE="$LOG_DIR/ui.pid"
AGENT_PIDFILE="$LOG_DIR/agent.pid"
UI_PY="$REPO_ROOT/local-agent/ui_server.py"
AGENT_PY="$REPO_ROOT/local-agent/agent.py"

DIAG_SCRIPT="$SCRIPTS_DIR/run_local_diagnostics.sh"
AUTORUN_SCRIPT="$SCRIPTS_DIR/agent_autorun.sh"

# Wrapper scripts (created by ui_server)
WRAP_START_UI="$SCRIPTS_DIR/start_ui.sh"
WRAP_STOP_UI="$SCRIPTS_DIR/stop_ui.sh"
WRAP_START_AGENT="$SCRIPTS_DIR/start_agent.sh"
WRAP_STOP_AGENT="$SCRIPTS_DIR/stop_agent.sh"

# Helpers
info()  { printf '\033[1;34m[INFO]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[WARN]\033[0m %s\n' "$*"; }
error() { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*"; }

ensure_dirs() {
  mkdir -p "$LOG_DIR" "$SCRIPTS_DIR" "$REPO_ROOT/hybrid-queue" "$REPO_ROOT/hybrid-results"
}

is_running_pid() {
  local pid="$1"
  if [ -z "$pid" ]; then
    return 1
  fi
  kill -0 "$pid" >/dev/null 2>&1
}

read_pidfile() {
  local f="$1"
  if [ -f "$f" ]; then
    cat "$f" 2>/dev/null || echo ""
  else
    echo ""
  fi
}

write_pidfile() {
  local f="$1"; local pid="$2"
  printf '%s' "$pid" > "$f"
}

remove_pidfile() {
  local f="$1"
  if [ -f "$f" ]; then rm -f "$f" || true; fi
}

# Health check: returns 0 on success, non-zero on failure.
check_health_once() {
  local url="$1"
  # prefer curl, fallback to wget, fallback to python
  if command -v curl >/dev/null 2>&1; then
    curl -sSf --max-time 2 "$url" >/dev/null 2>&1 && return 0 || return 1
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -q -T 2 -O /dev/null "$url" >/dev/null 2>&1 && return 0 || return 1
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<PY >/dev/null 2>&1 || return 1
import sys, urllib.request
try:
  r = urllib.request.urlopen("$url", timeout=2)
  sys.exit(0 if r.getcode()==200 else 1)
except Exception:
  sys.exit(1)
PY
    return $?
  fi
  # No way to check
  return 2
}

# Start functions
start_ui_with_wrapper() {
  if [ -x "$WRAP_START_UI" ]; then
    info "Starting UI via wrapper: $WRAP_START_UI"
    bash "$WRAP_START_UI" || {
      warn "wrapper start_ui returned non-zero"
      return 1
    }
    return 0
  fi
  return 2
}

start_ui_direct() {
  local host_arg=${1:-127.0.0.1}
  info "Starting UI directly binding to host=$host_arg port=$PORT (logs -> $UI_LOG)"
  nohup python3 "$UI_PY" --ui-foreground --host "$host_arg" --port "$PORT" >> "$UI_LOG" 2>&1 &
  local pid=$!
  sleep 0.2
  write_pidfile "$UI_PIDFILE" "$pid"
  info "UI started (pid=$pid)"
  return 0
}

start_agent_with_wrapper() {
  if [ -x "$WRAP_START_AGENT" ]; then
    info "Starting agent via wrapper: $WRAP_START_AGENT"
    bash "$WRAP_START_AGENT" || {
      warn "wrapper start_agent returned non-zero"
      return 1
    }
    return 0
  fi
  return 2
}

start_agent_direct() {
  info "Starting agent directly (logs -> $AGENT_LOG)"
  nohup python3 "$AGENT_PY" --queue "$REPO_ROOT/hybrid-queue" --results "$REPO_ROOT/hybrid-results" --log-file "$AGENT_LOG" >> "$AGENT_LOG" 2>&1 &
  local pid=$!
  sleep 0.2
  write_pidfile "$AGENT_PIDFILE" "$pid"
  info "Agent started (pid=$pid)"
  return 0
}

# Stop helpers (best-effort)
stop_ui() {
  if [ -x "$WRAP_STOP_UI" ]; then
    info "Stopping UI via wrapper: $WRAP_STOP_UI"
    bash "$WRAP_STOP_UI" || true
  else
    local pid; pid="$(read_pidfile "$UI_PIDFILE")"
    if [ -n "$pid" ]; then
      info "Stopping UI pid=$pid"
      kill "$pid" 2>/dev/null || true
      sleep 0.2
      remove_pidfile "$UI_PIDFILE"
    fi
  fi
}

stop_agent() {
  if [ -x "$WRAP_STOP_AGENT" ]; then
    info "Stopping agent via wrapper: $WRAP_STOP_AGENT"
    bash "$WRAP_STOP_AGENT" || true
  else
    local pid; pid="$(read_pidfile "$AGENT_PIDFILE")"
    if [ -n "$pid" ]; then
      info "Stopping agent pid=$pid"
      kill "$pid" 2>/dev/null || true
      sleep 0.2
      remove_pidfile "$AGENT_PIDFILE"
    fi
  fi
}

# Tail helpful snippets of logs for debugging
tail_brief_logs() {
  echo
  echo "=== UI log (tail 200) -> $UI_LOG ==="
  [ -f "$UI_LOG" ] && tail -n 200 "$UI_LOG" || echo "(no ui log)"
  echo
  echo "=== Agent log (tail 200) -> $AGENT_LOG ==="
  [ -f "$AGENT_LOG" ] && tail -n 200 "$AGENT_LOG" || echo "(no agent log)"
  echo
}

# Run automatic diagnostics via the helper script; returns path to archive if found
run_auto_diagnostics() {
  if [ "${AUTO_DIAG:-0}" = "0" ]; then
    info "AUTO_DIAG disabled; skipping automatic diagnostics."
    return 1
  fi

  if [ ! -x "$DIAG_SCRIPT" ]; then
    if [ -f "$DIAG_SCRIPT" ]; then
      chmod +x "$DIAG_SCRIPT" || true
    else
      warn "Diagnostics script not found at $DIAG_SCRIPT"
      return 1
    fi
  fi

  info "Running automatic diagnostics script: $DIAG_SCRIPT (this may take a minute)..."
  # Run diagnostics and capture output to a temp file so we can parse the produced archive path
  TMP_OUT="/tmp/ensure_services_run_diag_$(date +%s).out"
  # We allow failure of the diagnostics script itself without aborting the rest of this helper.
  set +e
  bash "$DIAG_SCRIPT" 2>&1 | tee "$TMP_OUT"
  DIAG_EXIT=$?
  set -e
  # Look for archive path patterns that our diagnostics script writes
  ARCHIVE="$(grep -o '/tmp/xibalba_local_diagnostics_[0-9_]*\\.tar\\.gz' "$TMP_OUT" | tail -n1 || true)"
  if [ -z "$ARCHIVE" ]; then
    ARCHIVE="$(grep -o '/tmp/local-agent-diag-[0-9T]*\\.tar\\.gz' "$TMP_OUT" | tail -n1 || true)"
  fi

  if [ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ]; then
    info "Diagnostics archive created: $ARCHIVE"
    echo "$ARCHIVE"
    return 0
  fi

  # fallback: attempt to find the latest matching archive in /tmp
  AR="$(ls -1t /tmp/xibalba_local_diagnostics_*.tar.gz 2>/dev/null | head -n1 || true)"
  if [ -n "$AR" ] && [ -f "$AR" ]; then
    info "Found diagnostics archive: $AR"
    echo "$AR"
    return 0
  fi

  info "No diagnostics archive found after running diagnostics script. See output: $TMP_OUT"
  return 1
}

# Use agent_autorun to extract archive and optionally commit/push
autorun_extract_and_commit() {
  local archive_path="$1"
  if [ ! -f "$AUTORUN_SCRIPT" ]; then
    warn "autorun script not found at $AUTORUN_SCRIPT; cannot auto-extract/commit diagnostics."
    return 1
  fi
  if [ ! -x "$AUTORUN_SCRIPT" ]; then
    chmod +x "$AUTORUN_SCRIPT" || true
  fi

  # Build autorun args
  local args=(--archive "$archive_path")
  if [ "${AUTO_COMMIT:-0}" = "1" ]; then
    args+=("--commit")
    if [ "${AUTO_PUSH:-0}" = "1" ]; then
      args+=("--push" "--confirm-push")
      # Allow non-interactive confirmation when environment variable is set
      export AGENT_AUTORUN_PUSH_CONFIRMATION="${AGENT_AUTORUN_PUSH_CONFIRMATION:-no}"
      if [ "$AGENT_AUTORUN_PUSH_CONFIRMATION" = "yes" ]; then
        # nothing to do, agent_autorun will use this env var
        :
      fi
    fi
  fi

  info "Running autorun to extract diagnostics (args: ${args[*]})"
  set +e
  bash "$AUTORUN_SCRIPT" "${args[@]}"
  AUTORUN_EXIT=$?
  set -e
  if [ $AUTORUN_EXIT -ne 0 ]; then
    warn "agent_autorun.sh returned non-zero exit ($AUTORUN_EXIT). See its output above."
    return 1
  fi
  info "Diagnostics extracted (and committed if enabled)."
  return 0
}

# Main flow
ensure_dirs

info "Ensuring UI + agent services are running (timeout=${TIMEOUT}s, interval=${INTERVAL}s)"
info "Health will be checked at: $HEALTH_URL_HOST"

# Start UI if not running (or wrapper will handle pidfile)
ui_pid="$(read_pidfile "$UI_PIDFILE")"
if [ -n "$ui_pid" ] && is_running_pid "$ui_pid"; then
  info "UI appears already running (pid=$ui_pid)"
else
  info "UI not running (or stale pid). Attempting start using wrapper (preferred)..."
  if start_ui_with_wrapper; then
    info "Wrapper triggered start; waiting a moment..."
  else
    warn "Wrapper start_ui not available or failed; starting UI directly bound to 127.0.0.1"
    start_ui_direct "127.0.0.1"
  fi
fi

# Start agent if not running
agent_pid="$(read_pidfile "$AGENT_PIDFILE")"
if [ -n "$agent_pid" ] && is_running_pid "$agent_pid"; then
  info "Agent appears already running (pid=$agent_pid)"
else
  info "Agent not running (or stale pid). Attempting start using wrapper (preferred)..."
  if start_agent_with_wrapper; then
    info "Wrapper triggered agent start; waiting a moment..."
  else
    warn "Wrapper start_agent not available or failed; starting agent directly"
    start_agent_direct
  fi
fi

# Wait for health on 127.0.0.1
info "Waiting up to ${TIMEOUT}s for UI health at ${HEALTH_URL_HOST} ..."
end_time=$((SECONDS + TIMEOUT))
while [ $SECONDS -le $end_time ]; do
  if check_health_once "$HEALTH_URL_HOST"; then
    info "UI health check OK at ${HEALTH_URL_HOST}"
    exit 0
  fi
  sleep "$INTERVAL"
done

warn "UI health did NOT respond at ${HEALTH_URL_HOST} within ${TIMEOUT}s."
warn "Attempting fallback: (re)start UI bound to 0.0.0.0 and re-check health."

# Try to stop any existing UI instance, then start directly binding 0.0.0.0
stop_ui || true
sleep 0.3

# attempt to start via direct binding to 0.0.0.0 (wrapper typically binds to 127.0.0.1; we need direct)
start_ui_direct "0.0.0.0"
# give it a moment
sleep 0.5

# Wait again
info "Waiting up to ${TIMEOUT}s for UI health at ${HEALTH_URL_HOST} (after fallback) ..."
end_time=$((SECONDS + TIMEOUT))
while [ $SECONDS -le $end_time ]; do
  if check_health_once "$HEALTH_URL_HOST"; then
    info "UI health check OK after fallback (service bound to 0.0.0.0 and reachable via ${HEALTH_URL_HOST})"
    exit 0
  fi
  sleep "$INTERVAL"
done

error "UI still did not respond after fallback. Dumping recent logs for diagnosis:"
tail_brief_logs

# Automatic diagnostics + optional commit/push
if [ "${AUTO_DIAG:-0}" != "0" ]; then
  info "Automatic diagnostics enabled. Attempting to gather diagnostics bundle..."
  ARCHIVE_PATH="$(run_auto_diagnostics || true)"
  if [ -n "$ARCHIVE_PATH" ] && [ -f "$ARCHIVE_PATH" ]; then
    info "Diagnostics archive available at: $ARCHIVE_PATH"
    if [ "${AUTO_COMMIT:-0}" = "1" ]; then
      info "AUTO_COMMIT enabled. Attempting to extract and commit diagnostics into the repo..."
      if autorun_extract_and_commit "$ARCHIVE_PATH"; then
        info "Automatic extraction/commit completed (see local git history)."
        if [ "${AUTO_PUSH:-0}" = "1" ]; then
          info "AUTO_PUSH enabled; attempted push was performed (if configured)."
        fi
      else
        warn "Automatic extraction/commit encountered problems; please inspect the autorun output above."
      fi
    else
      info "AUTO_COMMIT disabled. Diagnostics archive preserved at: $ARCHIVE_PATH"
      info "To extract into the repo and optionally commit, run:"
      info "  $AUTORUN_SCRIPT --archive \"$ARCHIVE_PATH\" --commit"
      info "Or to extract only:"
      info "  $AUTORUN_SCRIPT --archive \"$ARCHIVE_PATH\""
    fi
  else
    warn "Automatic diagnostics did not produce an archive. Please run diagnostics manually: $DIAG_SCRIPT"
  fi
else
  info "AUTO_DIAG disabled; skipping diagnostics collection."
fi

error "If you're running in WSL / VM / remote host the browser must open the UI on the same host (127.0.0.1), or you must access the host's IP when bound to 0.0.0.0."
error "To debug further, run the UI in the foreground to observe errors:"
printf '  %s\n' "LOCAL_AGENT_UI_HOST=127.0.0.1 LOCAL_AGENT_UI_PORT=$PORT python3 \"$UI_PY\""
error "Or inspect logs: $UI_LOG and $AGENT_LOG"
exit 2
