/**
 * Server Restart Test
 * 
 * Tests client behavior and data integrity during server restarts
 */

import { describe, it, expect } from 'bun:test';
import {
  setupTestSuite,
  createClients,
  assertEventualConvergence,
  assertFieldSynced,
  sleep,
  restartTestServer,
} from '../setup';
import { generateTestId } from '../config';

describe('Offline/Online - Server Restart', () => {
  setupTestSuite();

  // Generate unique document ID for each test to avoid pollution
  const getDocId = () => generateTestId('restart-doc');

  it('should preserve data after server restart', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Set initial data
    await clientA.setField(docId, 'before', 'restart');
    await clientB.waitForField(docId, 'before', 'restart');
    
    // Restart server
    await restartTestServer();
    
    // Clients should reconnect
    await sleep(1000);
    await clientA.connect();
    await clientB.connect();
    
    // Data should persist
    await assertFieldSynced([clientA, clientB], docId, 'before', 'restart');
  });

  it('should handle restart with pending changes', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial sync
    await clientA.setField(docId, 'initial', 'value');
    await sleep(300);
    
    // Client A makes changes just before restart
    await clientA.setField(docId, 'pending', 'change');
    
    // Immediate restart (before sync completes)
    await restartTestServer();
    await sleep(500);
    
    // Reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Change should eventually sync
    await clientB.waitForField(docId, 'pending', 'change');
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle restart during active sync', async () => {
    const docId = getDocId();
    const [clientA, clientB, clientC] = await createClients(3);
    
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Create baseline
    await clientA.setField(docId, 'baseline', 'data');
    await sleep(400);
    
    // Multiple clients making changes
    const changes = Promise.all([
      clientA.setField(docId, 'fromA', 'valueA'),
      clientB.setField(docId, 'fromB', 'valueB'),
      clientC.setField(docId, 'fromC', 'valueC'),
    ]);
    
    // Restart during sync
    await sleep(100);
    await restartTestServer();
    
    await changes;
    await sleep(500);
    
    // Reconnect all
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // All changes should converge
    await sleep(800);
    const state = await assertEventualConvergence([clientA, clientB, clientC], docId);
    
    expect(state).toHaveProperty('fromA', 'valueA');
    expect(state).toHaveProperty('fromB', 'valueB');
    expect(state).toHaveProperty('fromC', 'valueC');
  });

  it('should handle multiple consecutive restarts', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);

    await clientA.connect();
    await clientB.connect();

    // Initial subscription for both clients
    await clientA.getDocumentState(docId);
    await clientB.getDocumentState(docId);

    for (let i = 0; i < 3; i++) {
      // Make change - need enough time for persistence
      await clientA.setField(docId, `restart${i}`, `value${i}`);
      await sleep(500); // Increased for reliable persistence

      // Restart
      await restartTestServer();
      await sleep(500);

      // Reconnect
      await clientA.connect();
      await clientB.connect();

      // Explicitly request document state to trigger resync
      await clientA.getDocumentState(docId);
      await clientB.getDocumentState(docId);

      // Allow time for sync
      await sleep(500);

      // Wait for sync
      await clientB.waitForField(docId, `restart${i}`, `value${i}`);
    }

    await assertEventualConvergence([clientA, clientB], docId);
  }, { timeout: 60000 }); // 3 iterations with restarts + sync time

  it('should handle restart with clients offline', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial sync
    await clientA.setField(docId, 'synced', 'data');
    await sleep(300);
    
    // Both disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Restart server while clients offline
    await restartTestServer();
    await sleep(500);
    
    // Clients reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Data should still be available
    await assertFieldSynced([clientA, clientB], docId, 'synced', 'data');
  });

  it('should handle restart with mixed offline/online clients', async () => {
    const docId = getDocId();
    const [clientA, clientB, clientC] = await createClients(3);
    
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Initial state
    await clientA.setField(docId, 'initial', 'state');
    await sleep(300);
    
    // Client C goes offline
    await clientC.disconnect();
    
    // A and B continue working
    await clientA.setField(docId, 'while_C_offline', 'value');
    
    // Restart server
    await restartTestServer();
    await sleep(500);
    
    // A and B reconnect
    await clientA.connect();
    await clientB.connect();

    // Explicitly request document state to trigger resync and subscription
    await clientA.getDocumentState(docId);
    await clientB.getDocumentState(docId);

    // Allow time for A and B to fully subscribe with server
    await sleep(800);

    // C still offline, makes changes
    await clientC.setField(docId, 'from_C', 'offline_value');

    // C reconnects - this flushes offline queue immediately after auth
    await clientC.connect();

    // Small delay to let queue flush complete before getDocumentState
    await sleep(300);

    // C gets document state to subscribe
    await clientC.getDocumentState(docId);

    // Allow time for full sync propagation
    await sleep(1500);

    // All clients should converge
    await clientA.waitForField(docId, 'from_C', 'offline_value');
    await assertEventualConvergence([clientA, clientB, clientC], docId);
  }, { timeout: 35000 }); // sleeps + restart + buffer

  it('should preserve vector clocks after restart', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create some history
    await clientA.setField(docId, 'v1', 'first');
    await sleep(200);
    await clientB.setField(docId, 'v2', 'second');
    await sleep(200);
    await clientA.setField(docId, 'v3', 'third');
    await sleep(300);
    
    // Get state before restart
    const stateBefore = await clientA.getDocumentState(docId);
    
    // Restart
    await restartTestServer();
    await sleep(500);
    
    // Reconnect
    await clientA.connect();
    await clientB.connect();
    await sleep(400);
    
    // State should match
    const stateAfter = await clientA.getDocumentState(docId);
    expect(stateAfter).toEqual(stateBefore);
  });

  it('should handle rapid restarts', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial data
    await clientA.setField(docId, 'rapid', 'test');
    await sleep(300);
    
    // Multiple rapid restarts
    for (let i = 0; i < 3; i++) {
      await restartTestServer();
      await sleep(200);
      await clientA.connect();
      await clientB.connect();
      await sleep(100);
    }
    
    // Should still be synced
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle restart with large document', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create large document
    for (let i = 0; i < 50; i++) {
      await clientA.setField(docId, `field${i}`, i);
    }
    
    await sleep(800);
    
    // Restart
    await restartTestServer();
    await sleep(500);
    
    // Reconnect
    await clientA.connect();
    await clientB.connect();
    await sleep(600);
    
    // All data should persist
    const state = await assertEventualConvergence([clientA, clientB], docId);
    expect(Object.keys(state).length).toBe(50);
  });

  it('should handle restart with delete operations', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create and sync
    await clientA.setField(docId, 'toDelete', 'value');
    await clientA.setField(docId, 'toKeep', 'value');
    await sleep(300);
    
    // Delete
    await clientA.deleteField(docId, 'toDelete');
    await sleep(200);
    
    // Restart
    await restartTestServer();
    await sleep(500);
    
    // Reconnect
    await clientA.connect();
    await clientB.connect();
    await sleep(400);
    
    // Deletion should persist
    const state = await clientA.getDocumentState(docId);
    expect(state).not.toHaveProperty('toDelete');
    expect(state).toHaveProperty('toKeep', 'value');
  });

  it('should handle graceful shutdown and restart', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Active sync session
    await clientA.setField(docId, 'before_shutdown', 'data');
    await sleep(300);
    
    // Graceful restart (allows current operations to complete)
    await restartTestServer({ graceful: true });
    await sleep(800);
    
    // Reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Data should be intact
    await assertFieldSynced([clientA, clientB], docId, 'before_shutdown', 'data');
  });

  it('should handle restart with authentication', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    // Connect with auth
    await clientA.connect('test-token-a');
    await clientB.connect('test-token-b');
    
    // Sync data
    await clientA.setField(docId, 'authenticated', 'data');
    await sleep(300);
    
    // Restart
    await restartTestServer();
    await sleep(500);
    
    // Reconnect with same tokens
    await clientA.connect('test-token-a');
    await clientB.connect('test-token-b');
    
    // Should have access to same data
    await assertFieldSynced([clientA, clientB], docId, 'authenticated', 'data');
  });

  it('should recover from crash restart', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Establish baseline
    await clientA.setField(docId, 'before_crash', 'value');
    await sleep(300);
    
    // Simulate crash restart (immediate, no graceful shutdown)
    await restartTestServer({ graceful: false });
    await sleep(400);
    
    // Clients detect disconnect and attempt reconnect
    await sleep(200);
    await clientA.connect();
    await clientB.connect();
    
    // Data should recover from persistent storage
    await assertFieldSynced([clientA, clientB], docId, 'before_crash', 'value');
  });

  it('should handle restart with pending offline queue', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Baseline sync
    await clientA.setField(docId, 'synced', 'data');
    await sleep(300);
    
    // Client A goes offline and makes changes
    await clientA.disconnect();
    await clientA.setField(docId, 'offline', 'changes');
    
    // Server restarts while A is offline
    await restartTestServer();
    await sleep(500);
    
    // B reconnects
    await clientB.connect();
    
    // A reconnects (with pending offline changes)
    await clientA.connect();
    
    // Offline changes should sync
    await clientB.waitForField(docId, 'offline', 'changes');
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should maintain consistency across restart', async () => {
    const docId = getDocId();
    const [clientA, clientB, clientC] = await createClients(3);
    
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Create consistent state
    await clientA.setField(docId, 'consistency', 'test');
    await sleep(400);
    
    // Verify all synced before restart
    const stateBefore = await assertEventualConvergence([clientA, clientB, clientC], docId);
    
    // Restart
    await restartTestServer();
    await sleep(500);
    
    // Reconnect
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    await sleep(400);
    
    // Verify consistency maintained
    const stateAfter = await assertEventualConvergence([clientA, clientB, clientC], docId);
    expect(stateAfter).toEqual(stateBefore);
  });
});
