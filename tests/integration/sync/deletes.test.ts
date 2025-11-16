/**
 * Delete Operations Test
 * 
 * Tests synchronization of delete operations
 */

import { describe, it, expect } from 'bun:test';
import {
  setupTestSuite,
  createClients,
  assertEventualConvergence,
  assertFieldNotExists,
  sleep,
} from '../setup';

describe('E2E Sync - Deletes', () => {
  setupTestSuite();

  const docId = 'delete-test-doc';

  it('should sync simple delete', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create field
    await clientA.setField(docId, 'temp', 'value');
    await clientB.waitForField(docId, 'temp', 'value');
    
    // Delete field
    await clientA.deleteField(docId, 'temp');
    
    // Both clients should not have the field
    await sleep(500);
    await assertFieldNotExists(clientA, docId, 'temp');
    await assertFieldNotExists(clientB, docId, 'temp');
  });

  it('should sync multiple deletes', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create multiple fields
    await clientA.setField(docId, 'a', 1);
    await clientA.setField(docId, 'b', 2);
    await clientA.setField(docId, 'c', 3);
    await sleep(300);
    
    // Delete some fields
    await clientA.deleteField(docId, 'a');
    await clientA.deleteField(docId, 'c');
    
    // Should converge with only 'b'
    await sleep(500);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toEqual({ b: 2 });
  });

  it('should handle delete from different client', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Client A creates
    await clientA.setField(docId, 'data', 'value');
    await clientB.waitForField(docId, 'data', 'value');
    
    // Client B deletes
    await clientB.deleteField(docId, 'data');
    
    // Client A should see deletion
    await sleep(500);
    await assertFieldNotExists(clientA, docId, 'data');
  });

  it('should handle concurrent deletes', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create field
    await clientA.setField(docId, 'concurrent', 'value');
    await sleep(300);
    
    // Both delete concurrently
    await Promise.all([
      clientA.deleteField(docId, 'concurrent'),
      clientB.deleteField(docId, 'concurrent'),
    ]);
    
    // Should converge with field deleted
    await sleep(500);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    expect(state).not.toHaveProperty('concurrent');
  });

  it('should handle delete and recreate', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create, delete, recreate
    await clientA.setField(docId, 'phoenix', 'v1');
    await clientB.waitForField(docId, 'phoenix', 'v1');
    
    await clientA.deleteField(docId, 'phoenix');
    await sleep(300);
    
    await clientA.setField(docId, 'phoenix', 'v2');
    
    // Should sync with new value
    await clientB.waitForField(docId, 'phoenix', 'v2');
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle rapid delete and recreate cycles', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Rapid cycles
    for (let i = 0; i < 5; i++) {
      await clientA.setField(docId, 'cycle', `v${i}`);
      await sleep(50);
      await clientA.deleteField(docId, 'cycle');
      await sleep(50);
    }
    
    // Final create
    await clientA.setField(docId, 'cycle', 'final');
    
    // Should sync final value
    await clientB.waitForField(docId, 'cycle', 'final');
  });

  it('should handle delete of non-existent field', async () => {
    const client = await createClients(1);
    
    await client[0].connect();
    
    // Delete field that doesn't exist (should not error)
    await client[0].deleteField(docId, 'nonexistent');
    
    const state = await client[0].getDocumentState(docId);
    expect(state).toEqual({});
  });

  it('should handle deletes across multiple clients', async () => {
    const clients = await createClients(4);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Create fields
    await clients[0].setField(docId, 'f1', 1);
    await clients[0].setField(docId, 'f2', 2);
    await clients[0].setField(docId, 'f3', 3);
    await clients[0].setField(docId, 'f4', 4);
    await sleep(500);
    
    // Different clients delete different fields
    await clients[1].deleteField(docId, 'f1');
    await clients[2].deleteField(docId, 'f3');
    
    // All clients should converge
    await sleep(500);
    const state = await assertEventualConvergence(clients, docId);
    
    expect(state).toEqual({
      f2: 2,
      f4: 4,
    });
  });

  it('should handle delete all fields', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create several fields
    await clientA.setField(docId, 'a', 1);
    await clientA.setField(docId, 'b', 2);
    await clientA.setField(docId, 'c', 3);
    await sleep(300);
    
    // Delete all
    await clientA.deleteField(docId, 'a');
    await clientA.deleteField(docId, 'b');
    await clientA.deleteField(docId, 'c');
    
    // Should result in empty document
    await sleep(500);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    expect(state).toEqual({});
  });

  it('should handle mixed operations with deletes', async () => {
    const clients = await createClients(3);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Create initial state
    await clients[0].setField(docId, 'keep', 'value');
    await clients[0].setField(docId, 'delete1', 'temp1');
    await clients[0].setField(docId, 'delete2', 'temp2');
    await sleep(300);
    
    // Mixed operations
    await Promise.all([
      clients[0].setField(docId, 'new', 'addition'),
      clients[1].deleteField(docId, 'delete1'),
      clients[2].deleteField(docId, 'delete2'),
      clients[1].setField(docId, 'keep', 'updated'),
    ]);
    
    // Should converge
    await sleep(800);
    const state = await assertEventualConvergence(clients, docId);
    
    expect(state).toHaveProperty('keep');
    expect(state).toHaveProperty('new', 'addition');
    expect(state).not.toHaveProperty('delete1');
    expect(state).not.toHaveProperty('delete2');
  });
});
