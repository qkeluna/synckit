/**
 * In-Memory Storage Adapter for Tests
 *
 * Provides persistent storage across server restarts using module-level state.
 * This allows testing storage/recovery functionality without requiring PostgreSQL.
 */

import type {
  StorageAdapter,
  DocumentState,
  DeltaEntry,
  SessionEntry,
  VectorClockEntry,
} from '../../../server/typescript/src/storage/interface';

// Module-level storage (persists across server restarts in same process)
const documents = new Map<string, DocumentState>();
const vectorClocks = new Map<string, Record<string, bigint>>();
const deltas: DeltaEntry[] = [];
const sessions = new Map<string, SessionEntry>();

/**
 * In-memory storage adapter for testing
 *
 * Data persists across server restarts within the same test process,
 * allowing us to test recovery scenarios without a real database.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private connected: boolean = false;

  // Connection lifecycle
  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<boolean> {
    return this.connected;
  }

  // Document operations
  async getDocument(id: string): Promise<DocumentState | null> {
    return documents.get(id) || null;
  }

  async saveDocument(id: string, state: any): Promise<DocumentState> {
    const now = new Date();
    const doc: DocumentState = {
      id,
      state,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    documents.set(id, doc);
    return doc;
  }

  async updateDocument(id: string, state: any): Promise<DocumentState> {
    const existing = documents.get(id);
    const now = new Date();

    const doc: DocumentState = {
      id,
      state,
      version: existing ? existing.version + 1 : 1,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    documents.set(id, doc);
    return doc;
  }

  async deleteDocument(id: string): Promise<boolean> {
    return documents.delete(id);
  }

  async listDocuments(limit: number = 100, offset: number = 0): Promise<DocumentState[]> {
    const allDocs = Array.from(documents.values());
    return allDocs.slice(offset, offset + limit);
  }

  // Vector clock operations
  async getVectorClock(documentId: string): Promise<Record<string, bigint>> {
    return vectorClocks.get(documentId) || {};
  }

  async updateVectorClock(documentId: string, clientId: string, clockValue: bigint): Promise<void> {
    const clock = vectorClocks.get(documentId) || {};
    clock[clientId] = clockValue;
    vectorClocks.set(documentId, clock);
  }

  async mergeVectorClock(documentId: string, clock: Record<string, bigint>): Promise<void> {
    const existing = vectorClocks.get(documentId) || {};
    const merged = { ...existing, ...clock };
    vectorClocks.set(documentId, merged);
  }

  // Delta operations
  async saveDelta(delta: Omit<DeltaEntry, 'id' | 'timestamp'>): Promise<DeltaEntry> {
    const entry: DeltaEntry = {
      ...delta,
      id: `delta-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
    };
    deltas.push(entry);
    return entry;
  }

  async getDeltas(documentId: string, limit: number = 100): Promise<DeltaEntry[]> {
    return deltas
      .filter(d => d.documentId === documentId)
      .slice(-limit);
  }

  // Session operations
  async saveSession(session: Omit<SessionEntry, 'connectedAt' | 'lastSeen'>): Promise<SessionEntry> {
    const now = new Date();
    const entry: SessionEntry = {
      ...session,
      connectedAt: now,
      lastSeen: now,
    };
    sessions.set(entry.id, entry);
    return entry;
  }

  async updateSession(sessionId: string, lastSeen: Date, metadata?: Record<string, any>): Promise<void> {
    const session = sessions.get(sessionId);
    if (session) {
      session.lastSeen = lastSeen;
      if (metadata) {
        session.metadata = { ...session.metadata, ...metadata };
      }
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return sessions.delete(sessionId);
  }

  async getSessions(userId: string): Promise<SessionEntry[]> {
    return Array.from(sessions.values())
      .filter(s => s.userId === userId);
  }

  // Maintenance
  async cleanup(options?: {
    oldSessionsHours?: number;
    oldDeltasDays?: number;
  }): Promise<{ sessionsDeleted: number; deltasDeleted: number }> {
    const now = Date.now();
    const sessionHours = options?.oldSessionsHours || 24;
    const deltaDays = options?.oldDeltasDays || 7;

    let sessionsDeleted = 0;
    let deltasDeleted = 0;

    // Clean old sessions
    for (const [id, session] of sessions) {
      const hoursSinceLastSeen = (now - session.lastSeen.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastSeen > sessionHours) {
        sessions.delete(id);
        sessionsDeleted++;
      }
    }

    // Clean old deltas
    const cutoffTime = now - (deltaDays * 24 * 60 * 60 * 1000);
    const before = deltas.length;
    deltas.splice(0, deltas.length, ...deltas.filter(d => d.timestamp.getTime() > cutoffTime));
    deltasDeleted = before - deltas.length;

    return { sessionsDeleted, deltasDeleted };
  }
}

/**
 * Clear all storage data (for test cleanup)
 */
export function clearMemoryStorage(): void {
  documents.clear();
  vectorClocks.clear();
  deltas.splice(0, deltas.length);
  sessions.clear();
}

/**
 * Get storage stats (for debugging)
 */
export function getMemoryStorageStats() {
  return {
    documents: documents.size,
    vectorClocks: vectorClocks.size,
    deltas: deltas.length,
    sessions: sessions.size,
  };
}
