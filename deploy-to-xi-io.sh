#!/bin/bash
# Deploy Xibalba Alpaca to xi-io.com
# Uses existing server at 162.217.146.98

set -e

SERVER="162.217.146.98"
SERVER_USER="root"
DOMAIN="xi-io.com"
WEB_ROOT="/home/xi-io/public_html"

# Source: The built client
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/client/dist" && pwd)"

echo "🚀 Deploying Xibalba Alpaca to xi-io.com"
echo "=========================================="
echo ""
echo "Server: $SERVER"
echo "Web Root: $WEB_ROOT"
echo "Source: $SOURCE_DIR"
echo ""

# Step 1: Verify source exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ Source directory not found: $SOURCE_DIR"
    echo "   Building first..."
    cd "$(dirname "${BASH_SOURCE[0]}")/client"
    npm run build
    SOURCE_DIR="$(pwd)/dist"
fi
echo "✅ Source directory: $SOURCE_DIR"

# Step 2: Test SSH
echo ""
echo "📡 Testing SSH..."
if ssh -o ConnectTimeout=5 "$SERVER_USER@$SERVER" "echo 'SSH OK'" 2>/dev/null; then
    echo "✅ SSH working"
else
    echo "❌ SSH failed - check SSH keys"
    exit 1
fi

# Step 3: Verify web root
echo ""
echo "📁 Checking web root..."
if ssh "$SERVER_USER@$SERVER" "test -d $WEB_ROOT" 2>/dev/null; then
    echo "✅ Web root exists: $WEB_ROOT"
else
    echo "⚠️  Web root not found, trying alternatives..."
    for alt in "/var/www/html/xi-io-com" "/var/www/html" "/var/www/xi-io.com"; do
        if ssh "$SERVER_USER@$SERVER" "test -d $alt" 2>/dev/null; then
            WEB_ROOT="$alt"
            echo "✅ Using: $WEB_ROOT"
            break
        fi
    done
    if [ "$WEB_ROOT" = "/home/xi-io/public_html" ]; then
        echo "❌ No web root found"
        exit 1
    fi
fi

# Step 4: Backup existing
echo ""
echo "💾 Backing up existing files..."
ssh "$SERVER_USER@$SERVER" "cd $WEB_ROOT && tar -czf ~/xi-io-backup-\$(date +%Y%m%d-%H%M%S).tar.gz . 2>/dev/null || echo 'No existing files'"

# Step 5: Deploy
echo ""
echo "📤 Deploying files..."
rsync -avz --delete \
    "$SOURCE_DIR/" "$SERVER_USER@$SERVER:$WEB_ROOT/"

# Step 6: Permissions
echo ""
echo "🔐 Setting permissions..."
ssh "$SERVER_USER@$SERVER" "chown -R xi-io:xi-io $WEB_ROOT 2>/dev/null || chown -R www-data:www-data $WEB_ROOT && chmod -R 755 $WEB_ROOT"

# Step 7: Reload web server
echo ""
echo "🔄 Reloading web server..."
ssh "$SERVER_USER@$SERVER" "systemctl reload nginx 2>/dev/null || systemctl reload apache2 2>/dev/null || systemctl reload httpd 2>/dev/null || echo '⚠️  Please reload web server manually'"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Visit: http://$DOMAIN"
echo ""
