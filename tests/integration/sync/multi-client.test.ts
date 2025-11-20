/**
 * Multi-Client Synchronization Test
 * 
 * Tests synchronization across 3-5 clients
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  setupTestSuite,
  createClients,
  assertConvergence,
  assertEventualConvergence,
  assertFieldSynced,
  assertSameFieldCount,
  sleep,
  TEST_CONFIG,
} from '../setup';
import { generateTestId } from '../config';

describe('E2E Sync - Multi-Client', () => {
  setupTestSuite();

  let docId: string;

  beforeEach(() => {
    docId = generateTestId('multi-client');
  });

  it('should sync across 3 clients', async () => {
    const clients = await createClients(3);
    
    // Connect all clients
    await Promise.all(clients.map(c => c.connect()));
    
    // Each client sets a field
    await clients[0].setField(docId, 'client0', 'value0');
    await clients[1].setField(docId, 'client1', 'value1');
    await clients[2].setField(docId, 'client2', 'value2');
    
    // All clients should converge
    const state = await assertEventualConvergence(clients, docId);
    
    expect(state).toEqual({
      client0: 'value0',
      client1: 'value1',
      client2: 'value2',
    });
  });

  it('should sync across 5 clients', async () => {
    const clients = await createClients(5);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Each client sets a unique field
    for (let i = 0; i < 5; i++) {
      await clients[i].setField(docId, `field${i}`, `value${i}`);
    }
    
    // Wait for convergence
    const state = await assertEventualConvergence(clients, docId);
    
    expect(Object.keys(state).length).toBe(5);
    expect(state).toEqual({
      field0: 'value0',
      field1: 'value1',
      field2: 'value2',
      field3: 'value3',
      field4: 'value4',
    });
  });

  it('should handle one client broadcasting to many', async () => {
    const clients = await createClients(4);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Client 0 makes multiple updates
    await clients[0].setField(docId, 'broadcaster', 'message1');
    await clients[0].setField(docId, 'broadcaster', 'message2');
    await clients[0].setField(docId, 'broadcaster', 'message3');
    
    // All other clients should receive the updates
    for (let i = 1; i < 4; i++) {
      await clients[i].waitForField(docId, 'broadcaster', 'message3');
    }
    
    await assertFieldSynced(clients, docId, 'broadcaster', 'message3');
  });

  it('should handle many clients updating different fields', async () => {
    const clients = await createClients(5);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // All clients update simultaneously (different fields)
    await Promise.all(
      clients.map((client, i) =>
        client.setField(docId, `concurrent${i}`, `value${i}`)
      )
    );
    
    // Should converge with all fields
    const state = await assertEventualConvergence(clients, docId);
    
    expect(Object.keys(state).length).toBe(5);
  });

  it('should maintain consistency as clients join', async () => {
    const clients = await createClients(4);
    
    // Start with 2 clients
    await clients[0].connect();
    await clients[1].connect();
    
    await clients[0].setField(docId, 'early', 'value');
    await clients[1].waitForField(docId, 'early', 'value');
    
    // Third client joins
    await clients[2].connect();
    await clients[2].waitForField(docId, 'early', 'value');
    
    // Fourth client joins
    await clients[3].connect();
    await clients[3].waitForField(docId, 'early', 'value');
    
    // All should have the same state
    await assertEventualConvergence(clients, docId);
  });

  it('should handle clients leaving', async () => {
    const clients = await createClients(4);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Set initial state
    await clients[0].setField(docId, 'persistent', 'value');
    await assertEventualConvergence(clients, docId);
    
    // Client 1 and 2 disconnect
    await clients[1].disconnect();
    await clients[2].disconnect();
    
    // Remaining clients continue to work
    await clients[0].setField(docId, 'afterLeave', 'updated');
    await clients[3].waitForField(docId, 'afterLeave', 'updated');
    
    await assertEventualConvergence([clients[0], clients[3]], docId);
  });

  it('should sync deletions across all clients', async () => {
    const clients = await createClients(3);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Create field on all clients
    await clients[0].setField(docId, 'toDelete', 'value');
    await assertEventualConvergence(clients, docId);
    
    // One client deletes
    await clients[1].deleteField(docId, 'toDelete');
    
    // All clients should see deletion
    await sleep(500);
    const state = await assertEventualConvergence(clients, docId);
    
    expect(state).not.toHaveProperty('toDelete');
  });

  it('should handle rapid updates from multiple clients', async () => {
    const clients = await createClients(3);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Each client makes rapid updates to its own field
    const updates = clients.map((client, i) =>
      Promise.all(
        Array.from({ length: 10 }, (_, j) =>
          client.setField(docId, `rapid${i}`, j)
        )
      )
    );
    
    await Promise.all(updates);
    
    // Should converge with all fields at their final values
    await sleep(1000);
    const state = await assertEventualConvergence(clients, docId);
    
    expect(state).toEqual({
      rapid0: 9,
      rapid1: 9,
      rapid2: 9,
    });
  });

  it('should handle chain updates (A→B→C)', async () => {
    const clients = await createClients(3);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Client 0 updates
    await clients[0].setField(docId, 'chain', 'step1');
    await clients[1].waitForField(docId, 'chain', 'step1');
    
    // Client 1 updates after seeing step1
    await clients[1].setField(docId, 'chain', 'step2');
    await clients[2].waitForField(docId, 'chain', 'step2');
    
    // Client 2 updates after seeing step2
    await clients[2].setField(docId, 'chain', 'step3');
    
    // All should converge to step3
    await assertFieldSynced(clients, docId, 'chain', 'step3');
  });

  it('should maintain field count consistency', async () => {
    const clients = await createClients(4);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Create 10 fields from different clients
    await clients[0].setField(docId, 'f1', 1);
    await clients[1].setField(docId, 'f2', 2);
    await clients[2].setField(docId, 'f3', 3);
    await clients[3].setField(docId, 'f4', 4);
    await clients[0].setField(docId, 'f5', 5);
    
    await sleep(500);
    await assertSameFieldCount(clients, docId);
    await assertEventualConvergence(clients, docId);
  });

  it('should handle complex multi-client scenario', async () => {
    const clients = await createClients(5);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Client 0: Creates base document
    await clients[0].setField(docId, 'title', 'Document');
    await clients[0].setField(docId, 'author', 'Alice');
    
    // Wait for propagation
    await sleep(200);
    
    // Client 1: Adds content
    await clients[1].setField(docId, 'content', 'Hello World');
    
    // Client 2: Adds metadata
    await clients[2].setField(docId, 'created', '2025-11-17');
    
    // Client 3: Adds tags
    await clients[3].setField(docId, 'tags', ['test', 'sync']);
    
    // Client 4: Updates title
    await clients[4].setField(docId, 'title', 'Updated Document');
    
    // All clients should converge
    const state = await assertEventualConvergence(clients, docId);
    
    expect(state.title).toBe('Updated Document');
    expect(state.author).toBe('Alice');
    expect(state.content).toBe('Hello World');
    expect(state.created).toBe('2025-11-17');
    expect(state.tags).toEqual(['test', 'sync']);
  });

  it('should sync large documents across many clients', async () => {
    const clients = await createClients(3);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Client 0 creates large document
    for (let i = 0; i < 30; i++) {
      await clients[0].setField(docId, `field${i}`, `value${i}`);
    }
    
    // All clients should eventually have the same state
    await sleep(1500);
    const state = await assertEventualConvergence(clients, docId);
    
    expect(Object.keys(state).length).toBe(30);
  });

  it('should handle mixed operations (set, update, delete)', async () => {
    const clients = await createClients(3);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Create initial state
    await clients[0].setField(docId, 'a', 1);
    await clients[0].setField(docId, 'b', 2);
    await clients[0].setField(docId, 'c', 3);
    
    await sleep(300);
    
    // Client 1 updates
    await clients[1].setField(docId, 'a', 10);
    
    // Client 2 deletes
    await clients[2].deleteField(docId, 'b');
    
    // Client 0 adds new
    await clients[0].setField(docId, 'd', 4);
    
    // Should converge
    const state = await assertEventualConvergence(clients, docId);
    
    expect(state).toEqual({
      a: 10,
      c: 3,
      d: 4,
    });
  });

  it('should maintain consistency with staggered connections', async () => {
    const clients = await createClients(4);
    
    // Client 0 connects and creates data
    await clients[0].connect();
    await clients[0].setField(docId, 'initial', 'data');
    
    await sleep(100);
    
    // Client 1 connects
    await clients[1].connect();
    await clients[1].waitForField(docId, 'initial', 'data');
    await clients[1].setField(docId, 'second', 'client');
    
    await sleep(100);
    
    // Client 2 connects
    await clients[2].connect();
    await clients[2].waitForField(docId, 'initial', 'data');
    await clients[2].waitForField(docId, 'second', 'client');
    
    await sleep(100);
    
    // Client 3 connects
    await clients[3].connect();
    
    // All should converge
    const state = await assertEventualConvergence(clients, docId);
    
    expect(state).toEqual({
      initial: 'data',
      second: 'client',
    });
  });
});
