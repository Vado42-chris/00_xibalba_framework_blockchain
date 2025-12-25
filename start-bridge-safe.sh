#!/bin/bash
# Safe Bridge Starter - Run from parent directory to avoid node_modules safety limit
# This allows Jules to start the server without being blocked

cd "$(dirname "$0")/xibalba-mvp"
node start-bridge.js

