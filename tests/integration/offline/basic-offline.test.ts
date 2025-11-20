/**
 * Basic Offline/Online Transition Test
 * 
 * Tests client behavior during offline periods and reconnection
 */

import { describe, it, expect } from 'bun:test';
import {
  setupTestSuite,
  createClients,
  assertEventualConvergence,
  assertFieldSynced,
  sleep,
} from '../setup';
import { generateTestId } from '../config';

describe('Offline/Online - Basic Transitions', () => {
  setupTestSuite();

  // Generate unique document ID for each test to avoid pollution
  const getDocId = () => generateTestId('offline-doc');

  it('should work offline and sync on reconnect', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);

    await clientA.connect();
    await clientB.connect();

    // Initial sync
    await clientA.setField(docId, 'initial', 'value');
    await clientB.waitForField(docId, 'initial', 'value');
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Client B works offline
    await clientB.setField(docId, 'offline', 'work');
    await clientB.setField(docId, 'count', 42);
    
    // Client B reconnects
    await clientB.connect();
    
    // Changes should sync to Client A
    await clientA.waitForField(docId, 'offline', 'work');
    await clientA.waitForField(docId, 'count', 42);
    
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should receive updates made while offline', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial sync
    await clientA.setField(docId, 'sync', 'initial');
    await sleep(300);
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Client A makes changes while B is offline
    await clientA.setField(docId, 'whileOffline', 'updated');
    await clientA.setField(docId, 'another', 'field');
    
    // Client B reconnects
    await clientB.connect();
    
    // Client B should receive the updates
    await clientB.waitForField(docId, 'whileOffline', 'updated');
    await clientB.waitForField(docId, 'another', 'field');
    
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle multiple offline/online cycles', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    for (let i = 0; i < 3; i++) {
      // Go offline
      await clientB.disconnect();
      
      // Make offline changes
      await clientB.setField(docId, `offline${i}`, `value${i}`);
      
      // Reconnect
      await clientB.connect();
      
      // Wait for sync
      await clientA.waitForField(docId, `offline${i}`, `value${i}`);
    }
    
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle rapid disconnect/reconnect', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial state
    await clientA.setField(docId, 'rapid', 'initial');
    await sleep(300);
    
    // Rapid disconnect/reconnect cycles
    for (let i = 0; i < 5; i++) {
      await clientB.disconnect();
      await sleep(50);
      await clientB.connect();
      await sleep(50);
    }
    
    // Should still be in sync
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should preserve offline changes during network issues', async () => {
    const docId = getDocId();
    const client = await createClients(1);

    // Work offline from the start
    await client[0].setField(docId, 'offlineFirst', 'data');
    await client[0].setField(docId, 'count', 123);
    
    // Connect after doing offline work
    await client[0].connect();
    
    // Changes should persist
    const state = await client[0].getDocumentState(docId);
    expect(state).toEqual({
      offlineFirst: 'data',
      count: 123,
    });
  });

  it('should handle offline deletes', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);

    await clientA.connect();
    await clientB.connect();

    // Create initial data
    await clientA.setField(docId, 'toDelete', 'value');
    await clientB.waitForField(docId, 'toDelete', 'value');
    
    // Client B goes offline and deletes
    await clientB.disconnect();
    await clientB.deleteField(docId, 'toDelete');
    
    // Reconnect
    await clientB.connect();
    
    // Deletion should sync
    await sleep(500);
    const stateA = await clientA.getDocumentState(docId);
    expect(stateA).not.toHaveProperty('toDelete');
  });

  it('should handle large offline changes', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);

    await clientA.connect();
    await clientB.connect();

    await sleep(200);

    // Client B goes offline
    await clientB.disconnect();

    // Make many offline changes
    for (let i = 0; i < 20; i++) {
      await clientB.setField(docId, `field${i}`, i);
    }
    
    // Reconnect
    await clientB.connect();
    
    // All changes should sync
    await sleep(1000);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(Object.keys(state).length).toBe(20);
  });

  it('should handle offline updates to existing fields', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);

    await clientA.connect();
    await clientB.connect();

    // Create initial state
    await clientA.setField(docId, 'updateMe', 'original');
    await clientB.waitForField(docId, 'updateMe', 'original');
    
    // Client B goes offline and updates
    await clientB.disconnect();
    await clientB.setField(docId, 'updateMe', 'updated offline');
    
    // Reconnect
    await clientB.connect();
    
    // Update should sync
    await clientA.waitForField(docId, 'updateMe', 'updated offline');
  });

  it('should sync bidirectionally after offline period', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);

    await clientA.connect();
    await clientB.connect();

    await sleep(200);

    // Both clients go offline
    await clientA.disconnect();
    await clientB.disconnect();

    // Both make offline changes
    await clientA.setField(docId, 'fromA', 'valueA');
    await clientB.setField(docId, 'fromB', 'valueB');
    
    // Both reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Both should receive each other's changes
    await clientA.waitForField(docId, 'fromB', 'valueB');
    await clientB.waitForField(docId, 'fromA', 'valueA');
    
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle offline work with no initial connection', async () => {
    const docId = getDocId();
    const client = await createClients(1);

    // Work offline without ever connecting
    await client[0].setField(docId, 'neverConnected', 'true');
    await client[0].setField(docId, 'data', 'offline');
    
    const offlineState = await client[0].getDocumentState(docId);
    expect(offlineState).toEqual({
      neverConnected: 'true',
      data: 'offline',
    });
    
    // Now connect
    await client[0].connect();
    
    // Data should still be there
    const onlineState = await client[0].getDocumentState(docId);
    expect(onlineState).toEqual(offlineState);
  });

  it('should handle alternating online/offline work', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);

    await clientA.connect();

    // Online work
    await clientA.setField(docId, 'step1', 'online');
    
    // Offline work
    await clientA.disconnect();
    await clientA.setField(docId, 'step2', 'offline');
    
    // Back online
    await clientA.connect();
    await clientA.setField(docId, 'step3', 'online again');
    
    // Client B connects and should see everything
    await clientB.connect();
    await sleep(500);
    
    const state = await assertEventualConvergence([clientA, clientB], docId);
    expect(state).toEqual({
      step1: 'online',
      step2: 'offline',
      step3: 'online again',
    });
  });

  it('should preserve data across reconnections', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);

    await clientA.connect();
    await clientB.connect();

    // Set initial data
    await clientA.setField(docId, 'persistent', 'data');
    await clientB.waitForField(docId, 'persistent', 'data');
    
    // Both disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Both reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Data should still be there
    await assertFieldSynced([clientA, clientB], docId, 'persistent', 'data');
  });

  it('should handle one client staying offline', async () => {
    const docId = getDocId();
    const [clientA, clientB, clientC] = await createClients(3);

    await clientA.connect();
    await clientB.connect();
    await clientC.connect();

    // Initial sync
    await clientA.setField(docId, 'initial', 'value');
    await sleep(300);
    
    // Client C goes offline permanently
    await clientC.disconnect();
    
    // A and B continue working
    await clientA.setField(docId, 'whileC_offline', 'data');
    await clientB.waitForField(docId, 'whileC_offline', 'data');
    
    // A and B should still sync
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle graceful degradation with storage unavailable', async () => {
    const docId = getDocId();
    const client = await createClients(1);

    // Work without connecting (no storage)
    await client[0].setField(docId, 'local', 'only');
    
    // Should work fine locally
    const value = await client[0].getField(docId, 'local');
    expect(value).toBe('only');
  });

  it('should handle offline updates during server maintenance', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);

    await clientA.connect();
    await clientB.connect();

    // Both synced
    await clientA.setField(docId, 'before', 'maintenance');
    await sleep(300);
    
    // Simulate server maintenance - both disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Both work offline
    await clientA.setField(docId, 'during', 'maintenance');
    await clientB.setField(docId, 'also', 'offline');
    
    // Server back - both reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Should merge offline work
    await sleep(800);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toHaveProperty('before', 'maintenance');
    expect(state).toHaveProperty('during', 'maintenance');
    expect(state).toHaveProperty('also', 'offline');
  });
});
