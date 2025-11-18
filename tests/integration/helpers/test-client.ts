/**
 * Test Client Utilities
 * 
 * Lightweight WebSocket client for server integration testing
 * Does NOT use the SDK - communicates directly with server via WebSocket
 */

import { TEST_CONFIG, getWebSocketUrl, generateTestId, sleep } from '../config';
import WebSocket from 'ws';

/**
 * Test client configuration
 */
export interface TestClientConfig {
  clientId?: string;
  userId?: string;
  autoConnect?: boolean;
  token?: string;
}

/**
 * Document state (in-memory tracking)
 */
interface DocumentState {
  [field: string]: any;
}

/**
 * Test client wrapper - Direct WebSocket communication
 */
export class TestClient {
  public readonly clientId: string;
  public readonly userId: string;
  private connected: boolean = false;
  private ws: WebSocket | null = null;
  
  // Track document states locally
  private documents: Map<string, DocumentState> = new Map();
  
  // Message callbacks
  private messageCallbacks: Map<string, (data: any) => void> = new Map();

  constructor(config: TestClientConfig = {}) {
    this.clientId = config.clientId || generateTestId('client');
    this.userId = config.userId || generateTestId('user');
  }

  /**
   * Initialize client (lightweight - no SDK needed)
   */
  async init(): Promise<void> {
    // Just initialize local state
    this.documents.clear();
    
    if (TEST_CONFIG.features.verbose) {
      console.log(`[TestClient:${this.clientId}] Initialized`);
    }
  }

  /**
   * Connect to test server via WebSocket
   */
  async connect(token?: string): Promise<void> {
    if (this.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      const wsUrl = getWebSocketUrl();
      this.ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, TEST_CONFIG.timeouts.connection);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.connected = true;

        // Send AUTH message (anonymous if no token)
        this.sendMessage({
          type: 'auth',
          id: generateTestId('msg'),
          timestamp: Date.now(),
        });

        if (TEST_CONFIG.features.verbose) {
          console.log(`[TestClient:${this.clientId}] Connected`);
        }

        resolve();
      });

      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      this.ws.on('close', () => {
        this.connected = false;
        if (TEST_CONFIG.features.verbose) {
          console.log(`[TestClient:${this.clientId}] Disconnected`);
        }
      });

      // Handle incoming messages
      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      });
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(message: any): void {
    // Handle auth success
    if (message.type === 'auth_success') {
      this.userId = message.userId;
    }
    
    // Handle sync response - full document state
    if (message.type === 'sync_response' && message.state) {
      // Merge with existing local state to avoid overwriting pending changes
      const existingDoc = this.documents.get(message.documentId) || {};
      this.documents.set(message.documentId, { ...message.state, ...existingDoc });
    }
    
    // Handle delta - incremental changes
    if (message.type === 'delta' && message.documentId) {
      // Apply delta to local state
      const doc = this.documents.get(message.documentId) || {};
      // For now, assuming delta contains the changes directly
      if (message.delta) {
        Object.assign(doc, message.delta);
        this.documents.set(message.documentId, doc);
      }
    }
    
    // Trigger any registered callbacks
    const callback = this.messageCallbacks.get(message.id || message.requestId);
    if (callback) {
      callback(message);
      this.messageCallbacks.delete(message.id || message.requestId);
    }
  }

  /**
   * Send message to server
   */
  private sendMessage(message: any): void {
    if (!this.ws || !this.connected) {
      throw new Error('WebSocket not connected');
    }
    
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Disconnect from server
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  /**
   * Ensure client is subscribed to a document
   * Sends sync_request if not already subscribed
   */
  private async ensureSubscribed(documentId: string): Promise<void> {
    // Track which documents we've subscribed to
    if (!this.documents.has(documentId)) {
      // Send sync_request to subscribe
      this.sendMessage({
        type: 'sync_request',
        id: generateTestId('msg'),
        timestamp: Date.now(),
        documentId,
      });
      
      // Initialize empty document locally
      this.documents.set(documentId, {});

      // Wait a bit for server to process subscription
      await sleep(10);
    }
  }

  /**
   * Set field in document
   */
  async setField(
    documentId: string,
    field: string,
    value: any
  ): Promise<void> {
    // Ensure subscribed before sending delta
    await this.ensureSubscribed(documentId);
    
    // Update local state immediately
    let doc = this.documents.get(documentId)!;
    doc[field] = value;

    // Send delta to server
    this.sendMessage({
      type: 'delta',
      id: generateTestId('msg'),
      timestamp: Date.now(),
      documentId,
      delta: { [field]: value },
      vectorClock: {},
    });

    // Small delay to allow propagation
    await sleep(10);
  }

  /**
   * Get field from document
   */
  async getField(
    documentId: string,
    field: string
  ): Promise<any> {
    await this.ensureSubscribed(documentId);
    const doc = this.documents.get(documentId);
    return doc ? doc[field] : undefined;
  }

  /**
   * Get entire document state
   */
  async getDocumentState(documentId: string): Promise<any> {
    await this.ensureSubscribed(documentId);
    return { ...this.documents.get(documentId)! };
  }

  /**
   * Get document (alias for getDocumentState - for test compatibility)
   * Requests document from server via sync_request
   */
  async getDocument(documentId: string): Promise<any> {
    // Send sync request to server
    const msgId = generateTestId('msg');
    this.sendMessage({
      type: 'sync_request',
      id: msgId,
      timestamp: Date.now(),
      documentId,
    });
    
    // Wait for response (with timeout)
    await sleep(100);
    return this.getDocumentState(documentId);
  }

  /**
   * Delete field from document
   */
  async deleteField(
    documentId: string,
    field: string
  ): Promise<void> {
    await this.ensureSubscribed(documentId);
    
    // Update local state
    const doc = this.documents.get(documentId)!;
    delete doc[field];

    // Send delta with null to delete field
    this.sendMessage({
      type: 'delta',
      id: generateTestId('msg'),
      timestamp: Date.now(),
      documentId,
      delta: { [field]: null },
      vectorClock: {},
    });

    await sleep(50);
  }

  /**
   * Subscribe to document changes
   * Note: Server auto-subscribes on sync_request, so this just sets up callback
   */
  async subscribeToDocument(
    documentId: string,
    callback: (state: any) => void
  ): Promise<() => void> {
    // Send sync_request to subscribe (server auto-subscribes on sync)
    this.sendMessage({
      type: 'sync_request',
      id: generateTestId('msg'),
      timestamp: Date.now(),
      documentId,
    });

    // Return unsubscribe function (no-op for now)
    return () => {
      // Server doesn't have explicit unsubscribe, cleans up on disconnect
    };
  }

  /**
   * Wait for document to reach expected state
   */
  async waitForState(
    documentId: string,
    expectedState: Record<string, any>,
    timeout: number = TEST_CONFIG.timeouts.sync
  ): Promise<void> {
    await this.ensureSubscribed(documentId);
    
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Direct access to avoid re-checking subscription
      const currentState = { ...this.documents.get(documentId)! };
      
      // Check if all expected fields match
      let matches = true;
      for (const [key, value] of Object.entries(expectedState)) {
        if (currentState[key] !== value) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return;
      }

      await sleep(100);
    }

    throw new Error(`Timeout waiting for document state after ${timeout}ms`);
  }

  /**
   * Wait for field to have expected value
   */
  async waitForField(
    documentId: string,
    field: string,
    expectedValue: any,
    timeout: number = TEST_CONFIG.timeouts.sync
  ): Promise<void> {
    await this.ensureSubscribed(documentId);
    
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Direct access to avoid re-checking subscription
      const doc = this.documents.get(documentId);
      const value = doc ? doc[field] : undefined;
      
      if (value === expectedValue) {
        return;
      }

      await sleep(100);
    }

    throw new Error(`Timeout waiting for field '${field}' to equal ${expectedValue} after ${timeout}ms`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.disconnect();
    this.documents.clear();
    this.messageCallbacks.clear();

    if (TEST_CONFIG.features.verbose) {
      console.log(`[TestClient:${this.clientId}] Cleaned up`);
    }
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get client ID
   */
  get id(): string {
    return this.clientId;
  }
}

/**
 * Create multiple test clients
 */
export async function createTestClients(count: number): Promise<TestClient[]> {
  const clients: TestClient[] = [];
  
  for (let i = 0; i < count; i++) {
    const client = new TestClient({
      userId: TEST_CONFIG.testData.userIds[i % TEST_CONFIG.testData.userIds.length],
    });
    await client.init();
    clients.push(client);
  }

  return clients;
}

/**
 * Cleanup multiple test clients
 */
export async function cleanupTestClients(clients: TestClient[]): Promise<void> {
  await Promise.all(clients.map(client => client.cleanup()));
}
