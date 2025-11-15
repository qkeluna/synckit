import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { config } from './config';
import { SyncWebSocketServer } from './websocket/server';

/**
 * SyncKit TypeScript Reference Server
 * 
 * Production-ready WebSocket server for real-time synchronization
 */

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*', // TODO: Configure in production
  credentials: true,
}));

// Health check endpoint
app.get('/health', (c) => {
  const wsMetrics = wsServer?.getMetrics() || { totalConnections: 0, totalUsers: 0, totalClients: 0 };
  
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    uptime: process.uptime(),
    connections: wsMetrics,
  });
});

// Server info endpoint
app.get('/', (c) => {
  return c.json({
    name: 'SyncKit Server',
    version: '0.1.0',
    description: 'Production-ready WebSocket sync server',
    endpoints: {
      health: '/health',
      ws: '/ws',
      auth: '/auth (coming in Sub-Phase 7.3)',
      sync: '/sync (coming in Sub-Phase 7.4)',
    },
  });
});

// Create HTTP server with WebSocket upgrade
const server = serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host,
});

// Initialize WebSocket server
const wsServer = new SyncWebSocketServer(server);

console.log(`🚀 SyncKit Server running on ${config.host}:${config.port}`);
console.log(`📊 Health check: http://${config.host}:${config.port}/health`);
console.log(`🔌 WebSocket: ws://${config.host}:${config.port}/ws`);
console.log(`🔒 Environment: ${config.nodeEnv}`);

// Graceful shutdown
const shutdown = () => {
  console.log('📛 Shutdown signal received, shutting down gracefully...');
  wsServer.shutdown();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, server, wsServer };
