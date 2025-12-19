#!/usr/bin/env python3
"""
00_xibalba_alpaca/local-agent/ui_server.py

Local Agent UI server with background service control endpoints.

Features:
 - Dashboard to create .cmd jobs, publish jobs, simulate results
 - Serve a local styleguide at /styleguide (uses local-agent/styleguide.html if present)
 - Tail and expose logs (UI, agent, hybrid-agent)
 - Start/stop the local agent and a background UI instance via HTTP endpoints
 - Create simple start/stop wrapper scripts under 00_xibalba_alpaca/scripts/

Security:
 - Binds to localhost only by default.
 - Only basic sanitization is applied; do not expose this server to untrusted networks.
"""

from __future__ import annotations

import html
import json
import os
import shlex
import signal
import stat
import subprocess
import sys
import tempfile
import time
import urllib.parse as up
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Optional

# ---- Config ----
# Allow bind host/port override from environment so the service can be bound in different environments.
HOST = os.environ.get("LOCAL_AGENT_UI_HOST", os.environ.get("HOST", "127.0.0.1"))
# Prefer explicit LOCAL_AGENT_UI_PORT, fallback to common PORT env, then default
PORT = int(os.environ.get("LOCAL_AGENT_UI_PORT", os.environ.get("PORT", "8765")))

REPO_ROOT = Path(__file__).resolve().parents[1]  # .../00_xibalba_alpaca
HYBRID_QUEUE = REPO_ROOT / "hybrid-queue"
HYBRID_RESULTS = REPO_ROOT / "hybrid-results"
LOG_DIR = REPO_ROOT / "local-agent-logs"
UI_LOG_PATH = LOG_DIR / "ui_server.log"
AGENT_LOG_PATH = LOG_DIR / "agent.log"
HYBRID_AGENT_LOG = REPO_ROOT / "hybrid-agent.log"
# File where the effective UI bind host:port will be written so helper scripts can discover it.
UI_BIND_PATH = LOG_DIR / "ui_bind.info"

SCRIPTS_DIR = REPO_ROOT / "scripts"
SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)
for d in (HYBRID_QUEUE, HYBRID_RESULTS):
    d.mkdir(parents=True, exist_ok=True)


# pidfiles
def pidfile(name: str) -> Path:
    return LOG_DIR / f"{name}.pid"


# ---- Utilities ----
def now_iso() -> str:
    return time.strftime("%Y%m%dT%H%M%S", time.gmtime())


def sanitize_job_id(raw: Optional[str]) -> str:
    if not raw:
        return f"job-{now_iso()}-{uuid.uuid4().hex[:6]}"
    raw = raw.strip()
    safe = "".join(c for c in raw if (c.isalnum() or c in ("-", "_")))
    if not safe:
        return f"job-{now_iso()}-{uuid.uuid4().hex[:6]}"
    return safe


def atomic_write(path: Path, data: str, encoding="utf-8") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".tmp.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding=encoding) as f:
            f.write(data)
        os.replace(tmp, str(path))
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except Exception:
                pass


def html_escape(s: str) -> str:
    return html.escape(s, quote=True)


def tail_file(path: Path, max_lines: int = 200, max_bytes: int = 20000) -> str:
    if not path.exists() or not path.is_file():
        return f"(no file: {path})"
    try:
        with path.open("rb") as f:
            f.seek(0, 2)
            size = f.tell()
            if size == 0:
                return ""
            chunk_size = 4096
            data = b""
            pos = size
            # read chunks until we have enough lines or hit max_bytes
            while pos > 0 and len(data) < max_bytes and data.count(b"\n") <= max_lines:
                to_read = min(chunk_size, pos)
                pos -= to_read
                f.seek(pos)
                data = f.read(to_read) + data
            text = data.decode("utf-8", errors="replace")
            lines = text.splitlines()
            return "\n".join(lines[-max_lines:])
    except Exception as e:
        return f"(error reading {path}: {e})"


def is_pid_running(pid: int) -> bool:
    try:
        # signal 0 only checks existence
        os.kill(pid, 0)
    except Exception:
        return False
    return True


def read_pid(name: str) -> Optional[int]:
    p = pidfile(name)
    if not p.exists():
        return None
    try:
        txt = p.read_text().strip()
        return int(txt) if txt else None
    except Exception:
        return None


def write_pid(name: str, pid: int) -> None:
    p = pidfile(name)
    atomic_write(p, str(int(pid)))


def remove_pid(name: str) -> None:
    p = pidfile(name)
    try:
        if p.exists():
            p.unlink()
    except Exception:
        pass


# ---- Job/command helpers ----
def write_cmd_file(job_id: str, secret: Optional[str], command_text: str) -> Path:
    fn = HYBRID_QUEUE / f"{job_id}.cmd"
    lines = ["#hybrid-mode"]
    if secret:
        lines.append(f"SECRET_TOKEN: {secret}")
    lines.append("")  # blank line before command body
    lines.append(command_text.strip() + "\n")
    content = "\n".join(lines)
    atomic_write(fn, content)
    return fn


def write_result_file(job_id: str, exitCode: int, stdout: str, stderr: str) -> Path:
    fn = HYBRID_RESULTS / f"{job_id}.result"
    payload = {"exitCode": int(exitCode), "stdout": stdout, "stderr": stderr}
    atomic_write(fn, json.dumps(payload))
    return fn


def list_files(dirpath: Path, suffix: str):
    out = []
    for p in sorted(dirpath.glob(f"*{suffix}")):
        if p.is_file():
            stat = p.stat()
            out.append(
                {
                    "name": p.name,
                    "path": str(p),
                    "size": stat.st_size,
                    "mtime": stat.st_mtime,
                }
            )
    return out


def read_result(job_id: str) -> Optional[dict]:
    p = HYBRID_RESULTS / f"{job_id}.result"
    if not p.exists():
        return None
    try:
        raw = p.read_text(encoding="utf-8")
        return json.loads(raw)
    except Exception:
        return {"raw": p.read_text(encoding="utf-8", errors="replace")}


# ---- Service control (agent + background UI) ----
def start_agent(background: bool = True) -> dict:
    """
    Start the local agent as a background process. Returns status dict.
    """
    existing = read_pid("agent")
    if existing and is_pid_running(existing):
        return {"ok": False, "reason": "agent-already-running", "pid": existing}

    agent_script = REPO_ROOT / "local-agent" / "agent.py"
    if not agent_script.exists():
        return {"ok": False, "reason": f"agent-script-missing: {agent_script}"}

    cmd = [
        sys.executable,
        str(agent_script),
        "--queue",
        str(HYBRID_QUEUE),
        "--results",
        str(HYBRID_RESULTS),
        "--log-file",
        str(AGENT_LOG_PATH),
    ]

    # spawn background process
    try:
        logf = open(AGENT_LOG_PATH, "a", encoding="utf-8")
        proc = subprocess.Popen(
            cmd, stdout=logf, stderr=logf, start_new_session=True, close_fds=True
        )
        write_pid("agent", proc.pid)
        return {"ok": True, "pid": proc.pid}
    except Exception as e:
        return {"ok": False, "reason": f"spawn-failed: {e}"}


def stop_service(name: str, timeout: int = 8) -> dict:
    p = read_pid(name)
    if not p:
        return {"ok": False, "reason": "not-running"}
    try:
        os.kill(p, signal.SIGTERM)
    except Exception:
        # maybe already dead
        pass
    # wait for process to exit
    start = time.time()
    while time.time() - start < timeout:
        if not is_pid_running(p):
            remove_pid(name)
            return {"ok": True}
        time.sleep(0.2)
    # force kill
    try:
        os.kill(p, signal.SIGKILL)
    except Exception:
        pass
    time.sleep(0.2)
    if not is_pid_running(p):
        remove_pid(name)
        return {"ok": True, "force_killed": True}
    return {"ok": False, "reason": "failed-to-stop"}


def start_ui_background(port: int = PORT, host: str = HOST) -> dict:
    """
    Start a detached background UI process (another instance of this file) so that the UI is
    running as a background service. The background UI will write logs to UI_LOG_PATH.
    """
    existing = read_pid("ui")
    if existing and is_pid_running(existing):
        return {"ok": False, "reason": "ui-already-running", "pid": existing}

    cmd = [
        sys.executable,
        str(Path(__file__).resolve()),
        "--ui-foreground",
        "--host",
        host,
        "--port",
        str(port),
    ]
    try:
        logf = open(UI_LOG_PATH, "a", encoding="utf-8")
        proc = subprocess.Popen(
            cmd, stdout=logf, stderr=logf, start_new_session=True, close_fds=True
        )
        write_pid("ui", proc.pid)
        return {"ok": True, "pid": proc.pid}
    except Exception as e:
        return {"ok": False, "reason": f"spawn-failed: {e}"}


# ---- Wrapper script generation ----
def make_wrapper_scripts():
    # start_agent.sh, stop_agent.sh, start_ui.sh, stop_ui.sh
    start_agent_sh = SCRIPTS_DIR / "start_agent.sh"
    stop_agent_sh = SCRIPTS_DIR / "stop_agent.sh"
    start_ui_sh = SCRIPTS_DIR / "start_ui.sh"
    stop_ui_sh = SCRIPTS_DIR / "stop_ui.sh"

    # start_agent.sh: uses pidfile, nohup, redirects logs, writes pidfile atomically
    start_agent_content = f"""#!/usr/bin/env bash
set -euo pipefail
PIDFILE="{pidfile("agent")}"
LOG="{AGENT_LOG_PATH}"
if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE" 2>/dev/null || echo "")
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "Agent already running (pid=$PID)"
    exit 0
  else
    echo "Stale pidfile found, removing"
    rm -f "$PIDFILE"
  fi
fi
echo "Starting agent (background), logging to $LOG"
nohup python3 "{REPO_ROOT / "local-agent" / "agent.py"}" --queue "{HYBRID_QUEUE}" --results "{HYBRID_RESULTS}" --log-file "{AGENT_LOG_PATH}" >> "$LOG" 2>&1 &
AGENT_PID=$!
# wait a moment for process to start
sleep 0.2
echo $AGENT_PID > "$PIDFILE"
echo "Agent started pid=$AGENT_PID"
"""
    # stop_agent.sh: stop by pidfile, try graceful then force
    stop_agent_content = f"""#!/usr/bin/env bash
set -euo pipefail
PIDFILE="{pidfile("agent")}"
if [ ! -f "$PIDFILE" ]; then
  echo "No agent pidfile found ($PIDFILE)"
  exit 0
fi
PID=$(cat "$PIDFILE" 2>/dev/null || echo "")
if [ -z "$PID" ]; then
  echo "Empty pidfile, removing"
  rm -f "$PIDFILE"
  exit 0
fi
echo "Stopping agent pid=$PID"
kill "$PID" 2>/dev/null || true
# wait up to 5s
for i in $(seq 1 25); do
  if kill -0 "$PID" 2>/dev/null; then
    sleep 0.2
  else
    break
  fi
done
if kill -0 "$PID" 2>/dev/null; then
  echo "Agent did not stop, sending SIGKILL"
  kill -9 "$PID" 2>/dev/null || true
fi
rm -f "$PIDFILE"
echo "Agent stopped"
"""

    start_ui_content = f"""#!/usr/bin/env bash
set -euo pipefail
PIDFILE="{pidfile("ui")}"
LOG="{UI_LOG_PATH}"
if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE" 2>/dev/null || echo "")
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "UI already running (pid=$PID)"
    exit 0
  else
    echo "Removing stale UI pidfile"
    rm -f "$PIDFILE"
  fi
fi
echo "Starting UI (background), logging to $LOG"
nohup python3 "{Path(__file__).resolve()}" --ui-foreground --host {HOST} --port {PORT} >> "$LOG" 2>&1 &
UI_PID=$!
sleep 0.2
echo $UI_PID > "$PIDFILE"
echo "UI started pid=$UI_PID"
"""

    stop_ui_content = f"""#!/usr/bin/env bash
set -euo pipefail
PIDFILE="{pidfile("ui")}"
if [ ! -f "$PIDFILE" ]; then
  echo "No UI pidfile found ($PIDFILE)"
  exit 0
fi
PID=$(cat "$PIDFILE" 2>/dev/null || echo "")
if [ -z "$PID" ]; then
  echo "Empty pidfile, removing"
  rm -f "$PIDFILE"
  exit 0
fi
echo "Stopping UI pid=$PID"
kill "$PID" 2>/dev/null || true
for i in $(seq 1 25); do
  if kill -0 "$PID" 2>/dev/null; then
    sleep 0.2
  else
    break
  fi
done
if kill -0 "$PID" 2>/dev/null; then
  echo "UI did not stop; sending SIGKILL"
  kill -9 "$PID" 2>/dev/null || true
fi
rm -f "$PIDFILE"
echo "UI stopped"
"""

    for p, content in [
        (start_agent_sh, start_agent_content),
        (stop_agent_sh, stop_agent_content),
        (start_ui_sh, start_ui_content),
        (stop_ui_sh, stop_ui_content),
    ]:
        atomic_write(p, content)
        try:
            st = p.stat().st_mode
            p.chmod(st | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        except Exception:
            pass


# ---- HTML dashboard ----
def render_dashboard(queue_items, result_items, message=""):
    queue_rows = "\n".join(
        f"<li>{html_escape(it['name'])} (size={it['size']})</li>" for it in queue_items
    )
    result_rows = "\n".join(
        f"<li><a href='/result/{html_escape(it['name'][:-7])}'>{html_escape(it['name'])}</a> (size={it['size']})</li>"
        for it in result_items
    )

    # service statuses
    agent_pid = read_pid("agent")
    ui_pid = read_pid("ui")
    agent_status = "running" if agent_pid and is_pid_running(agent_pid) else "stopped"
    ui_status = "running" if ui_pid and is_pid_running(ui_pid) else "stopped"

    # log previews
    agent_tail = tail_file(AGENT_LOG_PATH, max_lines=40)
    ui_tail = tail_file(UI_LOG_PATH, max_lines=40)
    hybrid_tail = tail_file(HYBRID_AGENT_LOG, max_lines=20)

    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Local Agent UI</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 20px; }}
    textarea {{ width: 90%; height: 8em; }}
    input[type=text] {{ width: 400px; }}
    .col {{ display:inline-block; vertical-align: top; width:48%; }}
    .msg {{ color: green; }}
    .err {{ color: red; }}
    .small {{ font-size: 0.9em; color: #444; }}
    .actions {{ margin-top: 1em; }}
    pre.log {{ background:#0f172a; color:#e6eefc; padding:10px; border-radius:6px; max-height:240px; overflow:auto; font-family: monospace; font-size:12px }}
    .service {{ padding:8px; border-radius:6px; background:#fff; box-shadow:0 6px 18px rgba(2,6,23,0.06); }}
    form.inline {{ display:inline-block; margin-right:8px; }}
  </style>
</head>
<body>
  <h1>Local Agent UI</h1>
  <p>Drop a .cmd into <code>{html_escape(str(HYBRID_QUEUE))}</code> or use the forms below. View the styleguide: <a href="/styleguide">Styleguide</a></p>
  {f"<p class='msg'>{html_escape(message)}</p>" if message else ""}

  <div class="col">
    <h2>Create .cmd</h2>
    <form method="POST" action="/create">
      <label>Job ID (optional): <input type="text" name="job_id" /></label><br/><br/>
      <label>SECRET_TOKEN (optional): <input type="text" name="secret" /></label><br/><br/>
      <label>Command (shell or JSON array):</label><br/>
      <textarea name="command" placeholder='["/bin/echo","hello"] or /bin/echo hello'></textarea><br/>
      <input type="submit" value="Create .cmd" />
    </form>

    <h3 class="actions">Publish (create PR)</h3>
    <form method="POST" action="/publish">
      <label>Job ID (optional): <input type="text" name="job_id" /></label><br/><br/>
      <label>SECRET_TOKEN (optional): <input type="text" name="secret" /></label><br/><br/>
      <label>Branch prefix: <input type="text" name="branch_prefix" value="publish" /></label><br/><br/>
      <label>Commit / PR message:</label><br/>
      <input type="text" name="message" value="Publish from Local Agent" style="width:90%;" /><br/><br/>
      <input type="submit" value="Publish (create .cmd -> agent)" />
    </form>

    <h3>Queue (hybrid-queue)</h3>
    <ul>{queue_rows or "<li>(empty)</li>"}</ul>
  </div>

  <div class="col">
    <h2>Results</h2>
    <form method="POST" action="/simulate">
      <label>Simulate result for job id: <input type="text" name="job_id" /></label><br/><br/>
      <label>Exit code: <input type="text" name="exitCode" value="0" /></label><br/><br/>
      <label>Stdout:</label><br/>
      <textarea name="stdout">hello\n</textarea><br/>
      <label>Stderr:</label><br/>
      <textarea name="stderr"></textarea><br/>
      <input type="submit" value="Simulate Result" />
    </form>

    <h3>Service controls</h3>
    <div class="service">
      <div><strong>Agent:</strong> {html_escape(agent_status)} {f"(pid {agent_pid})" if agent_pid else ""}</div>
      <form class="inline" method="POST" action="/service/start"><input type="hidden" name="name" value="agent"/><input type="submit" value="Start Agent"/></form>
      <form class="inline" method="POST" action="/service/stop"><input type="hidden" name="name" value="agent"/><input type="submit" value="Stop Agent"/></form>
      <div style="height:8px"></div>
      <div><strong>UI (background):</strong> {html_escape(ui_status)} {f"(pid {ui_pid})" if ui_pid else ""}</div>
      <form class="inline" method="POST" action="/service/start"><input type="hidden" name="name" value="ui"/><input type="submit" value="Start UI (background)"/></form>
      <form class="inline" method="POST" action="/service/stop"><input type="hidden" name="name" value="ui"/><input type="submit" value="Stop UI (background)"/></form>
      <div style="height:8px"></div>
      <div style="font-size:12px;color:#666">Wrapper scripts created in <code>{html_escape(str(SCRIPTS_DIR))}</code> (start/stop for agent & UI).</div>
    </div>

    <h3 style="margin-top:1em">Logs (preview)</h3>
    <div class="small">Agent log (last 40 lines)</div><pre class="log">{html_escape(agent_tail)}</pre>
    <div class="small">UI server log (last 40 lines)</div><pre class="log">{html_escape(ui_tail)}</pre>
    <div class="small">Hybrid agent log (last 20 lines)</div><pre class="log">{html_escape(hybrid_tail)}</pre>

    <h3 style="margin-top:1em">Existing results</h3>
    <ul>{result_rows or "<li>(empty)</li>"}</ul>

  </div>

  <div style="clear:both;"></div>
  <p style="margin-top:12px;"><small class="small">Server running on {HOST}:{PORT}. Files created in repo-local hybrid-queue/hybrid-results folders.</small></p>
</body>
</html>
"""


# ---- HTTP Handler ----
class SimpleHandler(BaseHTTPRequestHandler):
    server_version = "LocalAgentUI/0.4"

    def log_message(self, format, *args):
        line = "%s - - [%s] %s\n" % (
            self.client_address[0],
            self.log_date_time_string(),
            format % args,
        )
        try:
            with open(UI_LOG_PATH, "a", encoding="utf-8") as lf:
                lf.write(line)
        except Exception:
            pass
        sys.stdout.write(line)

    def do_GET(self):
        parsed = up.urlparse(self.path)
        path = parsed.path
        qs = dict(up.parse_qsl(parsed.query))

        if path in ("/", "/index.html"):
            queue_items = list_files(HYBRID_QUEUE, ".cmd")
            result_items = list_files(HYBRID_RESULTS, ".result")
            html_body = render_dashboard(queue_items, result_items)
            self.respond_html(html_body)
            return

        if path == "/health":
            # Simple health/heartbeat endpoint to allow external checks
            payload = {
                "ok": True,
                "time": now_iso(),
                "ui_pid": os.getpid(),
                "agent_pid": read_pid("agent"),
            }
            self.respond_json(payload)
            return

        if path == "/styleguide":
            sg = REPO_ROOT / "local-agent" / "styleguide.html"
            if sg.exists():
                try:
                    self.respond_html(sg.read_text(encoding="utf-8"))
                    return
                except Exception:
                    pass
            # fallback
            self.respond_html(
                "<html><body><h1>Styleguide not found</h1><p>Place local-agent/styleguide.html to customize.</p><p><a href='/'>Back</a></p></body></html>"
            )
            return

        if path == "/results":
            items = list_files(HYBRID_RESULTS, ".result")
            self.respond_json(items)
            return

        if path == "/queue":
            items = list_files(HYBRID_QUEUE, ".cmd")
            self.respond_json(items)
            return

        if path.startswith("/result/"):
            job_id = path[len("/result/") :].strip()
            data = read_result(job_id)
            if data is None:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"Result not found\n")
                return
            self.respond_json(data)
            return

        if path == "/logs":
            which = qs.get("file", "all")
            lines = int(qs.get("lines", "200"))
            out = {}
            if which in ("agent", "all"):
                out["agent"] = tail_file(AGENT_LOG_PATH, max_lines=lines)
            if which in ("ui", "all"):
                out["ui"] = tail_file(UI_LOG_PATH, max_lines=lines)
            if which in ("hybrid", "all"):
                out["hybrid"] = tail_file(HYBRID_AGENT_LOG, max_lines=lines)
            self.respond_json(out)
            return

        if path.startswith("/log/"):
            name = path[len("/log/") :].strip()
            if name == "agent":
                content = tail_file(AGENT_LOG_PATH, max_lines=500)
            elif name == "ui":
                content = tail_file(UI_LOG_PATH, max_lines=500)
            elif name == "hybrid":
                content = tail_file(HYBRID_AGENT_LOG, max_lines=500)
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"Unknown log\n")
                return
            self.respond_html(
                f"<pre style='white-space:pre-wrap'>{html_escape(content)}</pre>"
            )
            return

        # Not found
        self.send_response(404)
        self.end_headers()
        self.wfile.write(b"Not Found\n")

    def do_POST(self):
        parsed = up.urlparse(self.path)
        path = parsed.path
        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length) if content_length else b""
        ct = self.headers.get("Content-Type", "")
        form = {}
        if ct.startswith("application/x-www-form-urlencoded"):
            form = dict(up.parse_qsl(raw.decode("utf-8", errors="replace")))
        else:
            try:
                form = dict(up.parse_qsl(raw.decode("utf-8", errors="replace")))
            except Exception:
                form = {}

        if path == "/create":
            job_id = sanitize_job_id(form.get("job_id"))
            secret = form.get("secret")
            command = form.get("command", "").strip()
            if not command:
                self.respond_html(
                    render_dashboard(
                        list_files(HYBRID_QUEUE, ".cmd"),
                        list_files(HYBRID_RESULTS, ".result"),
                        "No command provided",
                    )
                )
                return
            try:
                fn = write_cmd_file(job_id, secret, command)
                msg = f"Created .cmd: {fn.name}"
                self.respond_html(
                    render_dashboard(
                        list_files(HYBRID_QUEUE, ".cmd"),
                        list_files(HYBRID_RESULTS, ".result"),
                        msg,
                    )
                )
            except Exception as e:
                self.respond_html(
                    render_dashboard(
                        list_files(HYBRID_QUEUE, ".cmd"),
                        list_files(HYBRID_RESULTS, ".result"),
                        f"Error creating .cmd: {e}",
                    )
                )
            return

        if path == "/publish":
            job_id = sanitize_job_id(form.get("job_id"))
            secret = form.get("secret")
            branch_prefix = (form.get("branch_prefix") or "publish").strip()
            branch_prefix = "".join(
                c for c in branch_prefix if (c.isalnum() or c in ("-", "_"))
            )
            msg_text = form.get("message") or "Publish from Local Agent"
            branch_name = f"{branch_prefix}/{now_iso()}"
            script_rel = "00_xibalba_alpaca/scripts/create_pr_local.sh"
            cmd_array = ["/bin/bash", script_rel, branch_name, msg_text]
            try:
                cmd_payload = json.dumps(cmd_array)
                fn = write_cmd_file(job_id, secret, cmd_payload)
                msg = f"Created publish .cmd: {fn.name} -> runs {script_rel} {branch_name!s}"
                self.respond_html(
                    render_dashboard(
                        list_files(HYBRID_QUEUE, ".cmd"),
                        list_files(HYBRID_RESULTS, ".result"),
                        msg,
                    )
                )
            except Exception as e:
                self.respond_html(
                    render_dashboard(
                        list_files(HYBRID_QUEUE, ".cmd"),
                        list_files(HYBRID_RESULTS, ".result"),
                        f"Error creating publish .cmd: {e}",
                    )
                )
            return

        if path == "/simulate":
            job_id = sanitize_job_id(form.get("job_id"))
            exitCode = int(form.get("exitCode") or 0)
            stdout_text = form.get("stdout") or ""
            stderr_text = form.get("stderr") or ""
            try:
                p = write_result_file(job_id, exitCode, stdout_text, stderr_text)
                msg = f"Created result: {p.name}"
                self.respond_html(
                    render_dashboard(
                        list_files(HYBRID_QUEUE, ".cmd"),
                        list_files(HYBRID_RESULTS, ".result"),
                        msg,
                    )
                )
            except Exception as e:
                self.respond_html(
                    render_dashboard(
                        list_files(HYBRID_QUEUE, ".cmd"),
                        list_files(HYBRID_RESULTS, ".result"),
                        f"Error writing result: {e}",
                    )
                )
            return

        if path == "/service/start":
            name = form.get("name", "")
            if name == "agent":
                res = start_agent()
            elif name == "ui":
                res = start_ui_background()
            else:
                res = {"ok": False, "reason": "unknown-service"}
            # ensure wrapper scripts exist
            make_wrapper_scripts()
            self.respond_html(
                render_dashboard(
                    list_files(HYBRID_QUEUE, ".cmd"),
                    list_files(HYBRID_RESULTS, ".result"),
                    f"Service start: {json.dumps(res)}",
                )
            )
            return

        if path == "/service/stop":
            name = form.get("name", "")
            if name in ("agent", "ui"):
                res = stop_service(name)
            else:
                res = {"ok": False, "reason": "unknown-service"}
            self.respond_html(
                render_dashboard(
                    list_files(HYBRID_QUEUE, ".cmd"),
                    list_files(HYBRID_RESULTS, ".result"),
                    f"Service stop: {json.dumps(res)}",
                )
            )
            return

        # unknown POST
        self.send_response(404)
        self.end_headers()
        self.wfile.write(b"Not Found\n")

    # ---- helpers ----
    def respond_html(self, html_text: str, status: int = 200):
        data = html_text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def respond_json(self, obj, status: int = 200):
        data = json.dumps(obj, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


# ---- Server runner ----
def run_server(host=HOST, port=PORT):
    """
    Attempt to bind the UI to host:port. If port is already in use, try the next
    ports up to a small range. When a bind succeeds the chosen bind info is written
    to `UI_BIND_PATH` so helper scripts can discover the actual listening address.
    """
    # ensure log dir exists
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    # Try a small window of ports (requested port ... port+9)
    max_attempts = 10
    last_exc = None
    httpd = None
    chosen_port = None
    for attempt in range(max_attempts):
        try_port = port + attempt
        server_address = (host, try_port)
        try:
            httpd = HTTPServer(server_address, SimpleHandler)
            chosen_port = try_port
            break
        except Exception as e:
            last_exc = e
            # write a short note to the ui log about the failure (best-effort)
            try:
                with open(UI_LOG_PATH, "a", encoding="utf-8") as lf:
                    lf.write(
                        f"{now_iso()} WARN bind to {host}:{try_port} failed: {e}\n"
                    )
            except Exception:
                pass
            # try next port
            continue

    if httpd is None:
        # nothing worked -> record and raise the last exception
        try:
            with open(UI_LOG_PATH, "a", encoding="utf-8") as lf:
                lf.write(
                    f"{now_iso()} ERROR Failed to bind UI on {host}:{port}..{port + max_attempts - 1}: {last_exc}\n"
                )
        except Exception:
            pass
        print(
            f"Failed to start Local Agent UI on {host}:{port}..{port + max_attempts - 1}: {last_exc}",
            file=sys.stderr,
        )
        raise last_exc

    # write chosen bind info so wrapper scripts can discover the actual host:port
    try:
        bind_info = json.dumps({"host": str(host), "port": int(chosen_port)})
        atomic_write(UI_BIND_PATH, bind_info)
    except Exception:
        try:
            with open(UI_LOG_PATH, "a", encoding="utf-8") as lf:
                lf.write(
                    f"{now_iso()} WARN failed to write UI bind info to {UI_BIND_PATH}\n"
                )
        except Exception:
            pass

    msg = f"Local Agent UI server running at http://{host}:{chosen_port}/"
    print(msg)
    # also write a startup message into the ui log (best-effort)
    try:
        with open(UI_LOG_PATH, "a", encoding="utf-8") as lf:
            lf.write(f"{now_iso()} INFO {msg}\n")
    except Exception:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        # User requested shutdown
        try:
            with open(UI_LOG_PATH, "a", encoding="utf-8") as lf:
                lf.write(
                    f"{now_iso()} INFO KeyboardInterrupt received, shutting down UI\n"
                )
        except Exception:
            pass
        print("Shutting down UI server...")
    except Exception as e:
        # Unexpected exception - capture trace to ui log and re-raise for visibility
        try:
            import traceback

            tb = traceback.format_exc()
            with open(UI_LOG_PATH, "a", encoding="utf-8") as lf:
                lf.write(f"{now_iso()} EXCEPTION unexpected server error: {e}\n{tb}\n")
        except Exception:
            pass
        raise
    finally:
        try:
            httpd.server_close()
        except Exception:
            # best-effort cleanup
            try:
                with open(UI_LOG_PATH, "a", encoding="utf-8") as lf:
                    lf.write(f"{now_iso()} WARN failed closing HTTP server cleanly\n")
            except Exception:
                pass


# ---- CLI entrypoint ----
def print_usage_and_exit():
    print("Usage:")
    print("  python ui_server.py                 # run UI in foreground")
    print(
        "  python ui_server.py --ui-foreground --host <host> --port <port>  # internal: run foreground UI (used by background starter)"
    )
    sys.exit(0)


if __name__ == "__main__":
    # Minimal CLI parsing for background UI invocation
    if "--ui-foreground" in sys.argv:
        # If invoked as a foreground UI (by background spawner), write pidfile for 'ui'
        try:
            write_pid("ui", os.getpid())
        except Exception:
            pass
        # ensure wrapper scripts exist
        make_wrapper_scripts()
        # allow overriding host/port via args
        host = HOST
        port = PORT
        if "--host" in sys.argv:
            try:
                host = sys.argv[sys.argv.index("--host") + 1]
            except Exception:
                pass
        if "--port" in sys.argv:
            try:
                port = int(sys.argv[sys.argv.index("--port") + 1])
            except Exception:
                pass
        run_server(host=host, port=port)
    else:
        # Normal foreground run (developer invoking the UI directly)
        make_wrapper_scripts()
        run_server(host=HOST, port=PORT)
