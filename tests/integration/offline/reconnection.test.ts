/**
 * Reconnection Test
 * 
 * Tests reconnection logic and session recovery
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

describe('Offline/Online - Reconnection', () => {
  setupTestSuite();

  const getDocId = () => generateTestId('reconnection-doc');

  it('should automatically reconnect after disconnect', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial sync
    await clientA.setField(docId, 'before', 'disconnect');
    await sleep(300);
    
    // Disconnect client B
    await clientB.disconnect();
    
    // Verify disconnected
    expect(clientB.isConnected).toBe(false);
    
    // Reconnect
    await clientB.connect();
    
    // Verify reconnected
    expect(clientB.isConnected).toBe(true);
    
    // Should still be in sync
    await assertFieldSynced([clientA, clientB], docId, 'before', 'disconnect');
  });

  it('should recover session state after reconnection', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Establish state
    await clientA.setField(docId, 'session', 'data');
    await sleep(300);
    
    // Get state before disconnect
    const stateBefore = await clientB.getDocumentState(docId);
    
    // Disconnect and reconnect
    await clientB.disconnect();
    await sleep(500);
    await clientB.connect();
    await sleep(300);
    
    // State should be preserved
    const stateAfter = await clientB.getDocumentState(docId);
    expect(stateAfter).toEqual(stateBefore);
  });

  it('should handle multiple reconnection attempts', async () => {
    const docId = getDocId();
    const client = await createClients(1);
    
    await client[0].connect();
    
    // Set initial data
    await client[0].setField(docId, 'persistent', 'value');
    await sleep(200);
    
    // Multiple disconnect/reconnect cycles
    for (let i = 0; i < 5; i++) {
      await client[0].disconnect();
      await sleep(100);
      await client[0].connect();
      await sleep(100);
    }
    
    // Data should persist
    const value = await client[0].getField(docId, 'persistent');
    expect(value).toBe('value');
  });

  it('should queue operations during disconnection', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await sleep(200);
    
    // Disconnect client B
    await clientB.disconnect();
    
    // Queue operations while disconnected
    await clientB.setField(docId, 'queued1', 'value1');
    await clientB.setField(docId, 'queued2', 'value2');
    await clientB.setField(docId, 'queued3', 'value3');
    
    // Reconnect
    await clientB.connect();
    
    // Queued operations should sync
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toEqual({
      queued1: 'value1',
      queued2: 'value2',
      queued3: 'value3',
    });
  });

  it('should handle reconnection with pending local changes', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial sync
    await clientA.setField(docId, 'initial', 'value');
    await sleep(300);
    
    // Client B goes offline and makes changes
    await clientB.disconnect();
    await clientB.setField(docId, 'pending', 'change');
    
    // Reconnect with pending changes
    await clientB.connect();
    
    // Pending changes should sync
    await clientA.waitForField(docId, 'pending', 'change');
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle reconnection with remote changes', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await sleep(200);
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Client A makes changes while B is offline
    await clientA.setField(docId, 'remote1', 'value1');
    await clientA.setField(docId, 'remote2', 'value2');
    
    // Client B reconnects
    await clientB.connect();
    
    // Should receive remote changes
    await clientB.waitForField(docId, 'remote1', 'value1');
    await clientB.waitForField(docId, 'remote2', 'value2');
    
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle reconnection with both local and remote changes', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await sleep(200);
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Both make changes
    await clientA.setField(docId, 'fromA', 'remoteChange');
    await clientB.setField(docId, 'fromB', 'localChange');
    
    // Client B reconnects
    await clientB.connect();
    
    // Should merge both changes
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toHaveProperty('fromA', 'remoteChange');
    expect(state).toHaveProperty('fromB', 'localChange');
  });

  it('should handle rapid reconnections', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial state
    await clientA.setField(docId, 'rapid', 'test');
    await sleep(300);
    
    // Rapid disconnect/reconnect without operations
    for (let i = 0; i < 10; i++) {
      await clientB.disconnect();
      await sleep(50);
      await clientB.connect();
      await sleep(50);
    }
    
    // Should still be in sync
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle reconnection timeout', async () => {
    const docId = getDocId();
    const client = await createClients(1);
    
    await client[0].connect();
    await client[0].setField(docId, 'data', 'value');
    
    // Disconnect
    await client[0].disconnect();
    
    // Wait longer than typical timeout
    await sleep(3000);
    
    // Should still be able to reconnect
    await client[0].connect();
    
    // Data should persist
    const value = await client[0].getField(docId, 'data');
    expect(value).toBe('value');
  });

  it('should preserve vector clock across reconnections', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create causal history
    await clientA.setField(docId, 'v1', 'first');
    await sleep(200);
    await clientB.setField(docId, 'v2', 'second');
    await sleep(200);
    
    // Disconnect and reconnect B
    await clientB.disconnect();
    await sleep(500);
    await clientB.connect();
    await sleep(300);
    
    // Causality should be preserved
    const state = await assertEventualConvergence([clientA, clientB], docId);
    expect(state).toHaveProperty('v1', 'first');
    expect(state).toHaveProperty('v2', 'second');
  });

  it('should handle reconnection after server was offline', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial sync
    await clientA.setField(docId, 'before', 'serverOffline');
    await sleep(300);
    
    // Both disconnect (simulating server offline)
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Both work offline
    await clientA.setField(docId, 'offlineA', 'valueA');
    await clientB.setField(docId, 'offlineB', 'valueB');
    
    // Server comes back (both reconnect)
    await sleep(1000);
    await clientA.connect();
    await clientB.connect();
    
    // Should sync
    await sleep(800);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toHaveProperty('offlineA', 'valueA');
    expect(state).toHaveProperty('offlineB', 'valueB');
  });

  it('should handle reconnection with authentication', async () => {
    const docId = getDocId();
    const client = await createClients(1);
    
    // Connect with token
    await client[0].connect('test-token');
    await client[0].setField(docId, 'authenticated', 'data');
    
    // Disconnect
    await client[0].disconnect();
    await sleep(500);
    
    // Reconnect with same token
    await client[0].connect('test-token');
    
    // Should maintain access
    const value = await client[0].getField(docId, 'authenticated');
    expect(value).toBe('data');
  });

  it('should handle reconnection after token expiry', async () => {
    const docId = getDocId();
    const client = await createClients(1);
    
    // Connect with token
    await client[0].connect('test-token-1');
    await client[0].setField(docId, 'before', 'expiry');
    
    // Disconnect
    await client[0].disconnect();
    
    // Simulate token expiry (reconnect with new token)
    await sleep(500);
    await client[0].connect('test-token-2');
    
    // Should still work (new session)
    await client[0].setField(docId, 'after', 'expiry');
    
    const state = await client[0].getDocumentState(docId);
    expect(state).toHaveProperty('after', 'expiry');
  });

  it('should handle sequential reconnections', async () => {
    const docId = getDocId();
    const [clientA, clientB, clientC] = await createClients(3);
    
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Initial state
    await clientA.setField(docId, 'initial', 'value');
    await sleep(400);
    
    // Sequential disconnections
    await clientB.disconnect();
    await sleep(200);
    await clientC.disconnect();
    await sleep(200);
    
    // Make changes
    await clientA.setField(docId, 'change', 'fromA');
    
    // Sequential reconnections
    await sleep(300);
    await clientB.connect();
    await sleep(300);
    await clientC.connect();
    
    // All should converge
    await sleep(600);
    await assertEventualConvergence([clientA, clientB, clientC], docId);
  });

  it('should handle reconnection with large sync delta', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await sleep(200);
    
    // Client B disconnects
    await clientB.disconnect();
    
    // Client A makes many changes
    for (let i = 0; i < 50; i++) {
      await clientA.setField(docId, `field${i}`, i);
    }
    
    // Client B reconnects
    await clientB.connect();
    
    // Should sync large delta
    await sleep(1500);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(Object.keys(state).length).toBe(50);
  });

  it('should handle reconnection with conflicting operations', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Establish baseline
    await clientA.setField(docId, 'conflict', 'original');
    await sleep(300);
    
    // Both disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Both update same field
    await clientA.setField(docId, 'conflict', 'fromA');
    await clientB.setField(docId, 'conflict', 'fromB');
    
    // Both reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Should resolve via LWW
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(['fromA', 'fromB']).toContain(state.conflict);
  });

  it('should handle graceful reconnection', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Active session
    await clientA.setField(docId, 'active', 'session');
    await sleep(300);
    
    // Graceful disconnect (complete pending operations)
    await clientB.setField(docId, 'pending', 'operation');
    await sleep(200);
    await clientB.disconnect();
    
    // Reconnect
    await sleep(500);
    await clientB.connect();
    
    // Pending operation should have synced
    await assertFieldSynced([clientA, clientB], docId, 'pending', 'operation');
  });

  it('should handle reconnection storm', async () => {
    const docId = getDocId();
    const clients = await createClients(10);
    
    // All connect
    await Promise.all(clients.map(c => c.connect()));
    
    // Initial sync
    await clients[0].setField(docId, 'storm', 'test');
    await sleep(500);
    
    // All disconnect
    await Promise.all(clients.map(c => c.disconnect()));
    
    // All reconnect simultaneously (reconnection storm)
    await sleep(300);
    await Promise.all(clients.map(c => c.connect()));
    
    // Should all converge
    await sleep(1000);
    await assertEventualConvergence(clients, docId);
  });

  it('should handle reconnection with persistent storage', async () => {
    const docId = getDocId();
    const client = await createClients(1);
    
    await client[0].connect();
    
    // Create data
    await client[0].setField(docId, 'persistent', 'data');
    await client[0].setField(docId, 'count', 42);
    
    // Disconnect
    await client[0].disconnect();
    
    // Wait (simulating app restart)
    await sleep(1000);
    
    // Reconnect
    await client[0].connect();
    
    // Data should persist from storage
    const state = await client[0].getDocumentState(docId);
    expect(state).toEqual({
      persistent: 'data',
      count: 42,
    });
  });

  it('should handle partial reconnection', async () => {
    const docId = getDocId();
    const [clientA, clientB, clientC] = await createClients(3);
    
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Initial sync
    await clientA.setField(docId, 'initial', 'value');
    await sleep(400);
    
    // All disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    await clientC.disconnect();
    
    // Only A and B reconnect
    await sleep(500);
    await clientA.connect();
    await clientB.connect();
    
    // A and B should sync
    await clientA.setField(docId, 'afterReconnect', 'value');
    await sleep(400);
    
    await assertEventualConvergence([clientA, clientB], docId);
    
    // C still offline
    expect(clientC.isConnected).toBe(false);
  });

  it('should handle reconnection after network failure', async () => {
    const docId = getDocId();
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Sync some data
    await clientA.setField(docId, 'before', 'failure');
    await sleep(300);
    
    // Simulate network failure (ungraceful disconnect)
    await clientB.disconnect();
    
    // Client B tries to work offline
    await clientB.setField(docId, 'during', 'failure');
    
    // Network recovers
    await sleep(800);
    await clientB.connect();
    
    // Should sync offline work
    await clientA.waitForField(docId, 'during', 'failure');
    await assertEventualConvergence([clientA, clientB], docId);
  });
});
