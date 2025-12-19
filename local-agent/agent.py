#!/usr/bin/env python3
"""
local-agent/agent.py

Simple local agent daemon to watch a directory (hybrid-queue) for `.cmd` files,
validate them, and execute the contained command in a constrained subprocess.
Results are written as JSON to a results directory (hybrid-results/<job_id>.result).

Behavior & Safety:
- Only executes files that begin with the magic header '#hybrid-mode'.
- Optionally validates a SECRET_TOKEN included in the .cmd file against an
  environment-provided token (HYBRID_SECRET or --secret).
- Parses command as either a JSON array (["/bin/echo","hello"]) or a shell-like
  tokenized command (shlex.split).
- Limits CPU time and memory via resource limits (POSIX systems).
- Runs subprocesses without a shell (shell=False).
- Writes results atomically (temp file then os.replace).
- Renames .cmd -> .running while processing to avoid double-processing.
- Logs to stdout and an optional log file.

Usage:
  python local-agent/agent.py \
    --queue 00_xibalba_alpaca/hybrid-queue \
    --results 00_xibalba_alpaca/hybrid-results \
    --secret "mytoken" \
    --poll-interval 2

Note: This agent requires Python 3.7+. It is intentionally small and
dependency-free (only stdlib). It is not a full sandbox. For production use,
run each job in a container or proper sandbox and add stronger isolation.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from typing import List, Optional, Tuple

# resource is POSIX-only; import conditionally for portability
try:
    import resource  # type: ignore
except Exception:
    resource = None  # type: ignore

# ---------- Defaults / Config ----------
DEFAULT_POLL_INTERVAL = 2.0  # seconds
DEFAULT_MAX_SECONDS = 300  # per-job CPU limit (seconds)
DEFAULT_AS_MB = 512  # virtual memory limit in MB
DEFAULT_MAX_OUTPUT_BYTES = 200_000  # truncate stdout/stderr to this many bytes

MAGIC_HEADER = "#hybrid-mode"
CMD_SUFFIX = ".cmd"
RUNNING_SUFFIX = ".running"
RESULT_SUFFIX = ".result"
LOGFILE = "local-agent.log"


# ---------- Utilities ----------
def now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def safe_makedirs(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def atomic_write_json(path: str, data: dict) -> None:
    dirn = os.path.dirname(path)
    safe_makedirs(dirn)
    fd, tmp = tempfile.mkstemp(prefix=".tmp.", dir=dirn)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except Exception:
                pass


# ---------- Command Parsing ----------
def parse_cmd_file(contents: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Parse a .cmd file content.

    Returns (secret_token, command_text, error_message).
    command_text is the raw command payload after headers (may be JSON array or shell string).
    """
    lines = contents.splitlines()
    if not lines:
        return None, None, "empty file"

    # Expect first non-empty line to be MAGIC_HEADER
    idx = 0
    while idx < len(lines) and lines[idx].strip() == "":
        idx += 1
    if idx >= len(lines):
        return None, None, "no content"

    if not lines[idx].strip().startswith(MAGIC_HEADER):
        return None, None, f"missing magic header {MAGIC_HEADER!r}"

    idx += 1
    secret = None
    # parse optional SECRET_TOKEN lines until blank line
    while idx < len(lines):
        line = lines[idx]
        if line.strip() == "":
            idx += 1
            break
        if ":" in line:
            key, val = line.split(":", 1)
            if key.strip().upper() == "SECRET_TOKEN":
                secret = val.strip()
        idx += 1

    # remaining lines are command payload
    cmd_lines = lines[idx:]
    cmd_text = "\n".join(cmd_lines).strip()
    if not cmd_text:
        return secret, None, "no command payload found"
    return secret, cmd_text, None


def build_command(cmd_text: str) -> Tuple[Optional[List[str]], Optional[str]]:
    """
    Build a command list from the cmd_text.

    Supports either a JSON array or a shell-like string. Returns (argv_list, error).
    """
    # Try JSON first
    try:
        payload = json.loads(cmd_text)
        if isinstance(payload, list) and all(isinstance(x, str) for x in payload):
            return payload, None
        # If it's a dict with single key "command", accept it
        if isinstance(payload, dict) and "command" in payload:
            cmd = payload["command"]
            if isinstance(cmd, list) and all(isinstance(x, str) for x in cmd):
                return cmd, None
    except Exception:
        pass

    # Fallback: split using shlex
    try:
        argv = shlex.split(cmd_text)
        if argv:
            return argv, None
    except Exception as e:
        return None, f"failed to parse command: {e}"

    return None, "could not parse command payload"


# ---------- Resource limits ----------
def apply_resource_limits(
    cpu_seconds: int = DEFAULT_MAX_SECONDS, as_mb: int = DEFAULT_AS_MB
) -> None:
    """
    Apply soft limits for the child process (POSIX only).
    This function is intended to be used as preexec_fn in subprocess.
    """
    if resource is None:
        return

    try:
        # CPU time (seconds)
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 5))
    except Exception:
        pass
    try:
        # Address space (virtual memory) limit
        as_bytes = as_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (as_bytes, as_bytes))
    except Exception:
        pass
    try:
        # file size
        resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))
    except Exception:
        pass


# ---------- Job execution ----------
def run_job(argv: List[str], timeout: int, max_output: int) -> Tuple[int, str, str]:
    """
    Execute command argv safely, return (exit_code, stdout, stderr).
    stdout/stderr are truncated to max_output bytes.
    """
    logging.info("Executing command argv=%r timeout=%s", argv, timeout)
    try:
        # Start the process without a shell. Use preexec_fn to set resource limits.
        preexec = None
        if resource is not None:
            preexec = lambda: apply_resource_limits(
                cpu_seconds=timeout, as_mb=DEFAULT_AS_MB
            )

        proc = subprocess.Popen(
            argv,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            preexec_fn=preexec,
            close_fds=True,
            start_new_session=True,
        )

        try:
            out, err = proc.communicate(timeout=timeout + 5)
        except subprocess.TimeoutExpired:
            logging.warning("Process timed out, killing process group")
            try:
                proc.kill()
            except Exception:
                pass
            out, err = proc.communicate(timeout=5)
            returncode = -1
        else:
            returncode = proc.returncode

        # truncate outputs
        stdout_text = (out or b"").decode("utf-8", errors="replace")
        stderr_text = (err or b"").decode("utf-8", errors="replace")
        if len(stdout_text) > max_output:
            stdout_text = stdout_text[:max_output] + "\n...[truncated]"
        if len(stderr_text) > max_output:
            stderr_text = stderr_text[:max_output] + "\n...[truncated]"

        return returncode, stdout_text, stderr_text
    except Exception as e:
        logging.exception("Unexpected error during command execution")
        return -1, "", f"agent-exception: {e}"


# ---------- Agent core ----------
class LocalAgent:
    def __init__(
        self,
        queue_dir: str,
        results_dir: str,
        secret: Optional[str] = None,
        poll_interval: float = DEFAULT_POLL_INTERVAL,
        max_seconds: int = DEFAULT_MAX_SECONDS,
        max_output: int = DEFAULT_MAX_OUTPUT_BYTES,
        dry_run: bool = False,
    ) -> None:
        self.queue_dir = os.path.abspath(queue_dir)
        self.results_dir = os.path.abspath(results_dir)
        self.secret = secret
        self.poll_interval = float(poll_interval)
        self.max_seconds = int(max_seconds)
        self.max_output = int(max_output)
        self.dry_run = bool(dry_run)
        self._stopped = False

        safe_makedirs(self.queue_dir)
        safe_makedirs(self.results_dir)
        logging.debug("Agent queue=%s results=%s", self.queue_dir, self.results_dir)

    def stop(self) -> None:
        self._stopped = True

    def list_jobs(self) -> List[str]:
        try:
            names = [
                f
                for f in os.listdir(self.queue_dir)
                if f.endswith(CMD_SUFFIX)
                and os.path.isfile(os.path.join(self.queue_dir, f))
            ]
            # sort by modification time (oldest first)
            names.sort(key=lambda n: os.path.getmtime(os.path.join(self.queue_dir, n)))
            return names
        except Exception as e:
            logging.exception("Failed to list queue dir: %s", e)
            return []

    def claim_job(self, fname: str) -> Optional[str]:
        """
        Atomically rename fname -> fname.running to claim it.
        Returns the path to the claimed file or None if claim failed.
        """
        src = os.path.join(self.queue_dir, fname)
        dst = os.path.join(self.queue_dir, fname + RUNNING_SUFFIX)
        try:
            os.rename(src, dst)
            logging.info("Claimed job %s", fname)
            return dst
        except FileNotFoundError:
            logging.debug(
                "File not found when claiming (maybe claimed by another): %s", src
            )
            return None
        except Exception:
            logging.exception("Failed to claim job %s", src)
            return None

    def complete_job(self, running_path: str, job_id: str, result: dict) -> None:
        # write result to results_dir/<job_id>.result atomically
        result_path = os.path.join(self.results_dir, f"{job_id}{RESULT_SUFFIX}")
        try:
            atomic_write_json(result_path, result)
            logging.info("Wrote result for %s -> %s", job_id, result_path)
        except Exception:
            logging.exception("Failed to write result for %s", job_id)
        finally:
            # remove the running file
            try:
                if os.path.exists(running_path):
                    os.remove(running_path)
            except Exception:
                logging.exception("Failed to remove running file %s", running_path)

    def process_single(self, fname: str) -> None:
        claimed = self.claim_job(fname)
        if not claimed:
            return

        job_basename = os.path.basename(fname)
        job_id = (
            job_basename[: -len(CMD_SUFFIX)]
            if job_basename.endswith(CMD_SUFFIX)
            else job_basename
        )

        try:
            with open(claimed, "r", encoding="utf-8", errors="replace") as f:
                contents = f.read()
        except Exception:
            logging.exception("Failed to read claimed file %s", claimed)
            result = {
                "exitCode": -1,
                "stdout": "",
                "stderr": "failed to read command file",
                "timestamp": now_iso(),
            }
            self.complete_job(claimed, job_id, result)
            return

        secret_in_file, cmd_text, parse_err = parse_cmd_file(contents)
        if parse_err:
            logging.warning("Failed to parse .cmd %s: %s", fname, parse_err)
            result = {
                "exitCode": -1,
                "stdout": "",
                "stderr": f"parse-error: {parse_err}",
                "timestamp": now_iso(),
            }
            self.complete_job(claimed, job_id, result)
            return

        # Secret validation if configured
        if self.secret is not None:
            if not secret_in_file or secret_in_file != self.secret:
                logging.warning("Secret mismatch for job %s", job_id)
                result = {
                    "exitCode": 1,
                    "stdout": "",
                    "stderr": "SECRET_TOKEN missing or invalid",
                    "timestamp": now_iso(),
                }
                self.complete_job(claimed, job_id, result)
                return

        # build argv
        argv, build_err = build_command(cmd_text)
        if build_err or not argv:
            logging.warning("Failed to build command for %s: %s", job_id, build_err)
            result = {
                "exitCode": -1,
                "stdout": "",
                "stderr": f"command-parse-error: {build_err}",
                "timestamp": now_iso(),
            }
            self.complete_job(claimed, job_id, result)
            return

        # If dry-run, skip execution and return success with printed command
        if self.dry_run:
            result = {
                "exitCode": 0,
                "stdout": f"dry-run: {' '.join(argv)}",
                "stderr": "",
                "timestamp": now_iso(),
            }
            self.complete_job(claimed, job_id, result)
            return

        # Run the job
        exit_code, stdout, stderr = run_job(
            argv, timeout=self.max_seconds, max_output=self.max_output
        )

        result = {
            "exitCode": 0 if exit_code is None else int(exit_code),
            "stdout": stdout,
            "stderr": stderr,
            "timestamp": now_iso(),
        }
        self.complete_job(claimed, job_id, result)

    def run_loop(self) -> None:
        logging.info(
            "Agent starting; queue=%s results=%s", self.queue_dir, self.results_dir
        )
        while not self._stopped:
            try:
                jobs = self.list_jobs()
                if not jobs:
                    time.sleep(self.poll_interval)
                    continue
                for fname in jobs:
                    if self._stopped:
                        break
                    try:
                        self.process_single(fname)
                    except Exception:
                        logging.exception("Error processing job %s", fname)
            except Exception:
                logging.exception("Agent main loop encountered an error")
                time.sleep(self.poll_interval)

        logging.info("Agent stopped.")


# ---------- CLI ----------
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Local hybrid-agent that runs .cmd files from a directory"
    )
    p.add_argument(
        "--queue",
        default=os.environ.get("HYBRID_QUEUE", "hybrid-queue"),
        help="Path to hybrid-queue dir",
    )
    p.add_argument(
        "--results",
        default=os.environ.get("HYBRID_RESULTS", "hybrid-results"),
        help="Path to results dir",
    )
    p.add_argument(
        "--secret",
        default=os.environ.get("HYBRID_SECRET"),
        help="SECRET_TOKEN value to accept (optional)",
    )
    p.add_argument(
        "--poll-interval",
        type=float,
        default=float(os.environ.get("POLL_INTERVAL", DEFAULT_POLL_INTERVAL)),
        help="Seconds between polling the queue",
    )
    p.add_argument(
        "--max-seconds",
        type=int,
        default=int(os.environ.get("JOB_MAX_SECONDS", DEFAULT_MAX_SECONDS)),
        help="Per-job timeout (seconds)",
    )
    p.add_argument(
        "--max-output",
        type=int,
        default=int(os.environ.get("JOB_MAX_OUTPUT", DEFAULT_MAX_OUTPUT_BYTES)),
        help="Max bytes of stdout/stderr to store",
    )
    p.add_argument(
        "--dry-run", action="store_true", help="Do not actually run commands, just echo"
    )
    p.add_argument(
        "--log-file",
        default=os.environ.get("AGENT_LOG", LOGFILE),
        help="Path to log file",
    )
    return p.parse_args()


def setup_logging(log_file: Optional[str]) -> None:
    handlers = [logging.StreamHandler(sys.stdout)]
    if log_file:
        handlers.append(logging.FileHandler(log_file))
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=handlers,
    )


def main() -> None:
    args = parse_args()
    setup_logging(args.log_file)
    agent = LocalAgent(
        queue_dir=args.queue,
        results_dir=args.results,
        secret=args.secret,
        poll_interval=args.poll_interval,
        max_seconds=args.max_seconds,
        max_output=args.max_output,
        dry_run=args.dry_run,
    )

    def _signal_handler(signum, frame):
        logging.info("Received signal %s, stopping agent...", signum)
        agent.stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _signal_handler)
        except Exception:
            pass

    try:
        agent.run_loop()
    except KeyboardInterrupt:
        logging.info("Interrupted by user")
    except Exception:
        logging.exception("Agent exited with exception")
    finally:
        logging.info("Agent exiting")


if __name__ == "__main__":
    main()
