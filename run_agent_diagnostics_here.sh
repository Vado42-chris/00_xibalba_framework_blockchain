#!/usr/bin/env bash
#
# 00_xibalba_alpaca/run_agent_diagnostics_here.sh
#
# Single-command helper for non-experts:
# - Runs the bundled diagnostics script (if present)
# - Locates the produced archive in /tmp
# - Extracts the archive into 00_xibalba_alpaca/local-agent-logs/diagnostics/<timestamp>/
# - Creates a local git branch and commits the extracted diagnostics (no push by default)
#
# Usage (from anywhere):
#   bash 00_xibalba_alpaca/run_agent_diagnostics_here.sh
# or make executable:
#   chmod +x 00_xibalba_alpaca/run_agent_diagnostics_here.sh
#   ./00_xibalba_alpaca/run_agent_diagnostics_here.sh
#
# Optional:
#   --push   : attempt to push the new branch to the remote (use only if you know you have remote credentials)
#
set -euo pipefail
IFS=$'\n\t'

# --- Simple helpers ---
log() { printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"; }
err() { printf '%s ERROR: %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" >&2; }

# --- Resolve paths ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
BASE_DIR="$SCRIPT_DIR"                            # this script lives in 00_xibalba_alpaca/
SCRIPTS_DIR="$BASE_DIR/scripts"
LOGS_DIR="$BASE_DIR/local-agent-logs"
DIAG_DIR="$LOGS_DIR/diagnostics"

DIAG_SCRIPT="$SCRIPTS_DIR/run_local_diagnostics.sh"
ENSURE_SCRIPT="$SCRIPTS_DIR/ensure_services.sh"

PUSH=false
while [ $# -gt 0 ]; do
  case "$1" in
    --push) PUSH=true; shift ;;
    -h|--help) echo "Usage: $0 [--push]"; exit 0 ;;
    *) echo "Unknown option: $1"; echo "Usage: $0 [--push]"; exit 2 ;;
  esac
done

# --- Make output dirs ---
mkdir -p "$DIAG_DIR"

log "Starting one-shot diagnostics helper."
log "Base dir: $BASE_DIR"

# --- Run diagnostics script (if available) or fallback to ensure_services helper ---
ARCHIVE=""
if [ -x "$DIAG_SCRIPT" ]; then
  log "Running diagnostics script: $DIAG_SCRIPT (this may take ~30-90s)"
  TMP_OUT="$(mktemp /tmp/run_agent_diag_out.XXXXXX)"
  # don't abort on diagnostics non-zero; we still try to find an archive
  set +e
  bash "$DIAG_SCRIPT" 2>&1 | tee "$TMP_OUT"
  DIAG_RC=$?
  set -e
  log "Diagnostics script finished (exit=$DIAG_RC). Searching for archive in output..."
  ARCHIVE="$(grep -o '/tmp/xibalba_local_diagnostics_[0-9_]*\.tar\.gz' "$TMP_OUT" 2>/dev/null | tail -n1 || true)"
  if [ -z "$ARCHIVE" ]; then
    ARCHIVE="$(grep -o '/tmp/local-agent-diag-[^ ]*\.tar\.gz' "$TMP_OUT" 2>/dev/null | tail -n1 || true)"
  fi
  if [ -z "$ARCHIVE" ]; then
    log "No archive found in diagnostics output; scanning /tmp for recent archives..."
  fi
else
  log "Diagnostics script not executable or missing: $DIAG_SCRIPT"
  log "As a fallback the helper will run the service starter which may trigger diagnostics."
  if [ -x "$ENSURE_SCRIPT" ]; then
    log "Running fallback helper: $ENSURE_SCRIPT (this may also run diagnostics)"
    TMP_OUT="$(mktemp /tmp/run_agent_diag_out.XXXXXX)"
    set +e
    bash "$ENSURE_SCRIPT" 2>&1 | tee "$TMP_OUT"
    ENSURE_RC=$?
    set -e
    log "Fallback helper finished (exit=$ENSURE_RC). Searching for archive in output..."
    ARCHIVE="$(grep -o '/tmp/xibalba_local_diagnostics_[0-9_]*\.tar\.gz' "$TMP_OUT" 2>/dev/null | tail -n1 || true)"
    if [ -z "$ARCHIVE" ]; then
      ARCHIVE="$(grep -o '/tmp/local-agent-diag-[^ ]*\.tar\.gz' "$TMP_OUT" 2>/dev/null | tail -n1 || true)"
    fi
  else
    err "Neither diagnostics script nor ensure_services helper is available. Please run the appropriate helper manually."
    exit 1
  fi
fi

# --- If we didn't find archive in output, check well-known /tmp patterns ---
if [ -z "${ARCHIVE:-}" ]; then
  ARCHIVE="$(ls -1t /tmp/xibalba_local_diagnostics_*.tar.gz 2>/dev/null | head -n1 || true)"
fi
if [ -z "${ARCHIVE:-}" ]; then
  ARCHIVE="$(ls -1t /tmp/local-agent-diag-*.tar.gz 2>/dev/null | head -n1 || true)"
fi

if [ -z "${ARCHIVE:-}" ]; then
  err "No diagnostics archive found in /tmp. Please ensure run_local_diagnostics.sh exists and produces an archive."
  err "If you want manual help: run the diagnostics script or run the UI in foreground to capture errors."
  exit 2
fi

if [ ! -f "$ARCHIVE" ]; then
  err "Archive path found but file missing: $ARCHIVE"
  exit 3
fi

log "Found diagnostics archive: $ARCHIVE"

# --- Extract archive into diagnostics folder with timestamp ---
ARCHIVE_BN="$(basename "$ARCHIVE")"
# prefer to derive timestamp from filename if possible, else use current time
if [[ "$ARCHIVE_BN" =~ ([0-9_]{8,}) ]]; then
  TS_PART="${BASH_REMATCH[1]}"
else
  TS_PART="$(date -u +%Y%m%dT%H%M%SZ)"
fi

TARGET_DIR="$DIAG_DIR/$TS_PART"
mkdir -p "$TARGET_DIR"

log "Extracting archive into: $TARGET_DIR"
tar -xzf "$ARCHIVE" -C "$TARGET_DIR" || {
  err "Extraction failed. Copying archive file into diagnostics directory for manual inspection."
  cp -a "$ARCHIVE" "$TARGET_DIR/" || true
}

# Also copy the archive itself for convenience
cp -a "$ARCHIVE" "$TARGET_DIR/" || true

log "Extraction complete. Diagnostics available at: $TARGET_DIR"

# --- Commit into git locally (safe default: no push) ---
if command -v git >/dev/null 2>&1 && [ -d ".git" ]; then
  # create branch diag/<ts>
  BRANCH="diag/${TS_PART}"
  log "Preparing git branch: $BRANCH"
  # Use current branch as base but create the diag branch
  set +e
  git rev-parse --verify "$BRANCH" >/dev/null 2>&1
  BRANCH_EXISTS=$?
  set -e
  if [ "$BRANCH_EXISTS" -eq 0 ]; then
    log "Branch $BRANCH already exists. Using it."
    git checkout "$BRANCH"
  else
    git checkout -b "$BRANCH"
  fi

  # Add only the diagnostics target dir to the index
  git add --force "$TARGET_DIR"
  # Use a clear commit message
  COMMIT_MSG="Add local diagnostics bundle: $ARCHIVE_BN ($TS_PART)"
  # Commit if there are staged changes
  if git diff --cached --quiet; then
    log "No changes to commit (diagnostics may already be present)."
  else
    git commit -m "$COMMIT_MSG" || {
      err "git commit failed. You can manually inspect $TARGET_DIR and commit as needed."
    }
    log "Committed diagnostics into branch: $BRANCH"
  fi

  if [ "$PUSH" = true ]; then
    # Confirm push intention once more to avoid accidental remote operations
    read -r -p "You requested push. Confirm push branch '$BRANCH' to 'origin' [yes/no]: " CONF
    if [ "$CONF" = "yes" ]; then
      log "Pushing branch $BRANCH to origin..."
      set +e
      git push --set-upstream origin "$BRANCH"
      PUSH_RC=$?
      set -e
      if [ "$PUSH_RC" -ne 0 ]; then
        err "Push failed (exit $PUSH_RC). You may need to configure credentials or push manually."
      else
        log "Branch pushed to origin/$BRANCH"
      fi
    else
      log "Push cancelled by user. Branch and commit exist locally."
    fi
  else
    log "Push not requested. Branch and commit exist locally. Use 'git push' if you want to share it."
  fi

else
  log "Git not available or this directory is not a git repository. Diagnostics copied to: $TARGET_DIR"
  log "To share diagnostics, upload the archive or the extracted folder."
fi

log "Done. Diagnostics directory: $TARGET_DIR"
log "If you want me to analyze these, please upload the folder or inform me the branch name and I will inspect it."
exit 0
