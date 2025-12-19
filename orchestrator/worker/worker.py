#!/usr/bin/env python3
"""
Simple local worker for the Xibalba orchestrator control plane.

- Polls the control plane /workers/claim endpoint to atomically claim PENDING jobs.
- Runs the claimed job's command as a local subprocess (safe for local dev only).
- Streams stdout/stderr lines back to the control plane via /jobs/{job_id}/append.
- Posts completion status to /jobs/{job_id}/complete.

Hybrid mode (recommended for local safety):
- The worker writes `.cmd` files into a `hybrid-queue` directory and waits for
  the hybrid-agent to write a `<job_id>.result` JSON file into `hybrid-results`.
- The hybrid-agent should enforce a whitelist/sandbox; this worker will not
  execute arbitrary commands when hybrid mode is enabled.

CLI flags:
  --api            Control plane base URL (required)
  --worker-id      Logical worker id (required)
  --hybrid-queue   Directory to write .cmd files (enables hybrid mode)
  --hybrid-results Directory to read .result files (enables hybrid mode)
  --hybrid-secret  Optional secret token to include in .cmd files
  --worker-secret  Optional header value to send as X-WORKER-SECRET (or set WORKER_SECRET env)

Notes:
- Hybrid mode is the safe default when you pass both --hybrid-queue and --hybrid-results.
- If hybrid dirs are not provided the worker falls back to local subprocess execution
  (useful for trusted local development).
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

import requests

VERSION = "0.2.0"

# Defaults
DEFAULT_POLL_INTERVAL = 3.0
DEFAULT_LOG_BATCH = 20
DEFAULT_REQUEST_TIMEOUT = 20
DEFAULT_HYBRID_POLL = 0.8


class WorkerStopped(Exception):
    pass


class LocalWorker:
    def __init__(
        self,
        api_url: str,
        worker_id: str,
        poll_interval: float = DEFAULT_POLL_INTERVAL,
        log_batch: int = DEFAULT_LOG_BATCH,
        request_timeout: int = DEFAULT_REQUEST_TIMEOUT,
        runtime_pref: Optional[str] = None,
        hybrid_queue: Optional[str] = None,
        hybrid_results: Optional[str] = None,
        hybrid_secret: Optional[str] = None,
        worker_secret: Optional[str] = None,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.worker_id = worker_id
        self.poll_interval = float(poll_interval)
        self.log_batch = int(log_batch)
        self.request_timeout = int(request_timeout)
        self.runtime_pref = runtime_pref

        self.session = requests.Session()
        self.stop_event = threading.Event()

        # Hybrid configuration
        self.hybrid_queue: Optional[Path] = Path(hybrid_queue) if hybrid_queue else None
        self.hybrid_results: Optional[Path] = (
            Path(hybrid_results) if hybrid_results else None
        )
        self.hybrid_secret = hybrid_secret or os.environ.get("HYBRID_SECRET_TOKEN")
        self.hybrid_poll = DEFAULT_HYBRID_POLL

        # Worker secret header support
        self.worker_secret = worker_secret or os.environ.get("WORKER_SECRET")
        if self.worker_secret:
            self.session.headers.update({"X-WORKER-SECRET": self.worker_secret})

    # ----- HTTP helpers -----
    def _post(self, path: str, payload: Any) -> requests.Response:
        url = f"{self.api_url}{path}"
        resp = self.session.post(url, json=payload, timeout=self.request_timeout)
        resp.raise_for_status()
        return resp

    def claim_job(self) -> Optional[Dict[str, Any]]:
        """
        POST /workers/claim with {"worker_id": ..., "runtime_pref": ...} and return
        the job dict, or None if no job is currently available.
        """
        url = f"{self.api_url}/workers/claim"
        payload: Dict[str, Any] = {"worker_id": self.worker_id}
        if self.runtime_pref:
            payload["runtime_pref"] = self.runtime_pref

        try:
            resp = self.session.post(url, json=payload, timeout=self.request_timeout)
        except requests.RequestException as e:
            print(f"[worker] claim request failed: {e}", file=sys.stderr)
            return None

        # 204 No Content or empty response -> no job
        if resp.status_code == 204 or not resp.content:
            return None

        try:
            data = resp.json()
            if not data:
                return None
            return data
        except ValueError:
            print("[worker] invalid JSON from claim response", file=sys.stderr)
            return None

    def append_logs(self, job_id: str, lines: List[str]) -> bool:
        """
        Append log lines to the control plane for a job.
        """
        try:
            resp = self._post(
                f"/jobs/{job_id}/append", {"worker_id": self.worker_id, "lines": lines}
            )
            return resp.status_code in (200, 204)
        except requests.RequestException as e:
            print(f"[worker] append_logs failed: {e}", file=sys.stderr)
            return False

    def complete_job(
        self,
        job_id: str,
        exit_code: int,
        success: bool,
        message: Optional[str] = None,
        result: Optional[Dict[str, Any]] = None,
    ) -> bool:
        payload: Dict[str, Any] = {
            "worker_id": self.worker_id,
            "exit_code": int(exit_code),
            "success": bool(success),
            "message": message or "",
        }
        if result is not None:
            payload["result"] = result
        try:
            resp = self._post(f"/jobs/{job_id}/complete", payload)
            return resp.status_code in (200, 201, 204)
        except requests.RequestException as e:
            print(f"[worker] complete_job failed: {e}", file=sys.stderr)
            return False

    # ----- Hybrid helpers -----
    def _ensure_hybrid_dirs(self) -> None:
        if not self.hybrid_queue or not self.hybrid_results:
            raise RuntimeError("hybrid_queue or hybrid_results not configured")
        self.hybrid_queue.mkdir(parents=True, exist_ok=True)
        self.hybrid_results.mkdir(parents=True, exist_ok=True)

    def _write_cmd_file(self, job: Dict[str, Any]) -> Path:
        if not self.hybrid_queue:
            raise RuntimeError("hybrid_queue not configured")
        job_id = job["job_id"]
        out_path = self.hybrid_queue / f"{job_id}.cmd"

        cmd = job.get("command") or []
        if isinstance(cmd, list):
            cmd_str = shlex.join(cmd)
        else:
            cmd_str = str(cmd)

        lines = ["#hybrid-mode"]
        if self.hybrid_secret:
            lines.append(f"SECRET_TOKEN: {self.hybrid_secret}")
        lines.append("")  # blank line separator
        lines.append(cmd_str)

        out_text = "\n".join(lines) + "\n"
        out_path.write_text(out_text, encoding="utf-8")
        return out_path

    def _poll_for_result(self, job: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not self.hybrid_results:
            raise RuntimeError("hybrid_results not configured")
        job_id = job["job_id"]
        result_path = self.hybrid_results / f"{job_id}.result"

        timeout_seconds = int(job.get("timeout_seconds") or 900)
        deadline = time.time() + timeout_seconds + 5

        while not self.stop_event.is_set() and time.time() < deadline:
            if result_path.exists():
                try:
                    raw = result_path.read_text(encoding="utf-8")
                    data = json.loads(raw)
                    # best-effort remove; ignore errors
                    try:
                        result_path.unlink()
                    except Exception:
                        pass
                    return data
                except Exception as e:
                    return {"error": f"failed to read/parse result file: {e}"}
            time.sleep(self.hybrid_poll)
        return None

    # ----- Execution & streaming -----
    def _chunk_lines(self, lines: List[str], chunk_size: int) -> Iterator[List[str]]:
        for i in range(0, len(lines), chunk_size):
            yield lines[i : i + chunk_size]

    def run_command_and_stream(self, job: Dict[str, Any]) -> None:
        job_id = job["job_id"]
        command = job.get("command") or []
        if isinstance(command, str):
            command = command.split()

        if not command:
            print(
                f"[worker] job {job_id} has empty command; marking failed",
                file=sys.stderr,
            )
            self.complete_job(
                job_id, exit_code=1, success=False, message="empty command"
            )
            return

        # Hybrid mode handoff
        if self.hybrid_queue and self.hybrid_results:
            try:
                self._ensure_hybrid_dirs()
                self.append_logs(
                    job_id, [f"[hybrid] writing .cmd to {self.hybrid_queue}"]
                )
                cmd_path = self._write_cmd_file(job)
                self.append_logs(
                    job_id, [f"[hybrid] command file written: {cmd_path.name}"]
                )
            except Exception as e:
                err = f"[hybrid] failed to write .cmd file: {e}"
                print(err, file=sys.stderr)
                self.append_logs(job_id, [err])
                self.complete_job(job_id, exit_code=1, success=False, message=err)
                return

            self.append_logs(
                job_id, [f"[hybrid] waiting for result in {self.hybrid_results}"]
            )
            result = self._poll_for_result(job)
            if result is None:
                err = "[hybrid] timed out waiting for result"
                self.append_logs(job_id, [err])
                self.complete_job(job_id, exit_code=124, success=False, message=err)
                return

            if "error" in result:
                err = f"[hybrid agent] error: {result.get('error')}"
                self.append_logs(job_id, [err])
                stdout = result.get("stdout", "")
                stderr = result.get("stderr", "")
                if stdout:
                    for chunk in self._chunk_lines(stdout.splitlines(), self.log_batch):
                        self.append_logs(
                            job_id, [f"[hybrid stdout] {l}" for l in chunk]
                        )
                if stderr:
                    for chunk in self._chunk_lines(stderr.splitlines(), self.log_batch):
                        self.append_logs(
                            job_id, [f"[hybrid stderr] {l}" for l in chunk]
                        )
                exit_code = int(result.get("exitCode", result.get("exit_code", 1)) or 1)
                self.complete_job(
                    job_id,
                    exit_code=exit_code,
                    success=False,
                    message=err,
                    result=result,
                )
                return

            exit_code = int(result.get("exitCode", result.get("exit_code", 0)) or 0)
            stdout = result.get("stdout", "") or ""
            stderr = result.get("stderr", "") or ""

            if stdout:
                for chunk in self._chunk_lines(stdout.splitlines(), self.log_batch):
                    self.append_logs(job_id, [f"[hybrid stdout] {l}" for l in chunk])

            if stderr:
                for chunk in self._chunk_lines(stderr.splitlines(), self.log_batch):
                    self.append_logs(job_id, [f"[hybrid stderr] {l}" for l in chunk])

            success_flag = exit_code == 0
            msg = f"hybrid-agent exit_code={exit_code}"
            self.append_logs(job_id, [msg])
            self.complete_job(
                job_id,
                exit_code=exit_code,
                success=success_flag,
                message=msg,
                result=result,
            )
            return

        # Fallback: run locally (trusted dev)
        env = os.environ.copy()
        env.update(job.get("env") or {})

        print(f"[worker] starting job {job_id}: {' '.join(command)}")
        buffer: List[str] = []

        try:
            proc = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=env,
                cwd=os.getcwd(),
                bufsize=1,
                universal_newlines=True,
            )
        except FileNotFoundError as e:
            err = f"executable not found: {e}"
            print(f"[worker] {err}", file=sys.stderr)
            self.append_logs(job_id, [err])
            self.complete_job(job_id, exit_code=127, success=False, message=err)
            return
        except Exception as e:
            err = f"failed to start process: {e}"
            print(f"[worker] {err}", file=sys.stderr)
            self.append_logs(job_id, [err])
            self.complete_job(job_id, exit_code=1, success=False, message=err)
            return

        try:
            assert proc.stdout is not None
            for raw_line in proc.stdout:
                if self.stop_event.is_set():
                    try:
                        proc.kill()
                    except Exception:
                        pass
                    raise WorkerStopped()

                line = raw_line.rstrip("\n")
                print(f"[job {job_id}] {line}")
                buffer.append(line)

                if len(buffer) >= self.log_batch:
                    ok = self.append_logs(job_id, buffer)
                    if not ok:
                        print(
                            "[worker] warning: failed to append logs", file=sys.stderr
                        )
                    buffer = []

            if buffer:
                self.append_logs(job_id, buffer)
                buffer = []

            exit_code = proc.wait()
            success_flag = exit_code == 0
            msg = f"Process exited with code {exit_code}"
            self.append_logs(job_id, [msg])
            self.complete_job(
                job_id, exit_code=exit_code, success=success_flag, message=msg
            )
            print(f"[worker] job {job_id} finished exit_code={exit_code}")
        except WorkerStopped:
            try:
                proc.kill()
            except Exception:
                pass
            self.append_logs(job_id, ["Worker shutting down, terminated job process"])
            self.complete_job(
                job_id, exit_code=130, success=False, message="terminated by worker"
            )
            print(f"[worker] job {job_id} terminated due to worker shutdown")
        except Exception as e:
            err_msg = f"worker exception while streaming: {e}"
            print(err_msg, file=sys.stderr)
            self.append_logs(job_id, [err_msg])
            self.complete_job(job_id, exit_code=1, success=False, message=err_msg)

    # ----- Main loop -----
    def run(self) -> None:
        mode = (
            "hybrid (file queue)"
            if (self.hybrid_queue and self.hybrid_results)
            else "local subprocess"
        )
        print(
            f"[worker] started (id={self.worker_id}) connecting to {self.api_url} mode={mode}"
        )
        try:
            while not self.stop_event.is_set():
                job = self.claim_job()
                if job:
                    try:
                        self.run_command_and_stream(job)
                    except Exception as e:
                        print(
                            f"[worker] unexpected error running job: {e}",
                            file=sys.stderr,
                        )
                        time.sleep(1.0)
                else:
                    time.sleep(self.poll_interval)
        except KeyboardInterrupt:
            print("[worker] received KeyboardInterrupt, shutting down")
            self.stop_event.set()
        finally:
            print("[worker] stopped")


# ----- CLI & signal handling -----
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Simple local worker for the orchestrator")
    p.add_argument(
        "--api",
        required=True,
        help="Control plane base URL (e.g. http://127.0.0.1:8001)",
    )
    p.add_argument("--worker-id", required=True, help="Logical worker id (e.g. local1)")
    p.add_argument(
        "--poll-interval",
        type=float,
        default=DEFAULT_POLL_INTERVAL,
        help="Seconds between claim attempts when idle",
    )
    p.add_argument(
        "--log-batch",
        type=int,
        default=DEFAULT_LOG_BATCH,
        help="Number of lines to batch when sending logs",
    )
    p.add_argument(
        "--request-timeout",
        type=int,
        default=DEFAULT_REQUEST_TIMEOUT,
        help="HTTP request timeout (seconds)",
    )
    p.add_argument(
        "--runtime-pref",
        default=None,
        help="Optional runtime preference to request specific jobs",
    )
    p.add_argument("--version", action="store_true", help="Print version and exit")
    p.add_argument(
        "--hybrid-queue",
        default=os.environ.get("HYBRID_QUEUE_DIR", ""),
        help="Directory to write .cmd files for hybrid-agent (enables hybrid mode)",
    )
    p.add_argument(
        "--hybrid-results",
        default=os.environ.get("HYBRID_RESULTS_DIR", ""),
        help="Directory to read .result files from hybrid-agent (enables hybrid mode)",
    )
    p.add_argument(
        "--hybrid-secret",
        default=os.environ.get("HYBRID_SECRET_TOKEN"),
        help="Optional secret token to include in .cmd files (or set HYBRID_SECRET_TOKEN env)",
    )
    p.add_argument(
        "--worker-secret",
        default=os.environ.get("WORKER_SECRET"),
        help="Optional worker secret to send as X-WORKER-SECRET header (or set WORKER_SECRET env)",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    if args.version:
        print(f"worker {VERSION}")
        return

    hybrid_queue = args.hybrid_queue if args.hybrid_queue else None
    hybrid_results = args.hybrid_results if args.hybrid_results else None
    enable_hybrid = bool(hybrid_queue) and bool(hybrid_results)

    worker = LocalWorker(
        api_url=args.api,
        worker_id=args.worker_id,
        poll_interval=args.poll_interval,
        log_batch=args.log_batch,
        request_timeout=args.request_timeout,
        runtime_pref=args.runtime_pref,
        hybrid_queue=(hybrid_queue if enable_hybrid else None),
        hybrid_results=(hybrid_results if enable_hybrid else None),
        hybrid_secret=args.hybrid_secret,
        worker_secret=args.worker_secret,
    )

    def _signal_handler(signum, frame) -> None:
        print(f"[worker] received signal {signum}, shutting down", file=sys.stderr)
        worker.stop_event.set()

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    worker.run()


if __name__ == "__main__":
    main()
