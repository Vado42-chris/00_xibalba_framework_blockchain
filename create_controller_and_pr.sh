#!/bin/bash
# === START: Controller & UI setup script ===

# Kill old processes
pkill -f "node.*3000" || true
pkill -f "next.*3002" || true

# Create controller directory and sample files
mkdir -p controller
echo "// Controller main file" > controller/index.js
echo "module.exports = {};" >> controller/index.js

# Create UI sample directory and components
mkdir -p ui-sample
echo "// Sample UI component" > ui-sample/Widget.js
echo "export default function Widget() { return <div>Widget</div>; }" >> ui-sample/Widget.js

# Git setup
git checkout -b safety/add-controller-automation
git add controller ui-sample
git commit -m "feat(controller): add GitHub App controller and UI samples"
git push -u origin safety/add-controller-automation

# Create draft PR if gh CLI installed
if command -v gh >/dev/null 2>&1; then
  PR_URL=$(gh pr create --title "feat(controller): add GitHub App controller for automated PRs" --body "Auto-generated draft PR by script." --draft)
  echo "✅ Draft PR created: $PR_URL"
else
  echo "⚠️ gh CLI not found. Manually create draft PR at:"
  echo "https://github.com/Vado42-chris/00_xibalba_framework_blockchain/pull/new/safety/add-controller-automation"
fi

# === END SCRIPT ===
