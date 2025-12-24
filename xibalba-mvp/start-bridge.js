#!/usr/bin/env node
/**
 * ANTIGRAVITY BRIDGE STARTUP SCRIPT
 * Starts the Rosetta Stone API Blackhole Bridge
 * 
 * Usage: node start-bridge.js
 */

import AntigravityBridge from './antigravity-bridge-core.js';

// Configuration from environment or defaults
const config = {
  antsApiUrl: process.env.ANTS_API_URL || 'http://localhost:3213',
  antsApiKey: process.env.ANTS_API_KEY,
  antigravityApiUrl: process.env.ANTIGRAVITY_API_URL,
  bridgePort: process.env.BRIDGE_PORT || 4000, // Changed from 3001 to avoid conflicts
  bridgeHost: process.env.BRIDGE_HOST || '0.0.0.0'
};

console.log('🌉 Starting Antigravity Bridge (Rosetta Stone API Blackhole)...');
console.log(`📡 Bridge will listen on ${config.bridgeHost}:${config.bridgePort}`);
console.log(`🔗 Ants API: ${config.antsApiUrl}`);
console.log('');

// Create and start bridge
const bridge = new AntigravityBridge(config);

// Override start to use config host
const originalStart = bridge.start.bind(bridge);
bridge.start = function() {
  this.app.listen(this.config.bridgePort, this.config.bridgeHost || '0.0.0.0', () => {
    console.log(`🌉 Antigravity Bridge running on ${this.config.bridgeHost || '0.0.0.0'}:${this.config.bridgePort}`);
    console.log(`🚀 Using Our Ants API (FREE - no Google API costs)`);
    console.log(`🕳️  Black Hole Search Integration: Active`);
    console.log(`🌌 Cosmic Singularity: Operational`);
    console.log('');
    console.log(`✅ Health check: http://localhost:${this.config.bridgePort}/api/bridge/health`);
  });
};

bridge.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down bridge gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down bridge gracefully...');
  process.exit(0);
});

