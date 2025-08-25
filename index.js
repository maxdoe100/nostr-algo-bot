#!/usr/bin/env node

require('dotenv').config();

// Ensure WebSocket exists in Node environments
try {
  if (typeof WebSocket === 'undefined') {
    // eslint-disable-next-line global-require
    globalThis.WebSocket = require('ws');
  }
} catch (_) {
  // ignore
}

const express = require('express');
const NostrBangerBot = require('./src/bot/NostrBangerBot');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint to keep the service alive
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'Bot is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Nostr Banger Bot is running',
    endpoints: {
      health: '/health'
    }
  });
});

// Start HTTP server
app.listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
});

// Main execution
if (require.main === module) {
  const bot = new NostrBangerBot();
  bot.start().catch(console.error);
}

module.exports = NostrBangerBot;