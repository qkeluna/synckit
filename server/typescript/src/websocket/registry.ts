import { Connection } from './connection';

/**
 * Connection Registry - tracks all active WebSocket connections
 * 
 * Provides:
 * - Connection lookup by ID, user ID, client ID
 * - Connection lifecycle management
 * - Broadcast capabilities
 * - Connection metrics
 */
export class ConnectionRegistry {
  private connections: Map<string, Connection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map(); // userId -> connectionIds
  private clientConnections: Map<string, string> = new Map(); // clientId -> connectionId

  /**
   * Add connection to registry
   */
  add(connection: Connection) {
    this.connections.set(connection.id, connection);
    
    // Setup cleanup on close
    connection.on('close', () => {
      this.remove(connection.id);
    });
  }

  /**
   * Remove connection from registry
   */
  remove(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Remove from user connections
    if (connection.userId) {
      const userConns = this.userConnections.get(connection.userId);
      if (userConns) {
        userConns.delete(connectionId);
        if (userConns.size === 0) {
          this.userConnections.delete(connection.userId);
        }
      }
    }

    // Remove from client connections
    if (connection.clientId) {
      this.clientConnections.delete(connection.clientId);
    }

    // Remove from main registry
    this.connections.delete(connectionId);
  }

  /**
   * Get connection by ID
   */
  get(connectionId: string): Connection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all connections for a user
   */
  getByUser(userId: string): Connection[] {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds) return [];
    
    return Array.from(connectionIds)
      .map(id => this.connections.get(id))
      .filter((conn): conn is Connection => conn !== undefined);
  }

  /**
   * Get connection by client ID
   */
  getByClient(clientId: string): Connection | undefined {
    const connectionId = this.clientConnections.get(clientId);
    return connectionId ? this.connections.get(connectionId) : undefined;
  }

  /**
   * Link connection to user (after authentication)
   */
  linkUser(connectionId: string, userId: string) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.userId = userId;

    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);
  }

  /**
   * Link connection to client ID
   */
  linkClient(connectionId: string, clientId: string) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.clientId = clientId;
    this.clientConnections.set(clientId, connectionId);
  }

  /**
   * Get all active connections
   */
  getAll(): Connection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connection count
   */
  count(): number {
    return this.connections.size;
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      totalConnections: this.connections.size,
      totalUsers: this.userConnections.size,
      totalClients: this.clientConnections.size,
    };
  }

  /**
   * Close all connections
   */
  closeAll(code: number = 1000, reason: string = 'Server shutdown') {
    for (const connection of this.connections.values()) {
      connection.close(code, reason);
    }
    this.connections.clear();
    this.userConnections.clear();
    this.clientConnections.clear();
  }
}
