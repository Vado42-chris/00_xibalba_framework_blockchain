#!/usr/bin/env bash
#
# One-shot local diagnostics helper for the local agent + UI.
# - Gathers useful runtime info, logs, and service startup traces into /tmp.
# - Safe: continues on errors and captures exit codes for each command.
#
# Usage:
#   ./00_xibalba_alpaca/scripts/run_local_diagnostics.sh
#
# Output:
#   /tmp/xibalba_local_diagnostics_<timestamp>/   (and a tar.gz archive)
#
set -uo pipefail

# Allow non-fatal commands to fail without exiting the whole script.
# We'll capture exit codes explicitly.
shopt -s nullglob

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTDIR="/tmp/xibalba_local_diagnostics_${TIMESTAMP}"
mkdir -p "$OUTDIR"

# Determine repo root (assumes this script lives in scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"
cd "$REPO_ROOT" || exit 1

log() { printf '%s\n' "[$(date +%Y-%m-%dT%H:%M:%S%z)] $*" | tee -a "$OUTDIR/run.log"; }

# Helper to run a command, capture stdout/stderr, and record exit code
run_and_capture() {
  local label="$1"; shift
  local outfile_stdout="$OUTDIR/${label}.out"
  local outfile_stderr="$OUTDIR/${label}.err"
  local outfile_meta="$OUTDIR/${label}.meta"
  log "RUN: $*"
  # shellcheck disable=SC2086
  { eval "$@" ; } >"$outfile_stdout" 2>"$outfile_stderr"
  local exitcode=$?
  printf 'exit=%d\ncmd=%s\n' "$exitcode" "$*" >"$outfile_meta"
  log "DONE: $label (exit=$exitcode)"
  return $exitcode
}

# A safer variant that will try a command with a timeout if `timeout` is available.
run_with_timeout() {
  local label="$1"; shift
  local timeout_s="$1"; shift
  local cmd="$*"
  if command -v timeout >/dev/null 2>&1; then
    run_and_capture "$label" timeout "${timeout_s}s" bash -c "$cmd"
  else
    # fallback: run in background, wait up to timeout, then kill if still running
    local bgout="$OUTDIR/${label}.out"
    local bgerr="$OUTDIR/${label}.err"
    local bgmeta="$OUTDIR/${label}.meta"
    log "RUN (bg+timed): $cmd"
    bash -c "$cmd" >"$bgout" 2>"$bgerr" &
    local pid=$!
    local waited=0
    while kill -0 "$pid" >/dev/null 2>&1; do
      if [ "$waited" -ge "$timeout_s" ]; then
        log "Timeout reached (${timeout_s}s) for label $label; killing pid $pid"
        kill "$pid" >/dev/null 2>&1 || true
        sleep 1
        kill -9 "$pid" >/dev/null 2>&1 || true
        break
      fi
      sleep 1
      waited=$((waited + 1))
    done
    wait "$pid" >/dev/null 2>&1 || true
    local exitcode=0
    if kill -0 "$pid" >/dev/null 2>&1; then
      exitcode=124
    fi
    printf 'exit=%d\ncmd=%s\n' "$exitcode" "$cmd" >"$bgmeta"
    log "DONE (bg+timed): $label (exit=$exitcode)"
    return $exitcode
  fi
}

log "Starting local diagnostics; results will be written to: $OUTDIR"

# Make helper executable if present
if [ -f "00_xibalba_alpaca/scripts/ensure_services.sh" ]; then
  run_and_capture "chmod_ensure_services" chmod +x "00_xibalba_alpaca/scripts/ensure_services.sh" || true
else
  log "ensure_services.sh not found at expected path"
fi

# 1) Quick port check for 8765
if command -v ss >/dev/null 2>&1; then
  run_and_capture "port_check_ss" ss -ltnp \| grep 8765 || true
elif command -v lsof >/dev/null 2>&1; then
  run_and_capture "port_check_lsof" lsof -i :8765 || true
elif command -v netstat >/dev/null 2>&1; then
  run_and_capture "port_check_netstat" netstat -ltnp \| grep 8765 || true
else
  echo "no ss/lsof/netstat found" >"$OUTDIR/port_check_unsupported.txt"
  log "No port-check utilities found (ss/lsof/netstat). Skipping port check."
fi

# 2) Start UI + agent helper (capture output). Timeout to avoid blocking forever.
if [ -f "00_xibalba_alpaca/scripts/ensure_services.sh" ]; then
  # Use 120s default timeout for the helper run; adjust with env var if desired
  ENSURE_TIMEOUT="${ENSURE_TIMEOUT:-120}"
  run_with_timeout "ensure_services" "$ENSURE_TIMEOUT" "./00_xibalba_alpaca/scripts/ensure_services.sh 2>&1 | tee '$OUTDIR/ensure_services.tee.out'"
else
  log "ensure_services.sh not available; skipping step 2"
fi

# 3) ui_bind.info (if present)
if [ -f "00_xibalba_alpaca/local-agent-logs/ui_bind.info" ]; then
  run_and_capture "ui_bind_info" cat "00_xibalba_alpaca/local-agent-logs/ui_bind.info" || true
  # Try to extract host and port (very small heuristic)
  UI_HOST="$(sed -n 's/.*\"host\"\s*:\s*\"\([^"]*\)\".*/\1/p' 00_xibalba_alpaca/local-agent-logs/ui_bind.info || true)"
  UI_PORT="$(sed -n 's/.*\"port\"\s*:\s*\([0-9]*\).*/\1/p' 00_xibalba_alpaca/local-agent-logs/ui_bind.info || true)"
fi

# 4) Tail UI and agent logs (last 400 lines each)
if [ -f "00_xibalba_alpaca/local-agent-logs/ui_server.log" ]; then
  run_and_capture "tail_ui_server_log" tail -n 400 "00_xibalba_alpaca/local-agent-logs/ui_server.log" || true
else
  echo "ui log not found" >"$OUTDIR/ui_log_missing.txt"
  log "UI server log not found"
fi

if [ -f "00_xibalba_alpaca/local-agent-logs/agent.log" ]; then
  run_and_capture "tail_agent_log" tail -n 400 "00_xibalba_alpaca/local-agent-logs/agent.log" || true
else
  echo "agent log not found" >"$OUTDIR/agent_log_missing.txt"
  log "Agent log not found"
fi

# 5) Try the health endpoint on 127.0.0.1:8765
if command -v curl >/dev/null 2>&1; then
  run_and_capture "curl_health_default" curl -sS -D "$OUTDIR/curl_health_default.headers" "http://127.0.0.1:8765/health" || true
else
  log "curl not available; skipping curl to 127.0.0.1:8765/health"
fi

# 6) If ui_bind.info reported a different host/port, test that too
if [ -n "${UI_HOST:-}" ] && [ -n "${UI_PORT:-}" ]; then
  log "ui_bind.info reported host=${UI_HOST:-} port=${UI_PORT:-}"
  if command -v curl >/dev/null 2>&1; then
    run_and_capture "curl_health_ui_bind" curl -sS -D "$OUTDIR/curl_health_ui_bind.headers" "http://${UI_HOST}:${UI_PORT}/health" || true
  fi
else
  log "No ui_bind.info host/port available to test"
fi

# 7) Gather pidfiles & process state
PIDFILES=(00_xibalba_alpaca/local-agent-logs/*.pid)
if [ "${#PIDFILES[@]}" -gt 0 ]; then
  for pf in "${PIDFILES[@]}"; do
    [ -f "$pf" ] || continue
    run_and_capture "cat_pid_$(basename "$pf")" cat "$pf" || true
    pid="$(cat "$pf" 2>/dev/null || true)"
    if [ -n "$pid" ] && ps -p "$pid" >/dev/null 2>&1; then
      run_and_capture "ps_cmd_${pid}" ps -p "$pid" -o pid,etime,cmd || true
      run_and_capture "ls_proc_fd_${pid}" ls -l "/proc/${pid}/fd" || true
    else
      echo "pid ${pid} from ${pf} not running" >"$OUTDIR/pid_${pid}_not_running.txt"
    fi
  done
else
  log "No pidfiles found in local-agent-logs/"
fi

# 8) System / environment info useful for debugging
run_and_capture "uname" uname -a || true
if command -v lsb_release >/dev/null 2>&1; then
  run_and_capture "lsb_release" lsb_release -a || true
fi
run_and_capture "whoami" whoami || true
run_and_capture "id" id || true
run_and_capture "env_sorted" env | sort || true
if command -v python3 >/dev/null 2>&1; then
  run_and_capture "python3_version" python3 --version || true
  # Only attempt pip freeze if pip exists and is accessible
  if python3 -c "import pkgutil" >/dev/null 2>&1; then
    if command -v pip3 >/dev/null 2>&1; then
      run_and_capture "pip3_freeze" pip3 freeze || true
    fi
  fi
fi

# 9) Lightweight docker / wsl / virtualization hints
if [ -f "/proc/version" ]; then
  run_and_capture "proc_version" sed -n '1p' /proc/version || true
fi
if [ -f "/.dockerenv" ] || [ -n "${KUBERNETES_SERVICE_HOST:-}" ]; then
  echo "container_environment_detected" >"$OUTDIR/container_env_hint.txt"
  log "Container environment hint detected"
fi

# 10) Helpful pointers for human: if the health curl failed but logs exist, capture the very last 200 lines again for readability
if [ -f "00_xibalba_alpaca/local-agent-logs/ui_server.log" ]; then
  run_and_capture "tail_ui_server_log_short" tail -n 200 "00_xibalba_alpaca/local-agent-logs/ui_server.log" || true
fi
if [ -f "00_xibalba_alpaca/local-agent-logs/agent.log" ]; then
  run_and_capture "tail_agent_log_short" tail -n 200 "00_xibalba_alpaca/local-agent-logs/agent.log" || true
fi

# 11) Save the ensure_services output tee file if /tmp was used inside the helper
if [ -f "/tmp/ensure_services.out" ]; then
  cp -a "/tmp/ensure_services.out" "$OUTDIR/" || true
fi

# 12) Package results
ARCHIVE="/tmp/xibalba_local_diagnostics_${TIMESTAMP}.tar.gz"
tar -czf "$ARCHIVE" -C "$OUTDIR" . || {
  log "Failed to create archive $ARCHIVE; leaving collected files in $OUTDIR"
  log "Contents of $OUTDIR:"
  ls -alh "$OUTDIR" || true
  exit 0
}

log "Diagnostics complete."
log "Directory: $OUTDIR"
log "Archive:   $ARCHIVE"

cat <<EOF >"$OUTDIR/README.txt"
Local diagnostics bundle created by run_local_diagnostics.sh
Timestamp: $TIMESTAMP

What I collected:
- Port checks for :8765 (ss/lsof/netstat output)
- ensure_services.sh stdout/stderr (timed)
- ui_bind.info (if present)
- ui_server.log & agent.log tails
- curl results for /health (127.0.0.1:8765 and any host/port reported in ui_bind.info)
- pidfile contents and ps for running pids
- basic system and env info (uname, whoami, env, python version)
- a run.log recording what was executed and when

Next steps I recommend:
- Upload the resulting archive ($ARCHIVE) or paste the key files:
  - ensure_services.* files
  - ui_bind_info.out
  - tail_ui_server_log.out
  - tail_agent_log.out
  - curl_health*.out
- If you want me to attempt automatic fixes (e.g. modify helper to bind 0.0.0.0 or rerun the UI in foreground), say "Bind 0.0.0.0 now" or run the foreground UI command manually and include its trace:
  LOCAL_AGENT_UI_HOST=127.0.0.1 LOCAL_AGENT_UI_PORT=8765 python3 00_xibalba_alpaca/local-agent/ui_server.py

EOF

log "Wrote $OUTDIR/README.txt"
log "Done. Please upload or paste the archive ($ARCHIVE) or the files you want me to inspect."
