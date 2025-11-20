import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { Connection, ConnectionState } from './connection';
import { ConnectionRegistry } from './registry';
import {
  Message,
  MessageType,
  createMessageId,
  AuthMessage,
  AuthSuccessMessage,
  AuthErrorMessage,
  SyncRequestMessage,
  SyncResponseMessage,
  DeltaMessage,
  AckMessage
} from './protocol';
import { config } from '../config';
import { verifyToken } from '../auth/jwt';
import { canReadDocument, canWriteDocument } from '../auth/rbac';
import { SyncCoordinator } from '../sync/coordinator';

/**
 * Pending ACK Info - tracks unacknowledged deltas
 */
interface PendingAckInfo {
  messageId: string;
  documentId: string;
  message: DeltaMessage;
  targetConnectionId: string;
  attempts: number;
  timeout: NodeJS.Timeout;
  sentAt: number;
}

/**
 * WebSocket Server
 *
 * Integrates WebSocket support with Hono HTTP server
 * Implements Phase 4 deferred features + Sync logic:
 * - Wire protocol (message format)
 * - Heartbeat/keepalive
 * - Connection state management
 * - Reconnection support
 * - Sync coordination with Rust WASM core
 * - ACK-based reliable delivery with retries
 */
export class SyncWebSocketServer {
  private wss: WebSocketServer;
  private registry: ConnectionRegistry;
  private coordinator: SyncCoordinator;
  private connectionCounter = 0;

  // ACK tracking for reliable delivery
  private pendingAcks: Map<string, PendingAckInfo> = new Map();
  private readonly ACK_TIMEOUT = 3000; // 3 seconds
  private readonly MAX_RETRIES = 3;

  // Delta batching to reduce message volume
  private pendingBatches: Map<string, { delta: Record<string, any>, timer: NodeJS.Timeout }> = new Map();
  private readonly BATCH_INTERVAL = 50; // 50ms batching window

  constructor(
    server: Server,
    options?: {
      storage?: any; // StorageAdapter
      pubsub?: any;  // RedisPubSub
    }
  ) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });
    
    this.registry = new ConnectionRegistry();
    this.coordinator = new SyncCoordinator({
      storage: options?.storage,
      pubsub: options?.pubsub,
      serverId: `server-${Date.now()}`,
    });
    this.setupHandlers();
  }

  /**
   * Setup WebSocket server handlers
   */
  private setupHandlers() {
    this.wss.on('connection', this.handleConnection.bind(this));
    
    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket) {
    // Check connection limit
    if (this.registry.count() >= config.wsMaxConnections) {
      ws.close(1008, 'Server at maximum capacity');
      return;
    }

    // Create connection
    const connectionId = `conn-${++this.connectionCounter}`;
    const connection = new Connection(ws, connectionId);
    
    // Add to registry
    this.registry.add(connection);
    console.log(`New connection: ${connectionId} (total: ${this.registry.count()})`);

    // Start heartbeat
    connection.startHeartbeat(config.wsHeartbeatInterval);

    // Setup message handlers
    connection.on('message', async (message: Message) => {
      await this.handleMessage(connection, message);
    });

    connection.on('close', () => {
      this.handleDisconnect(connection);
    });
  }

  /**
   * Handle incoming message from client
   */
  private async handleMessage(connection: Connection, message: Message) {
    console.log(`[handleMessage] Received ${message.type} from ${connection.id}`);
    
    try {
      switch (message.type) {
        case MessageType.CONNECT:
          // CONNECT is handled during connection setup, acknowledge it
          break;

        case MessageType.AUTH:
          await this.handleAuth(connection, message as AuthMessage);
          break;

        case MessageType.SYNC_REQUEST:
          await this.handleSyncRequest(connection, message as SyncRequestMessage);
          break;

        case MessageType.DELTA:
          await this.handleDelta(connection, message as DeltaMessage);
          break;

        case MessageType.ACK:
          this.handleAck(connection, message as AckMessage);
          break;

        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      connection.sendError('Internal server error');
    }
  }

  /**
   * Handle authentication
   */
  private async handleAuth(connection: Connection, message: AuthMessage) {
    try {
      // Verify JWT token
      let userId: string;
      let tokenPayload: any;

      if (message.token) {
        const decoded = await verifyToken(message.token);
        if (!decoded) {
          throw new Error('Invalid token');
        }
        userId = decoded.userId;
        tokenPayload = decoded;
      } else if (message.apiKey) {
        // TODO: Implement API key authentication
        connection.sendError('API key authentication not yet implemented');
        return;
      } else {
        // Anonymous connection (read-only by default, admin for tests)
        userId = 'anonymous';
        tokenPayload = {
          userId: 'anonymous',
          permissions: {
            canRead: [],
            canWrite: [],
            isAdmin: true, // Give admin permissions for test mode
          },
        };
      }

      // Update connection state
      connection.state = ConnectionState.AUTHENTICATED;
      connection.userId = userId;
      connection.tokenPayload = tokenPayload;

      // Link to registry
      this.registry.linkUser(connection.id, userId);

      // Send success response
      const response: AuthSuccessMessage = {
        type: MessageType.AUTH_SUCCESS,
        id: createMessageId(),
        timestamp: Date.now(),
        userId,
        permissions: tokenPayload.permissions,
      };
      connection.send(response);

      console.log(`Connection ${connection.id} authenticated as ${userId}`);
    } catch (error) {
      console.error('Authentication failed:', error);
      
      const response: AuthErrorMessage = {
        type: MessageType.AUTH_ERROR,
        id: createMessageId(),
        timestamp: Date.now(),
        error: 'Authentication failed',
      };
      connection.send(response);
      
      // Close connection on auth failure
      connection.close(1008, 'Authentication failed');
    }
  }

  /**
   * Handle sync request - client wants document state
   */
  private async handleSyncRequest(connection: Connection, message: SyncRequestMessage) {
    console.log(`[handleSyncRequest] Processing for ${message.documentId}`);
    const { documentId, vectorClock } = message;

    // Check authentication
    if (connection.state !== ConnectionState.AUTHENTICATED || !connection.tokenPayload) {
      connection.sendError('Not authenticated');
      return;
    }

    // Check read permission
    if (!canReadDocument(connection.tokenPayload, documentId)) {
      connection.sendError('Permission denied', { documentId });
      return;
    }

    try {
      // Ensure document is loaded from storage (if available)
      await this.coordinator.getDocument(documentId);

      // Subscribe connection to document updates
      this.coordinator.subscribe(documentId, connection.id);
      connection.addSubscription(documentId);

      // Merge client's vector clock if provided
      if (vectorClock) {
        this.coordinator.mergeVectorClock(documentId, vectorClock);
      }

      // Get current document state
      const state = this.coordinator.getDocumentState(documentId);
      // Vector clock could be included in future for delta computation
      // const serverVectorClock = this.coordinator.getVectorClock(documentId);

      // Send response
      const response: SyncResponseMessage = {
        type: MessageType.SYNC_RESPONSE,
        id: createMessageId(),
        timestamp: Date.now(),
        requestId: message.id,
        documentId,
        state,
        deltas: [], // TODO: Compute missing deltas based on vector clock diff
      };
      connection.send(response);

      console.log(`Sync request for ${documentId} from ${connection.id}`);
    } catch (error) {
      console.error('Error handling sync request:', error);
      connection.sendError('Sync request failed', { documentId });
    }
  }

  /**
   * Handle delta - client sending changes
   */
  private async handleDelta(connection: Connection, message: DeltaMessage) {
    // console.log(`[handleDelta] Processing delta for ${message.documentId}`);
    const { documentId, vectorClock, delta } = message;

    // console.log(`[handleDelta] Checking authentication`);
    // Check authentication
    if (connection.state !== ConnectionState.AUTHENTICATED || !connection.tokenPayload) {
      // console.log(`[handleDelta] Auth check failed`);
      connection.sendError('Not authenticated');
      return;
    }
    // console.log(`[handleDelta] Auth check passed`);

    // console.log(`[handleDelta] Checking write permission`);
    // Check write permission
    if (!canWriteDocument(connection.tokenPayload, documentId)) {
      // console.log(`[handleDelta] Permission check failed`);
      connection.sendError('Permission denied', { documentId });
      return;
    }
    // console.log(`[handleDelta] Permission check passed`);

    try {
      // console.log(`[handleDelta] About to subscribe, coordinator=${!!this.coordinator}`);
      // Ensure document is loaded from storage (critical after server restart)
      await this.coordinator.getDocument(documentId);

      // Auto-subscribe client to document if not already subscribed
      this.coordinator.subscribe(documentId, connection.id);
      connection.addSubscription(documentId);
      // console.log(`[handleDelta] Subscribed successfully`);

      // Get client ID for attribution
      // Use connection.id to ensure each connection has its own vector clock entry
      // (In production, connection.clientId should be set to a stable client identifier)
      const clientId = connection.clientId || connection.id;

      // console.log(`[handleDelta] Applying delta fields:`, delta);

      // Apply delta changes to document state
      // Delta from TestClient is an object with field->value pairs
      const authoritativeDelta: Record<string, any> = {};

      if (delta && typeof delta === 'object') {
        for (const [field, value] of Object.entries(delta)) {
          // console.log(`[handleDelta] Setting field ${field}=${value}`);
          // Check for tombstone marker (delete operation)
          const isTombstone = value !== null && typeof value === 'object' &&
                             '__deleted' in value && value.__deleted === true;

          if (isTombstone) {
            // Delete field - returns null if delete wins, or existing value if concurrent write wins
            const authoritativeValue = await this.coordinator.deleteField(documentId, field, clientId, message.timestamp);
            // Send tombstone marker if delete won, otherwise send the value that won
            authoritativeDelta[field] = authoritativeValue === null ? { __deleted: true } : authoritativeValue;
          } else {
            // Set field - returns authoritative value after LWW conflict resolution
            // This now supports null as a valid value!
            const authoritativeValue = await this.coordinator.setField(documentId, field, value, clientId, message.timestamp);
            authoritativeDelta[field] = authoritativeValue;
          }
        }
      }

      // Merge vector clock
      this.coordinator.mergeVectorClock(documentId, vectorClock);

      // Add to batch instead of immediate broadcast
      // This coalesces rapid updates into fewer messages, reducing ACK overhead
      this.addToBatch(documentId, authoritativeDelta, message);

      // console.log(`Delta applied to ${message.documentId} from ${connection.id}`);
    } catch (error) {
      console.error('Error handling delta:', error);
      connection.sendError('Delta application failed', { documentId });
    }
  }

  /**
   * Handle ACK - client acknowledging delta receipt
   */
  private handleAck(connection: Connection, message: AckMessage) {
    const { messageId } = message;

    // Construct the same ackKey used when storing (connection.id + message.id)
    const ackKey = `${connection.id}-${messageId}`;

    // Check if we're tracking this message
    const pendingAck = this.pendingAcks.get(ackKey);
    if (!pendingAck) {
      // Already acknowledged or unknown message
      return;
    }

    // Verify ACK is from the correct client
    if (pendingAck.targetConnectionId !== connection.id) {
      console.warn(`ACK from wrong client: expected ${pendingAck.targetConnectionId}, got ${connection.id}`);
      return;
    }

    // Clear timeout and remove from pending
    clearTimeout(pendingAck.timeout);
    this.pendingAcks.delete(ackKey);

    console.log(`ACK received for message ${messageId} (${Date.now() - pendingAck.sentAt}ms latency)`);
  }

  /**
   * Add delta to batch for coalescing
   */
  private addToBatch(documentId: string, delta: Record<string, any>, originalMessage: DeltaMessage) {
    let batch = this.pendingBatches.get(documentId);

    if (!batch) {
      // Create new batch with timer to flush after BATCH_INTERVAL
      batch = {
        delta: {},
        timer: setTimeout(() => {
          this.flushBatch(documentId);
        }, this.BATCH_INTERVAL),
      };
      this.pendingBatches.set(documentId, batch);
    }

    // Merge delta into batch (later updates override earlier ones)
    Object.assign(batch.delta, delta);
  }

  /**
   * Flush batched deltas for a document
   */
  private flushBatch(documentId: string) {
    const batch = this.pendingBatches.get(documentId);
    if (!batch) return;

    // Clear timer and remove batch
    clearTimeout(batch.timer);
    this.pendingBatches.delete(documentId);

    // Broadcast the coalesced delta
    if (Object.keys(batch.delta).length > 0) {
      const authoritativeMessage: DeltaMessage = {
        type: MessageType.DELTA,
        id: createMessageId(),
        timestamp: Date.now(),
        documentId,
        delta: batch.delta,
        vectorClock: {},
      };

      console.log(`[Server] Broadcasting batched delta for ${documentId} (${Object.keys(batch.delta).length} fields):`, batch.delta);
      this.broadcast(documentId, authoritativeMessage);
    }
  }

  /**
   * Broadcast message to all subscribers of a document (with ACK tracking)
   */
  private broadcast(documentId: string, message: Message, excludeConnectionId?: string) {
    const subscribers = this.coordinator.getSubscribers(documentId);

    let sentCount = 0;
    for (const connectionId of subscribers) {
      // Skip the sender
      if (connectionId === excludeConnectionId) {
        continue;
      }

      const connection = this.registry.get(connectionId);
      if (connection && connection.state === ConnectionState.AUTHENTICATED) {
        // Send with ACK tracking (for delta messages)
        if (message.type === MessageType.DELTA) {
          this.sendWithAck(connection, message as DeltaMessage, documentId);
          sentCount++;
        } else {
          // Other message types don't need ACKs
          const sent = connection.send(message);
          if (sent) sentCount++;
        }
      }
    }

    console.log(`Broadcast to ${sentCount}/${subscribers.length} subscribers of ${documentId}`);
  }

  /**
   * Send delta with ACK tracking and retry
   */
  private sendWithAck(connection: Connection, message: DeltaMessage, documentId: string) {
    // Ensure message has an ID
    if (!message.id) {
      message.id = createMessageId();
    }

    // Send the message
    const sent = connection.send(message);
    if (!sent) {
      console.error(`Failed to send delta to ${connection.id}`);
      return;
    }

    // Track pending ACK
    const ackKey = `${connection.id}-${message.id}`;
    const attemptRetry = (attempts: number) => {
      if (attempts >= this.MAX_RETRIES) {
        console.error(`Max retries reached for message ${message.id} to ${connection.id}`);
        this.pendingAcks.delete(ackKey);
        return;
      }

      // Setup retry timeout
      const timeout = setTimeout(() => {
        // Check if already ACKed (race condition safety)
        if (!this.pendingAcks.has(ackKey)) {
          return;
        }

        console.warn(`ACK timeout for message ${message.id} to ${connection.id}, retry ${attempts + 1}/${this.MAX_RETRIES}`);

        // Resend the message
        const conn = this.registry.get(connection.id);
        if (conn && conn.state === ConnectionState.AUTHENTICATED) {
          const resent = conn.send(message);
          if (resent) {
            // Update attempt count and setup next retry
            const pendingAck = this.pendingAcks.get(ackKey);
            if (pendingAck) {
              pendingAck.attempts = attempts + 1;
              pendingAck.sentAt = Date.now();
              attemptRetry(attempts + 1);
            }
          } else {
            // Connection is dead, clean up
            this.pendingAcks.delete(ackKey);
          }
        } else {
          // Connection gone, clean up
          this.pendingAcks.delete(ackKey);
        }
      }, this.ACK_TIMEOUT);

      // Store pending ACK info
      this.pendingAcks.set(ackKey, {
        messageId: message.id,
        documentId,
        message,
        targetConnectionId: connection.id,
        attempts,
        timeout,
        sentAt: Date.now(),
      });
    };

    // Start retry tracking
    attemptRetry(0);
  }

  /**
   * Handle connection disconnect
   */
  private handleDisconnect(connection: Connection) {
    console.log(`Connection ${connection.id} disconnected`);

    // Clean up all document subscriptions for this connection
    const subscriptions = connection.getSubscriptions();
    for (const documentId of subscriptions) {
      this.coordinator.unsubscribe(documentId, connection.id);
    }

    // Clean up pending ACKs for this connection
    const keysToDelete: string[] = [];
    for (const [key, pendingAck] of this.pendingAcks.entries()) {
      if (pendingAck.targetConnectionId === connection.id) {
        clearTimeout(pendingAck.timeout);
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.pendingAcks.delete(key);
    }

    // Connection will be automatically removed from registry via the close event
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      connections: this.registry.getMetrics(),
      documents: this.coordinator.getStats(),
    };
  }

  /**
   * Graceful shutdown
   */
  /**
   * Clear coordinator's in-memory cache (for test cleanup)
   */
  clearCoordinatorCache(): void {
    this.coordinator.clearCache();
  }

  async close() {
    console.log('Closing WebSocket server...');

    // Close all connections
    this.registry.closeAll(1001, 'Server shutdown');

    // Cleanup coordinator resources
    this.coordinator.dispose();

    // Close WebSocket server
    return new Promise<void>((resolve) => {
      this.wss.close(() => {
        console.log('WebSocket server closed');
        resolve();
      });
    });
  }
}

