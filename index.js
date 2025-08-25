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
const http = require('http');
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

// 10-minute keep-alive task to prevent freezing on Render's free tier
const startKeepAliveTask = () => {
  const KEEP_ALIVE_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds
  
  setInterval(() => {
    const timestamp = new Date().toISOString();
    console.log(`🔄 Keep-alive task: Bot is running at ${timestamp}`);
    
    // Optional: Make an internal HTTP request to /health endpoint
    // This simulates external traffic and helps keep the service active
    const healthCheck = http.get(`http://localhost:${PORT}/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`✅ Internal /health check successful: ${data.trim()}`);
      });
    }).on('error', (err) => {
      console.log(`⚠️ Internal /health check failed: ${err.message}`);
    });
    
    // Set a timeout for the health check to prevent hanging
    healthCheck.setTimeout(5000, () => {
      console.log('⏰ Internal /health check timed out');
      healthCheck.destroy();
    });
    
  }, KEEP_ALIVE_INTERVAL);
  
  console.log(`🔄 Keep-alive task started - will run every 10 minutes`);
};

// Main execution
if (require.main === module) {
  const bot = new NostrBangerBot();
  
  // Start the keep-alive task
  startKeepAliveTask();
  
  bot.start().catch(console.error);
}

module.exports = NostrBangerBot;