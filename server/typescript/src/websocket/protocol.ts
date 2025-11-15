/**
 * WebSocket Protocol Types
 * 
 * Implements the wire protocol deferred from Phase 4
 */

export enum MessageType {
  // Connection lifecycle
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  PING = 'ping',
  PONG = 'pong',
  
  // Authentication
  AUTH = 'auth',
  AUTH_SUCCESS = 'auth_success',
  AUTH_ERROR = 'auth_error',
  
  // Sync operations
  SYNC_REQUEST = 'sync_request',
  SYNC_RESPONSE = 'sync_response',
  DELTA = 'delta',
  ACK = 'ack',
  
  // Errors
  ERROR = 'error',
}

export interface BaseMessage {
  type: MessageType;
  id: string; // Message ID for request/response tracking
  timestamp: number;
}

export interface ConnectMessage extends BaseMessage {
  type: MessageType.CONNECT;
  clientId: string;
  version: string;
}

export interface PingMessage extends BaseMessage {
  type: MessageType.PING;
}

export interface PongMessage extends BaseMessage {
  type: MessageType.PONG;
}

export interface AuthMessage extends BaseMessage {
  type: MessageType.AUTH;
  token?: string; // JWT token
  apiKey?: string; // API key (alternative auth)
}

export interface AuthSuccessMessage extends BaseMessage {
  type: MessageType.AUTH_SUCCESS;
  userId: string;
  permissions: Record<string, any>;
}

export interface AuthErrorMessage extends BaseMessage {
  type: MessageType.AUTH_ERROR;
  error: string;
}

export interface SyncRequestMessage extends BaseMessage {
  type: MessageType.SYNC_REQUEST;
  documentId: string;
  vectorClock?: Record<string, number>;
}

export interface SyncResponseMessage extends BaseMessage {
  type: MessageType.SYNC_RESPONSE;
  requestId: string;
  documentId: string;
  state?: any; // Document state
  deltas?: any[]; // Delta updates
}

export interface DeltaMessage extends BaseMessage {
  type: MessageType.DELTA;
  documentId: string;
  delta: any;
  vectorClock: Record<string, number>;
}

export interface AckMessage extends BaseMessage {
  type: MessageType.ACK;
  messageId: string; // ID of message being acknowledged
}

export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  error: string;
  details?: any;
}

export type Message =
  | ConnectMessage
  | PingMessage
  | PongMessage
  | AuthMessage
  | AuthSuccessMessage
  | AuthErrorMessage
  | SyncRequestMessage
  | SyncResponseMessage
  | DeltaMessage
  | AckMessage
  | ErrorMessage;

/**
 * Parse raw WebSocket message
 */
export function parseMessage(raw: string): Message | null {
  try {
    const data = JSON.parse(raw);
    if (!data.type || !data.id || !data.timestamp) {
      return null;
    }
    return data as Message;
  } catch {
    return null;
  }
}

/**
 * Serialize message for transmission
 */
export function serializeMessage(message: Message): string {
  return JSON.stringify(message);
}

/**
 * Create message ID
 */
export function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
