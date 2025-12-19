#!/usr/bin/env bash
#
# agent_autorun.sh
#
# Automated agent-runner helper:
# - Runs the local diagnostics script (if present)
# - Extracts the produced diagnostics archive into the repo under
#   00_xibalba_alpaca/local-agent-logs/diagnostics/<timestamp>/
# - Writes a small summary file with key probe results
# - Optionally commits the extracted logs into git and optionally pushes
#
# Safety first:
# - No automatic push unless explicitly enabled via flag or environment.
# - Avoids adding any large binaries; only text-based artifacts are committed
#   (you can configure allowed extensions below).
#
# Usage:
#  ./00_xibalba_alpaca/scripts/agent_autorun.sh [--help] [--no-diagnostics]
#    [--archive /path/to/archive.tar.gz] [--commit] [--push] [--branch NAME]
#    [--allow-extensions ".log,.out,.txt,.json"]
#
# Examples:
#  # Run local diagnostics, extract, and write logs into the repo (no git)
#  ./scripts/agent_autorun.sh
#
#  # Run diagnostics and commit results locally (no push)
#  ./scripts/agent_autorun.sh --commit
#
#  # Use an existing diagnostics archive, commit and push to origin/main
#  ./scripts/agent_autorun.sh --archive /tmp/xibalba_local_diagnostics_20250101_120000.tar.gz --commit --push --branch diagnostics/auto
#
# Environment variables:
#  AGENT_AUTORUN_PUSH_CONFIRMATION="yes"  # alternative to --push (if set to "yes" allows push)
#
# NOTES:
# - This script assumes it's run from the repo root (or will change into it).
# - It will not push to remote unless you explicitly pass --push or set
#   AGENT_AUTORUN_PUSH_CONFIRMATION="yes".
#
set -euo pipefail
IFS=$'\n\t'

PROGNAME="$(basename "$0")"
REPO_ROOT="$(cd "$(dirname "$0")/.." >/dev/null 2>&1 && pwd)"
DIAG_SCRIPT="00_xibalba_alpaca/scripts/run_local_diagnostics.sh"
LOGS_DIR="00_xibalba_alpaca/local-agent-logs"
DIAG_REPO_DIR="${LOGS_DIR}/diagnostics"
DEFAULT_ALLOWED_EXTENSIONS=".log,.out,.txt,.json,.meta"

# Defaults
DO_DIAGNOSTICS=true
ARCHIVE_PATH=""
DO_COMMIT=false
DO_PUSH=false
GIT_BRANCH=""
ALLOW_EXTENSIONS="$DEFAULT_ALLOWED_EXTENSIONS"

usage() {
  cat <<EOF
$PROGNAME - automated agent-runner diagnostics & optional git commit/push

Usage:
  $PROGNAME [options]

Options:
  --help                 Show this help
  --no-diagnostics       Skip running the diagnostics script; use --archive instead
  --archive PATH         Use an existing diagnostics tar.gz archive instead of running diagnostics
  --commit               Stage and commit the extracted diagnostics into git (local commit)
  --push                 Push the commit to the remote (requires --commit)
  --branch NAME          Create/check out branch NAME before commit (if omitted uses current branch)
  --allow-extensions LIST Comma-separated list of allowed file extensions to include in the commit (default: ${DEFAULT_ALLOWED_EXTENSIONS})
  --confirm-push         Shortcut to bypass interactive confirmation for pushing (or set AGENT_AUTORUN_PUSH_CONFIRMATION=yes)

Notes:
  - The script writes extracted diagnostics under: ${DIAG_REPO_DIR}/<timestamp>/
  - The script will not push to remote unless you pass --push or set AGENT_AUTORUN_PUSH_CONFIRMATION=yes
EOF
}

# Simple logger
log() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"
}

# Parse args
while [ $# -gt 0 ]; do
  case "$1" in
    --help) usage; exit 0;;
    --no-diagnostics) DO_DIAGNOSTICS=false; shift;;
    --archive) ARCHIVE_PATH="$2"; shift 2;;
    --commit) DO_COMMIT=true; shift;;
    --push) DO_PUSH=true; shift;;
    --branch) GIT_BRANCH="$2"; shift 2;;
    --allow-extensions) ALLOW_EXTENSIONS="$2"; shift 2;;
    --confirm-push) export AGENT_AUTORUN_PUSH_CONFIRMATION="yes"; shift;;
    *) echo "Unknown argument: $1"; usage; exit 1;;
  esac
done

# Confirm the repo root exists
if [ ! -d "$REPO_ROOT" ]; then
  echo "ERROR: repo root not found at $REPO_ROOT"
  exit 2
fi

cd "$REPO_ROOT"

# Sanity checks for git if commiting/pushing is requested
if $DO_COMMIT; then
  if ! command -v git >/dev/null 2>&1; then
    echo "ERROR: git not available but --commit was requested"
    exit 3
  fi
fi

if $DO_PUSH && ! $DO_COMMIT; then
  echo "ERROR: --push requires --commit"
  exit 4
fi

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
OUT_SUBDIR="${DIAG_REPO_DIR}/${TIMESTAMP}"
mkdir -p "$OUT_SUBDIR"

# Run diagnostics unless user provided an archive or disabled diagnostics
if [ -n "$ARCHIVE_PATH" ]; then
  if [ ! -f "$ARCHIVE_PATH" ]; then
    echo "ERROR: specified archive not found: $ARCHIVE_PATH"
    exit 5
  fi
  FOUND_ARCHIVE="$ARCHIVE_PATH"
else
  if $DO_DIAGNOSTICS; then
    if [ ! -x "$DIAG_SCRIPT" ]; then
      if [ -f "$DIAG_SCRIPT" ]; then
        log "Making diagnostics script executable: $DIAG_SCRIPT"
        chmod +x "$DIAG_SCRIPT"
      else
        echo "ERROR: diagnostics script not found at $DIAG_SCRIPT"
        exit 6
      fi
    fi

    log "Running diagnostics script..."
    # The diagnostics script should print the produced archive path at the end.
    # We'll run it and attempt to find the archive in /tmp afterwards as fallback.
    if ! bash "$DIAG_SCRIPT"; then
      log "Diagnostics script returned non-zero exit code; continuing to check for produced artifacts..."
    fi

    # Try to find the newest diagnostics archive in /tmp that matches pattern
    FOUND_ARCHIVE="$(ls -1t /tmp/xibalba_local_diagnostics_*.tar.gz 2>/dev/null | head -n1 || true)"
    if [ -z "$FOUND_ARCHIVE" ]; then
      # older name /tmp/local-agent-diag-*.tar.gz compatibility:
      FOUND_ARCHIVE="$(ls -1t /tmp/local-agent-diag-*.tar.gz 2>/dev/null | head -n1 || true)"
    fi

    if [ -z "$FOUND_ARCHIVE" ]; then
      log "No diagnostics archive found in /tmp after running diagnostics."
      log "You can re-run the diagnostics script manually and pass --archive <path> to this script."
      exit 0
    fi

    log "Found diagnostics archive: $FOUND_ARCHIVE"
  else
    echo "Diagnostics disabled and no archive provided; nothing to do."
    exit 0
  fi
fi

# Extract the archive safely into the diagnostics folder
log "Extracting archive to ${OUT_SUBDIR}..."
mkdir -p "$OUT_SUBDIR"
if ! tar -xzf "$FOUND_ARCHIVE" -C "$OUT_SUBDIR"; then
  echo "ERROR: failed to extract $FOUND_ARCHIVE"
  exit 7
fi

# Create a small summary by probing known files if present
SUMMARY_FILE="${OUT_SUBDIR}/SUMMARY.txt"
{
  echo "Diagnostics archive: $FOUND_ARCHIVE"
  echo "Extracted at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo
  echo "Files extracted:"
  ls -la "$OUT_SUBDIR" || true
  echo
  echo "Probing for common outputs..."
  # show first lines of ensure_services output if present
  if [ -f "$OUT_SUBDIR/ensure_services.tee.out" ]; then
    echo "--- ensure_services.tee.out (first 200 lines) ---"
    head -n 200 "$OUT_SUBDIR/ensure_services.tee.out" || true
    echo
  fi
  if [ -f "$OUT_SUBDIR/ensure_services.out" ]; then
    echo "--- ensure_services.out (first 200 lines) ---"
    head -n 200 "$OUT_SUBDIR/ensure_services.out" || true
    echo
  fi
  # show ui_bind.info if present
  if [ -f "$OUT_SUBDIR/ui_bind.info" ]; then
    echo "--- ui_bind.info ---"
    cat "$OUT_SUBDIR/ui_bind.info" || true
    echo
  fi
  # show tails of logs if present
  if [ -f "$OUT_SUBDIR/ui_server.log" ]; then
    echo "--- ui_server.log (last 200 lines) ---"
    tail -n 200 "$OUT_SUBDIR/ui_server.log" || true
    echo
  fi
  if [ -f "$OUT_SUBDIR/agent.log" ]; then
    echo "--- agent.log (last 200 lines) ---"
    tail -n 200 "$OUT_SUBDIR/agent.log" || true
    echo
  fi
  # show curl health probe results if present
  for f in "$OUT_SUBDIR"/curl_health* 2>/dev/null; do
    [ -e "$f" ] || continue
    echo "--- $f (first 100 lines) ---"
    head -n 100 "$f" || true
    echo
  done
} > "$SUMMARY_FILE"

log "Wrote summary to $SUMMARY_FILE"

# Optionally stage and commit to git
if $DO_COMMIT; then
  # Only include files with allowed extensions to avoid adding large binary artifacts.
  # We will collect allowed files into a temporary commit directory, then add them.
  COMMIT_DIR=".tmp_diag_commit_${TIMESTAMP}"
  mkdir -p "$COMMIT_DIR"

  IFS=',' read -r -a ext_array <<< "$ALLOW_EXTENSIONS"

  # Copy allowed files preserving directory structure under the diagnostics folder
  log "Collecting allowed files for commit (extensions: $ALLOW_EXTENSIONS)"
  find "$OUT_SUBDIR" -type f | while read -r f; do
    fname="$(basename "$f")"
    for ext in "${ext_array[@]}"; do
      # normalize
      ext_trim="$(echo "$ext" | tr -d '[:space:]')"
      case "$fname" in
        *"$ext_trim")
          relpath="${f#$OUT_SUBDIR/}"
          dest_dir="$COMMIT_DIR/$(dirname "$relpath")"
          mkdir -p "$dest_dir"
          cp -a "$f" "$dest_dir/" || true
          ;;
      esac
    done
  done

  # Always include the SUMMARY.txt
  mkdir -p "$COMMIT_DIR"
  cp -a "$SUMMARY_FILE" "$COMMIT_DIR/" || true

  # If COMMIT_DIR is empty (no allowed files), abort commit
  if [ -z "$(ls -A "$COMMIT_DIR" 2>/dev/null || true)" ]; then
    echo "No allowed files found to commit. Aborting commit step."
  else
    # Create or switch branch if requested
    if [ -n "$GIT_BRANCH" ]; then
      log "Checking out branch $GIT_BRANCH (creating if needed)..."
      if git rev-parse --verify "$GIT_BRANCH" >/dev/null 2>&1; then
        git checkout "$GIT_BRANCH"
      else
        git checkout -b "$GIT_BRANCH"
      fi
    fi

    # Stage files into a single commit using git's index from COMMIT_DIR
    # We'll copy files into the intended target location under the repo and then git add them.
    TARGET_DIR="${DIAG_REPO_DIR}/${TIMESTAMP}"
    mkdir -p "$TARGET_DIR"
    # Copy collected files into the repo target dir
    cp -a "${COMMIT_DIR}/." "$TARGET_DIR/" || true

    # Now add & commit
    git add "$TARGET_DIR"
    COMMIT_MSG="Add diagnostics run: ${TIMESTAMP} (automated by ${PROGNAME})"
    git commit -m "$COMMIT_MSG" || {
      log "git commit failed (maybe no changes staged)."
    }
    log "Committed diagnostics into git: $TARGET_DIR"

    # Clean up temporary commit directory
    rm -rf "$COMMIT_DIR"
  fi
fi

# Optional push step
if $DO_PUSH; then
  # Confirm with the user unless AGENT_AUTORUN_PUSH_CONFIRMATION=yes
  if [ "${AGENT_AUTORUN_PUSH_CONFIRMATION:-}" != "yes" ]; then
    printf "\nWARNING: you requested --push. This will push commits to the remote repository.\n"
    read -r -p "Type 'yes' to confirm push to remote: " confirm
    if [ "$confirm" != "yes" ]; then
      echo "Push cancelled by user."
      exit 0
    fi
  fi

  # Determine remote and branch to push
  BRANCH_TO_PUSH="$(git rev-parse --abbrev-ref HEAD)"
  REMOTE="$(git remote | head -n1 || true)"
  if [ -z "$REMOTE" ]; then
    echo "ERROR: no git remote configured; cannot push."
    exit 8
  fi

  log "Pushing branch ${BRANCH_TO_PUSH} to remote ${REMOTE}..."
  git push "$REMOTE" "$BRANCH_TO_PUSH"
  log "Push completed."
fi

log "Done. Extracted diagnostics are in: ${OUT_SUBDIR}"
log "If you committed results, they are under git path: ${DIAG_REPO_DIR}/${TIMESTAMP}"

exit 0
