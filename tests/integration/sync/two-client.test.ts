/**
 * Two-Client Synchronization Test
 * 
 * Tests synchronization between two connected clients
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  setupTestSuite,
  createClients,
  assertConvergence,
  assertFieldSynced,
  assertSyncLatency,
  assertEventualConvergence,
  sleep,
  TEST_CONFIG,
} from '../setup';
import { generateTestId } from '../config';

describe('E2E Sync - Two Clients', () => {
  setupTestSuite();

  let docId: string;

  beforeEach(() => {
    docId = generateTestId('two-client');
  });

  it('should sync field from client A to client B', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await clientA.setField(docId, 'message', 'Hello from A');
    
    await clientB.waitForField(docId, 'message', 'Hello from A');
    
    await assertFieldSynced([clientA, clientB], docId, 'message', 'Hello from A');
  });

  it('should sync field from client B to client A', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await clientB.setField(docId, 'count', 42);
    
    await clientA.waitForField(docId, 'count', 42);
    
    await assertFieldSynced([clientA, clientB], docId, 'count', 42);
  });

  it('should sync multiple fields bidirectionally', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Client A sets fields
    await clientA.setField(docId, 'fieldA1', 'valueA1');
    await clientA.setField(docId, 'fieldA2', 'valueA2');
    
    // Client B sets fields
    await clientB.setField(docId, 'fieldB1', 'valueB1');
    await clientB.setField(docId, 'fieldB2', 'valueB2');
    
    // Wait for convergence
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toEqual({
      fieldA1: 'valueA1',
      fieldA2: 'valueA2',
      fieldB1: 'valueB1',
      fieldB2: 'valueB2',
    });
  });

  it('should sync deletions', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Client A creates field
    await clientA.setField(docId, 'temp', 'value');
    await clientB.waitForField(docId, 'temp', 'value');
    
    // Client B deletes field
    await clientB.deleteField(docId, 'temp');
    
    // Wait for convergence
    await sleep(500);
    await assertEventualConvergence([clientA, clientB], docId);
    
    // Both should not have the field
    const stateA = await clientA.getDocumentState(docId);
    const stateB = await clientB.getDocumentState(docId);
    
    expect(stateA).not.toHaveProperty('temp');
    expect(stateB).not.toHaveProperty('temp');
  });

  it('should sync rapid sequential updates', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Client A makes rapid updates
    for (let i = 0; i < 10; i++) {
      await clientA.setField(docId, 'counter', i);
    }
    
    // Client B should eventually see the last value
    await clientB.waitForField(docId, 'counter', 9);
    
    await assertFieldSynced([clientA, clientB], docId, 'counter', 9);
  });

  it('should maintain consistency after client reconnects', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Set initial state
    await clientA.setField(docId, 'persistent', 'value');
    await clientB.waitForField(docId, 'persistent', 'value');
    
    // Client B disconnects
    await clientB.disconnect();
    
    // Client A makes changes while B is offline
    await clientA.setField(docId, 'whileOffline', 'updated');
    
    // Client B reconnects
    await clientB.connect();
    
    // Should sync the changes made while offline
    await clientB.waitForField(docId, 'whileOffline', 'updated');
    
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should sync large documents', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Client A creates large document
    for (let i = 0; i < 50; i++) {
      await clientA.setField(docId, `field${i}`, `value${i}`);
    }
    
    // Wait for convergence
    await sleep(1000);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(Object.keys(state).length).toBe(50);
  });

  it('should handle alternating updates', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Alternating updates
    await clientA.setField(docId, 'turn', 1);
    await clientB.waitForField(docId, 'turn', 1);
    
    await clientB.setField(docId, 'turn', 2);
    await clientA.waitForField(docId, 'turn', 2);
    
    await clientA.setField(docId, 'turn', 3);
    await clientB.waitForField(docId, 'turn', 3);
    
    await assertFieldSynced([clientA, clientB], docId, 'turn', 3);
  });

  it('should sync within acceptable latency', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Measure sync latency
    const latency = await assertSyncLatency(
      clientA,
      clientB,
      docId,
      'latencyTest',
      'value',
      200 // Max 200ms (adjusted for ACK system + LWW + broadcasting with headroom)
    );
    
    if (TEST_CONFIG.features.verbose) {
      console.log(`Sync latency: ${latency}ms`);
    }
  });

  it('should sync updates to different fields without conflicts', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Both clients update different fields simultaneously
    await Promise.all([
      clientA.setField(docId, 'clientAField', 'A'),
      clientB.setField(docId, 'clientBField', 'B'),
    ]);
    
    // Both should converge
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toEqual({
      clientAField: 'A',
      clientBField: 'B',
    });
  });

  it('should handle one client making many changes', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Client A makes many changes
    const updates: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      updates.push(clientA.setField(docId, `batch${i}`, i));
    }
    await Promise.all(updates);
    
    // Client B should eventually see all changes
    await sleep(1000);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(Object.keys(state).length).toBe(20);
  });

  it('should sync complex nested objects', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    const complexObject = {
      user: {
        id: 123,
        profile: {
          name: 'Alice',
          settings: {
            theme: 'dark',
            notifications: true,
          },
        },
      },
      metadata: {
        created: '2025-11-17',
        tags: ['important', 'test'],
      },
    };
    
    await clientA.setField(docId, 'complex', complexObject);
    
    await clientB.waitForField(docId, 'complex', complexObject);
    
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle client starting with offline data', async () => {
    const [clientA, clientB] = await createClients(2);
    
    // Client A works offline
    await clientA.setField(docId, 'offline', 'data');
    
    // Now both connect
    await clientA.connect();
    await clientB.connect();
    
    // Client B should receive the offline data
    await clientB.waitForField(docId, 'offline', 'data');
    
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should sync boolean toggles correctly', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await clientA.setField(docId, 'enabled', true);
    await clientB.waitForField(docId, 'enabled', true);
    
    await clientB.setField(docId, 'enabled', false);
    await clientA.waitForField(docId, 'enabled', false);
    
    await clientA.setField(docId, 'enabled', true);
    await clientB.waitForField(docId, 'enabled', true);
    
    await assertFieldSynced([clientA, clientB], docId, 'enabled', true);
  });

  it('should sync null values correctly', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await clientA.setField(docId, 'nullable', 'value');
    await clientB.waitForField(docId, 'nullable', 'value');
    
    await clientA.setField(docId, 'nullable', null);
    await clientB.waitForField(docId, 'nullable', null);
    
    await assertFieldSynced([clientA, clientB], docId, 'nullable', null);
  });
});
