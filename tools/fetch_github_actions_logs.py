#!/usr/bin/env python3
"""
Fetch GitHub Actions logs for a branch and print the first failing block.

Usage:
  1) Create a GitHub token with scopes: 'workflow' and 'repo' (or 'public_repo' for public repos).
  2) Export it: export GITHUB_TOKEN="ghp_..."
  3) Run:
     python3 fetch_github_actions_logs.py owner repo branch

Example:
  python3 fetch_github_actions_logs.py Vado42-chris 00_xibalba_framework_blockchain salvage/save-before-ai

What it does:
 - Lists recent workflow runs for the given branch.
 - Downloads the logs ZIP for the latest run.
 - Scans job log files for the first case-insensitive match of "error" or "fail".
 - Prints ~8 lines before and ~20 lines after the first match (so you can paste that block).
 - If no "error/fail" text is found, it lists the job log files so you can open the Build (production) job file manually.
"""

import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import zipfile

if len(sys.argv) < 4:
    print("Usage: python3 fetch_github_actions_logs.py owner repo branch")
    sys.exit(2)

OWNER = sys.argv[1]
REPO = sys.argv[2]
BRANCH = sys.argv[3]

TOKEN = os.environ.get("GITHUB_TOKEN")
if not TOKEN:
    print("ERROR: Set the GITHUB_TOKEN environment variable first (see instructions).")
    sys.exit(2)

API = "https://api.github.com"
HEADERS = {
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github+json",
    "User-Agent": "fetch-actions-logs-script",
}


def http_get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        return resp.read()


def json_get(url):
    try:
        data = http_get(url)
        return json.loads(data.decode())
    except Exception as e:
        print("Failed to fetch URL:", url)
        print("Error:", e)
        sys.exit(1)


def download_to_bytes(url):
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req) as resp:
            return resp.read()
    except Exception as e:
        print("Failed to download:", url)
        print("Error:", e)
        sys.exit(1)


def print_context(lines, index, before=8, after=20):
    start = max(0, index - before)
    end = min(len(lines), index + after + 1)
    for i in range(start, end):
        # Print with line numbers for clarity
        print(f"{i + 1:5d}: {lines[i].rstrip()}")


# 1) List workflow runs on branch (most recent first)
runs_url = f"{API}/repos/{OWNER}/{REPO}/actions/runs?branch={urllib.parse.quote(BRANCH)}&per_page=10"
print(f"Listing workflow runs for {OWNER}/{REPO} branch {BRANCH} ...")
runs = json_get(runs_url)
workflow_runs = runs.get("workflow_runs", [])
if not workflow_runs:
    print(
        "No workflow runs found for that branch. Make sure the branch exists and a PR was opened."
    )
    sys.exit(1)

# Pick the latest run
run = workflow_runs[0]
run_id = run["id"]
status = run.get("status")
conclusion = run.get("conclusion")
html_url = run.get("html_url")
print(f"Found run id={run_id} status={status} conclusion={conclusion} web:{html_url}")

# 2) Download logs (zip)
logs_url = f"{API}/repos/{OWNER}/{REPO}/actions/runs/{run_id}/logs"
print("Downloading logs (this may take a few seconds)...")
content = download_to_bytes(logs_url)

# 3) Unpack zip in memory and scan files for 'error' or 'FAIL'
try:
    z = zipfile.ZipFile(io.BytesIO(content))
except zipfile.BadZipFile:
    print("Downloaded content is not a valid ZIP file.")
    sys.exit(1)

names = z.namelist()
print(f"Logs contain {len(names)} files/jobs. Searching for first 'error' or 'fail'...")

first_found = False
for name in names:
    # skip extremely large files early (just in case)
    try:
        info = z.getinfo(name)
        # skip files over 5MB for quick scan; they'll be listed if nothing found
        if info.file_size > 5 * 1024 * 1024:
            continue
    except Exception:
        pass

    try:
        with z.open(name) as f:
            raw = f.read().decode(errors="replace")
    except Exception:
        continue

    lines = raw.splitlines()
    for i, line in enumerate(lines):
        low = line.lower()
        # match likely failure indicators
        if (
            ("error" in low and "optional" not in low)
            or "fail" in low
            or "exception" in low
        ):
            print("\n---")
            print(f"Job file: {name}")
            print_context(lines, i, before=8, after=20)
            first_found = True
            break
    if first_found:
        break

if not first_found:
    print("\nNo obvious 'error' or 'FAIL' text found inside logs.")
    print(
        "Listing the first 200 log files (open the one named like 'Build (production)/...'):"
    )
    for n in names[:200]:
        print(" -", n)
    print(
        "\nIf the job failed but no 'error' text is present, open the Build (production) job file from the list and paste the first 50-120 lines here."
    )
