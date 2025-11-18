/**
 * Test Server Harness
 * 
 * Manages SyncKit server lifecycle for integration tests
 */

import { Hono } from 'hono';
import { serve, Server } from '@hono/node-server';
import { SyncWebSocketServer } from '../../../server/typescript/src/websocket/server';
import { auth } from '../../../server/typescript/src/routes/auth';
import { TEST_CONFIG, getServerUrl } from '../config';

/**
 * Test server instance
 */
export class TestServer {
  private app: Hono | null = null;
  private server: Server | null = null;
  private wsServer: SyncWebSocketServer | null = null;
  private isRunning: boolean = false;

  /**
   * Start the test server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    // Create Hono app
    this.app = new Hono();

    // Mount auth routes
    this.app.route('/auth', auth);

    // Health check endpoint
    this.app.get('/health', (c) => {
      const stats = this.wsServer?.getStats();
      
      return c.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '0.1.0-test',
        uptime: process.uptime(),
        connections: stats?.connections || { totalConnections: 0, totalUsers: 0, totalClients: 0 },
        documents: stats?.documents || { totalDocuments: 0, documents: [] },
      });
    });

    // Server info endpoint
    this.app.get('/', (c) => {
      return c.json({
        name: 'SyncKit Test Server',
        version: '0.1.0-test',
        mode: 'test',
      });
    });

    // Start HTTP server
    this.server = serve({
      fetch: this.app.fetch,
      port: TEST_CONFIG.server.port,
      hostname: TEST_CONFIG.server.host,
    });

    // Initialize WebSocket server
    this.wsServer = new SyncWebSocketServer(
      this.server as any,
      {
        storage: undefined, // No storage in tests by default
        pubsub: undefined, // No Redis in tests by default
      }
    );

    this.isRunning = true;

    // Wait for server to be ready
    await this.waitForReady();

    if (TEST_CONFIG.features.verbose) {
      console.log(`[TestServer] Started on ${getServerUrl()}`);
    }
  }

  /**
   * Stop the test server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (TEST_CONFIG.features.verbose) {
      console.log('[TestServer] Stopping...');
    }

    // Close WebSocket server
    if (this.wsServer) {
      await this.wsServer.close();
      this.wsServer = null;
    }

    // Close HTTP server
    if (this.server) {
      await new Promise<void>((resolve) => {
        // Set a timeout to force resolve if server doesn't close
        const forceCloseTimeout = setTimeout(() => {
          console.warn('[TestServer] Force closing server after timeout');
          resolve();
        }, 1000);

        this.server!.close(() => {
          clearTimeout(forceCloseTimeout);
          resolve();
        });

        // Try to unref the server to prevent it from keeping process alive
        if (typeof (this.server as any).unref === 'function') {
          (this.server as any).unref();
        }
      });
      this.server = null;
    }

    this.app = null;
    this.isRunning = false;

    if (TEST_CONFIG.features.verbose) {
      console.log('[TestServer] Stopped');
    }
    
    // Small delay to ensure cleanup completes
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  /**
   * Restart the server
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Wait for server to be ready
   */
  private async waitForReady(timeout: number = 5000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`${getServerUrl()}/health`);
        if (response.ok) {
          return;
        }
      } catch (error) {
        // Server not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Server failed to start within ${timeout}ms`);
  }

  /**
   * Get server stats
   */
  getStats(): any {
    return this.wsServer?.getStats();
  }

  /**
   * Check if server is running
   */
  get running(): boolean {
    return this.isRunning;
  }
}

/**
 * Global test server instance
 */
let globalTestServer: TestServer | null = null;

/**
 * Get or create global test server
 */
export function getTestServer(): TestServer {
  if (!globalTestServer) {
    globalTestServer = new TestServer();
  }
  return globalTestServer;
}

/**
 * Start test server (convenience function)
 */
export async function startTestServer(): Promise<TestServer> {
  const server = getTestServer();
  if (!server.running) {
    await server.start();
  }
  return server;
}

/**
 * Stop test server (convenience function)
 */
export async function stopTestServer(): Promise<void> {
  if (globalTestServer) {
    await globalTestServer.stop();
  }
}

/**
 * Setup helper for tests (beforeAll)
 */
export async function setupTestServer(): Promise<TestServer> {
  const server = await startTestServer();
  return server;
}

/**
 * Teardown helper for tests (afterAll)
 */
export async function teardownTestServer(): Promise<void> {
  await stopTestServer();
  globalTestServer = null;

  // Force cleanup of any remaining handles
  await new Promise(resolve => setTimeout(resolve, 100));

  // Force garbage collection if available (helps in tests)
  if (global.gc) {
    global.gc();
  }
}

/**
 * Restart test server (convenience function)
 */
export async function restartTestServer(options?: { graceful?: boolean }): Promise<void> {
  if (!globalTestServer) {
    throw new Error('Test server not initialized');
  }
  
  if (options?.graceful) {
    // Graceful restart: wait a bit for pending operations
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  await globalTestServer.restart();
}
