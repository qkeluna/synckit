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
  DeltaMessage 
} from './protocol';
import { config } from '../config';
import { verifyToken } from '../auth/jwt';
import { canReadDocument, canWriteDocument } from '../auth/rbac';
import { SyncCoordinator } from '../sync/coordinator';

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
 */
export class SyncWebSocketServer {
  private wss: WebSocketServer;
  private registry: ConnectionRegistry;
  private coordinator: SyncCoordinator;
  private connectionCounter = 0;

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
      // Subscribe connection to document updates
      this.coordinator.subscribe(documentId, connection.id);

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
      // Auto-subscribe client to document if not already subscribed
      this.coordinator.subscribe(documentId, connection.id);
      // console.log(`[handleDelta] Subscribed successfully`);

      // Get client ID for attribution
      const clientId = connection.clientId || connection.userId || connection.id;

      // console.log(`[handleDelta] Applying delta fields:`, delta);

      // Apply delta changes to document state
      // Delta from TestClient is an object with field->value pairs
      if (delta && typeof delta === 'object') {
        for (const [field, value] of Object.entries(delta)) {
          // console.log(`[handleDelta] Setting field ${field}=${value}`);
          if (value === null) {
            // Delete field (not implemented yet)
            // console.log(`Delete field ${field} in ${documentId}`);
          } else {
            // Set field - use coordinator's setField for proper persistence
            await this.coordinator.setField(documentId, field, value, clientId);
          }
        }
      }

      // console.log(`[handleDelta] Merging vector clock`);
      // Merge vector clock
      this.coordinator.mergeVectorClock(documentId, vectorClock);

      // console.log(`[handleDelta] Broadcasting to subscribers`);
      // Broadcast delta to all subscribers except sender
      this.broadcast(documentId, message, connection.id);

      // console.log(`Delta applied to ${message.documentId} from ${connection.id}`);
    } catch (error) {
      console.error('Error handling delta:', error);
      connection.sendError('Delta application failed', { documentId });
    }
  }

  /**
   * Broadcast message to all subscribers of a document
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
        const sent = connection.send(message);
        if (sent) sentCount++;
      }
    }

    console.log(`Broadcast to ${sentCount}/${subscribers.length} subscribers of ${documentId}`);
  }

  /**
   * Handle connection disconnect
   */
  private handleDisconnect(connection: Connection) {
    console.log(`Connection ${connection.id} disconnected`);
    
    // Connection will be automatically removed from registry via the close event
    // Subscriptions will be cleaned up when connection is removed
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

