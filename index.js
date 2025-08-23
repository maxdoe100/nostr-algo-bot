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

const NostrBangerBot = require('./src/bot/NostrBangerBot');

// Main execution
if (require.main === module) {
  const bot = new NostrBangerBot();
  bot.start().catch(console.error);
}

module.exports = NostrBangerBot;