#!/usr/bin/env bash
#
# create_client_from_template.sh
#
# Create a new client repository from an existing template repository,
# add a basic `client-config.yaml`, and set deployment secrets.
#
# Usage:
#   ./create_client_from_template.sh <org> <template_repo> <client_slug> <client_display_name> <deploy_host> [ssh_key_file]
#
# Example:
#   ./create_client_from_template.sh myorg myorg/xiio-template client-acme "ACME Corp" root@203.0.113.45 /path/to/acme_key.pem
#
# Requirements:
# - `gh` (GitHub CLI) authenticated and authorized to create repos in the target org
# - `git` installed
# - Optional: path to client's deploy SSH private key (will be uploaded to the target repo as a GitHub Actions secret)
#
# Security note:
# - Do NOT hardcode secrets. This script will read the provided SSH key file temporarily to set a repo secret via `gh`.
# - The SSH private key content will NOT be stored in the repo, only as an encrypted GitHub Actions secret.
#
set -euo pipefail

usage() {
  cat <<EOF
Usage:
  $0 <org> <template_repo> <client_slug> <client_display_name> <deploy_host> [ssh_key_file]

Arguments:
  org                 : GitHub organization or user that will own the new client repo (e.g. myorg)
  template_repo       : Template repo in the format owner/template (e.g. myorg/xiio-template)
  client_slug         : Short slug for the client repo (e.g. client-acme)
  client_display_name : Human-friendly name (e.g. "ACME Corp")
  deploy_host         : Deploy host (ssh) for Actions secrets (e.g. root@203.0.113.45)
  ssh_key_file        : (optional) Path to SSH private key file to set as ARIES_SSH_KEY secret
EOF
}

if [ "${1:-}" = "" ] || [ "${2:-}" = "" ] || [ "${3:-}" = "" ] || [ "${4:-}" = "" ] || [ "${5:-}" = "" ]; then
  usage
  exit 1
fi

ORG="$1"
TEMPLATE="$2"         # expects owner/template
CLIENT_SLUG="$3"
CLIENT_NAME="$4"
DEPLOY_HOST="$5"
SSH_KEY_FILE="${6:-}"

NEW_REPO="${ORG}/${CLIENT_SLUG}"
TMP_DIR="$(mktemp -d)"
CLEANUP() {
  rm -rf "$TMP_DIR"
}
trap CLEANUP EXIT

# Verify required tools
if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh (GitHub CLI) not found. Install and run 'gh auth login' first." >&2
  exit 2
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git not found. Please install git." >&2
  exit 2
fi

# Create repo from template
echo "Creating repo ${NEW_REPO} from template ${TEMPLATE}..."
if gh repo view "${NEW_REPO}" >/dev/null 2>&1; then
  echo "Repository ${NEW_REPO} already exists. Aborting." >&2
  exit 1
fi

# Use gh to create repo from template
if ! gh repo create --template "${TEMPLATE}" "${NEW_REPO}" --private --confirm >/dev/null 2>&1; then
  echo "Failed to create repo ${NEW_REPO} from template ${TEMPLATE}." >&2
  echo "Make sure your 'gh' session is authenticated and you have permission to create repos in ${ORG}." >&2
  exit 3
fi

echo "Repository created: https://github.com/${NEW_REPO}"

# Clone the new repo locally to add client config
echo "Cloning ${NEW_REPO} to temporary directory..."
git clone "git@github.com:${NEW_REPO}.git" "$TMP_DIR"
cd "$TMP_DIR"

# Create client-config.yaml
CONFIG_FILE="client-config.yaml"
echo "Creating ${CONFIG_FILE}..."
cat > "${CONFIG_FILE}" <<EOF
brand:
  name: "${CLIENT_NAME}"
  logo: "/assets/${CLIENT_SLUG}-logo.png"
deploy:
  host: "${DEPLOY_HOST}"
  path: "/var/www/${CLIENT_SLug:-$CLIENT_SLUG}"
# Add additional per-client settings below:
# env:
#   VAR_A: "value"
#   VAR_B: "value"
EOF

git add "${CONFIG_FILE}"
git commit -m "chore: add client-config for ${CLIENT_SLUG}" || true
git push origin main || true

echo "Pushed ${CONFIG_FILE} to ${NEW_REPO}"

# Set repository secrets using gh (ARIES_HOST and optional ARIES_SSH_KEY)
echo "Setting repository secret ARIES_HOST=${DEPLOY_HOST}..."
gh secret set ARIES_HOST --body "${DEPLOY_HOST}" --repo "${NEW_REPO}" >/dev/null 2>&1 || {
  echo "Warning: failed to set ARIES_HOST secret via gh. You may need to set it manually in repo settings." >&2
}

if [ -n "${SSH_KEY_FILE}" ]; then
  if [ ! -f "${SSH_KEY_FILE}" ]; then
    echo "Warning: SSH key file '${SSH_KEY_FILE}' not found. Skipping ARIES_SSH_KEY secret." >&2
  else
    echo "Setting ARIES_SSH_KEY secret from ${SSH_KEY_FILE}..."
    # Read key content and set secret
    KEY_CONTENT="$(sed -e 's/\r$//' "${SSH_KEY_FILE}")"
    # Use gh to set secret
    printf "%s" "${KEY_CONTENT}" | gh secret set ARIES_SSH_KEY --repo "${NEW_REPO}" --body - >/dev/null 2>&1 || {
      echo "Warning: failed to set ARIES_SSH_KEY via gh. You may need to set it manually." >&2
    }
  fi
else
  echo "No SSH key file provided. Remember to add ARIES_SSH_KEY secret in the repo if required."
fi

# Provide final instructions
echo
echo "Done. Repo created: https://github.com/${NEW_REPO}"
echo
echo "Next recommended steps:"
echo "  1) Open the new repo and review client-config.yaml and CI workflows."
echo "     https://github.com/${NEW_REPO}"
echo "  2) In the repository Settings → Secrets → Actions verify ARIES_HOST and ARIES_SSH_KEY are present."
echo "  3) Edit client-config.yaml to add real branding (logo assets) and any per-client env vars."
echo "  4) Trigger a deploy by making a small change (e.g., update README) and pushing a branch / opening a PR."
echo
echo "If you want this to also wire DNS, TLS, or a per-client deploy pipeline, run those steps separately (this script only bootstraps the repo + secrets)."
