#!/usr/bin/env python3
"""
samples/sample_client.py

Minimal DAM client that POSTs a job to the orchestrator /jobs endpoint.

Usage:
  python samples/sample_client.py
  python samples/sample_client.py --cmd /bin/echo hello --repo dam/asset-123

Environment:
  API_URL - optional, defaults to http://127.0.0.1:8001
  API_AUTH_TOKEN - optional Bearer token to include in Authorization header

This script is intentionally small and dependency-light. It requires the
`requests` package. Install with: pip install requests
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, Tuple

try:
    import requests
except Exception as e:
    print(
        "Missing dependency: requests. Install with: pip install requests",
        file=sys.stderr,
    )
    raise e


API_URL = os.environ.get("API_URL", "http://127.0.0.1:8001").rstrip("/")
API_TOKEN = os.environ.get("API_AUTH_TOKEN")  # optional


DEFAULT_PAYLOAD: Dict[str, Any] = {
    "repo": "dam/asset-123",
    "ref": "v1",
    "runtime": "container",
    "command": ["/bin/echo", "hello from sample_client.py"],
    "env": {},
    "timeout_seconds": 60,
}


def post_job(payload: Dict[str, Any]) -> Tuple[int, Any]:
    """Post a job to the orchestrator and return (status_code, parsed_body_or_text)."""
    url = f"{API_URL}/jobs"
    headers = {"Content-Type": "application/json"}
    if API_TOKEN:
        headers["Authorization"] = f"Bearer {API_TOKEN}"

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=15)
    except requests.RequestException as e:
        return 0, f"Request failed: {e}"

    try:
        body = resp.json()
    except ValueError:
        body = resp.text
    return resp.status_code, body


def build_payload(args: argparse.Namespace) -> Dict[str, Any]:
    """Assemble the job payload from CLI args and defaults."""
    payload = {
        "repo": args.repo or DEFAULT_PAYLOAD["repo"],
        "ref": args.ref or DEFAULT_PAYLOAD["ref"],
        "runtime": args.runtime or DEFAULT_PAYLOAD["runtime"],
        "env": DEFAULT_PAYLOAD["env"].copy(),
        "timeout_seconds": args.timeout,
    }

    if args.cmd:
        # args.cmd is a list of strings
        payload["command"] = args.cmd
    else:
        payload["command"] = DEFAULT_PAYLOAD["command"]

    return payload


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Post a job to the Xibalba orchestrator")
    p.add_argument(
        "--repo", default=DEFAULT_PAYLOAD["repo"], help="repo identifier (string)"
    )
    p.add_argument("--ref", default=DEFAULT_PAYLOAD["ref"], help="ref/branch")
    p.add_argument("--runtime", default=DEFAULT_PAYLOAD["runtime"], help="runtime hint")
    p.add_argument(
        "--cmd", nargs="+", help="command and args, e.g. --cmd /bin/echo hello"
    )
    p.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_PAYLOAD["timeout_seconds"],
        help="timeout_seconds",
    )
    p.add_argument(
        "--show-only", action="store_true", help="Print payload without sending"
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    payload = build_payload(args)

    print("Posting job with payload:")
    print(json.dumps(payload, indent=2))

    if args.show_only:
        return 0

    status, body = post_job(payload)
    print("\nResponse status:", status)
    if isinstance(body, (dict, list)):
        print(json.dumps(body, indent=2))
    else:
        print(body)

    # non-HTTP error (requests exception) returns status==0
    if status == 0:
        return 2
    # treat 2xx as success
    if 200 <= status < 300:
        return 0
    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nCancelled by user", file=sys.stderr)
        raise SystemExit(130)
