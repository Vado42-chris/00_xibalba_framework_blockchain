# Quick GitHub Actions Log Fetcher — README

This folder contains a small, single-file utility that helps non-developers quickly fetch the first failing block from a GitHub Actions run for a given branch and repository. The goal is simple: make it easy to get the 30–80 lines around the first error so you can paste that into support or into a chat for diagnosis.

Tool location
- Script: `00_xibalba_alpaca/tools/fetch_github_actions_logs.py`

What this tool does (in plain English)
- Finds the most recent Actions run for the branch you specify.
- Downloads the run's logs.
- Scans the logs and prints the first place it finds an „error“, „fail“ or „exception“ with ~8 lines of context before and ~20 lines after.
- If it can't find obvious error text, it lists job log files so you can open the Build (production) job manually.

Quick start — 3 steps (copy & paste)
1. Create a GitHub personal access token (one-time)
   - Visit GitHub → Settings → Developer settings → Personal access tokens.
   - Create a token and give it these scopes:
     - `workflow` and `repo` (or `public_repo` if the repository is public).
   - Copy the token and keep it secret. Do not share it in public chat.

2. Save the script (if not already in the repo)
   - The script is already placed at:
     ```
     00_xibalba_alpaca/tools/fetch_github_actions_logs.py
     ```
   - Make the script executable (optional):
     ```
     chmod +x 00_xibalba_alpaca/tools/fetch_github_actions_logs.py
     ```

3. Run the script (example for this repo + branch)
   - From any terminal:
     ```
     export GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXXXXXX"
     python3 00_xibalba_alpaca/tools/fetch_github_actions_logs.py Vado42-chris 00_xibalba_framework_blockchain salvage/save-before-ai
     ```
   - Replace `Vado42-chris`, `00_xibalba_framework_blockchain`, and `salvage/save-before-ai` with your GitHub owner, repo, and branch.

What you'll see
- If the script finds a failure, it prints something like:
  - File/job name
  - The lines around the first error, with line numbers
- Copy and paste that block (the entire printed block) into your support channel or here for diagnosis.

If the script reports "No workflow runs found"
- Make sure the branch exists and a PR was opened for the branch.
- If you just pushed, wait a minute for GitHub Actions to register runs.
- You can open the PR in a browser and re-run the script after the workflow starts.

If the script prints a list of log files (no 'error' found)
- Look for a file name containing `Build (production)` (or similar).
- Tell me which file from the list and I will tell you exactly which lines to paste.

Security notes (important)
- The token gives access to your repository’s workflows and contents. Treat it like a password:
  - Do not share it in public.
  - Use a token with minimal scopes (prefer `public_repo` when possible).
  - Revoke the token after you are done if you prefer.
- The script does not store your token on disk — it reads it from the environment variable `GITHUB_TOKEN` only during execution.

Troubleshooting
- Python errors: run `python3 --version` to make sure you have Python 3.8+.
- Network errors / permission errors: verify the token scopes and that the token is valid for the target repo (private repos need `repo`).
- Large repositories: the script skips extremely large log files for speed; if no match is found it lists job logs for manual inspection.

Want me to add the tool into the repo for you?
- If you want this file committed into the repo and committed automatically, I can provide the exact git commands to create, add, commit, and push it. Ask: “Write tool to repo” and I’ll show the commands.

How to use the output here
- Paste the entire block the script prints (including file/job header and the lines around the error).
- I will respond with a 1–2 line diagnosis and a minimal patch (exact file edits + git commands) you can run to fix the problem.

If you prefer a guided click-through using the GitHub web UI
- Tell me “Web UI” and I’ll give concise step-by-step clickable instructions for creating the PR and copying the failing logs without any script or tokens.

If anything is confusing, tell me which step you’re stuck on (I’ll guide exactly the next mouse-click or command).