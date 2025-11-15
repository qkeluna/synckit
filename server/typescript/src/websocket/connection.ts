import type { WebSocket } from 'ws';
import { 
  Message, 
  MessageType, 
  PongMessage,
  serializeMessage, 
  parseMessage, 
  createMessageId 
} from './protocol';

/**
 * Connection state enum
 */
export enum ConnectionState {
  CONNECTING = 'connecting',
  AUTHENTICATING = 'authenticating',
  AUTHENTICATED = 'authenticated',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
}

/**
 * Connection class - manages individual WebSocket connection
 * 
 * Implements:
 * - Connection lifecycle management
 * - Heartbeat (ping/pong)
 * - Message routing
 * - State tracking
 */
export class Connection {
  public readonly id: string;
  public state: ConnectionState;
  public userId?: string;
  public clientId?: string;
  
  private ws: WebSocket;
  private heartbeatInterval?: Timer;
  private lastPingTime?: number;
  private isAlive: boolean = true;

  constructor(ws: WebSocket, connectionId: string) {
    this.id = connectionId;
    this.ws = ws;
    this.state = ConnectionState.CONNECTING;
    
    this.setupHandlers();
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupHandlers() {
    this.ws.on('message', this.handleMessage.bind(this));
    this.ws.on('close', this.handleClose.bind(this));
    this.ws.on('error', this.handleError.bind(this));
    this.ws.on('pong', this.handlePong.bind(this));
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: Buffer | string) {
    try {
      const raw = data.toString();
      const message = parseMessage(raw);
      
      if (!message) {
        this.sendError('Invalid message format');
        return;
      }

      // Emit event for message handlers
      this.emit('message', message);
      
      // Handle ping internally
      if (message.type === MessageType.PING) {
        this.sendPong(message.id);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.sendError('Internal server error');
    }
  }

  /**
   * Handle connection close
   */
  private handleClose() {
    this.state = ConnectionState.DISCONNECTED;
    this.stopHeartbeat();
    this.emit('close');
  }

  /**
   * Handle connection error
   */
  private handleError(error: Error) {
    console.error(`Connection ${this.id} error:`, error);
    this.emit('error', error);
  }

  /**
   * Handle pong response
   */
  private handlePong() {
    this.isAlive = true;
  }

  /**
   * Send message to client
   */
  send(message: Message): boolean {
    if (this.ws.readyState !== 1) { // 1 = OPEN
      return false;
    }

    try {
      this.ws.send(serializeMessage(message));
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }

  /**
   * Send pong response
   */
  private sendPong(pingId: string) {
    const pong: PongMessage = {
      type: MessageType.PONG,
      id: createMessageId(),
      timestamp: Date.now(),
    };
    this.send(pong);
  }

  /**
   * Send error message
   */
  sendError(error: string, details?: any) {
    this.send({
      type: MessageType.ERROR,
      id: createMessageId(),
      timestamp: Date.now(),
      error,
      details,
    });
  }

  /**
   * Start heartbeat monitoring
   */
  startHeartbeat(intervalMs: number = 30000) {
    this.heartbeatInterval = setInterval(() => {
      if (!this.isAlive) {
        console.log(`Connection ${this.id} heartbeat timeout - terminating`);
        return this.terminate();
      }

      this.isAlive = false;
      this.ws.ping();
    }, intervalMs);
  }

  /**
   * Stop heartbeat monitoring
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  /**
   * Graceful close
   */
  close(code: number = 1000, reason: string = 'Normal closure') {
    this.state = ConnectionState.DISCONNECTING;
    this.stopHeartbeat();
    this.ws.close(code, reason);
  }

  /**
   * Force terminate connection
   */
  terminate() {
    this.stopHeartbeat();
    this.ws.terminate();
  }

  // Simple event emitter for connection events
  private handlers: Map<string, Function[]> = new Map();

  on(event: string, handler: Function) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  private emit(event: string, ...args: any[]) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(...args));
    }
  }
}
