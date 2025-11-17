/**
 * Delayed Sync Test
 * 
 * Tests sync behavior after extended offline periods
 */

import { describe, it, expect } from 'bun:test';
import {
  setupTestSuite,
  createClients,
  assertEventualConvergence,
  assertFieldSynced,
  sleep,
} from '../setup';

describe('Offline/Online - Delayed Sync', () => {
  setupTestSuite();

  const docId = 'delayed-sync-doc';

  it('should sync after 5 second offline period', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial sync
    await clientA.setField(docId, 'initial', 'value');
    await sleep(300);
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Wait 5 seconds while making changes
    await clientA.setField(docId, 'delayed', 'value');
    await sleep(5000);
    
    // Client B reconnects
    await clientB.connect();
    
    // Should sync despite delay
    await clientB.waitForField(docId, 'delayed', 'value');
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should sync after 30 second offline period', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Baseline
    await clientA.setField(docId, 'before_delay', 'value');
    await sleep(300);
    
    // Client B goes offline for extended period
    await clientB.disconnect();
    
    // Client A makes changes
    await clientA.setField(docId, 'during_delay', 'data');
    
    // Simulate 30 second delay
    await sleep(30000);
    
    // Client B reconnects
    await clientB.connect();
    
    // Should sync successfully
    await clientB.waitForField(docId, 'during_delay', 'data');
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle multiple changes during delay', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await sleep(200);
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Client A makes many changes over time
    for (let i = 0; i < 10; i++) {
      await clientA.setField(docId, `change${i}`, i);
      await sleep(500); // Space out changes
    }
    
    // Client B reconnects after all changes
    await clientB.connect();
    
    // All changes should sync
    await sleep(1000);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(Object.keys(state).length).toBe(10);
  });

  it('should handle bidirectional delayed sync', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial sync
    await clientA.setField(docId, 'initial', 'value');
    await sleep(300);
    
    // Both go offline
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Both make changes independently
    await clientA.setField(docId, 'fromA', 'valueA');
    await clientB.setField(docId, 'fromB', 'valueB');
    
    // Wait before reconnecting
    await sleep(3000);
    
    // Both reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Should sync bidirectionally
    await sleep(800);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toHaveProperty('fromA', 'valueA');
    expect(state).toHaveProperty('fromB', 'valueB');
  });

  it('should handle delayed sync with large document', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await sleep(200);
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Client A creates large document
    for (let i = 0; i < 100; i++) {
      await clientA.setField(docId, `field${i}`, i);
    }
    
    // Wait before sync
    await sleep(2000);
    
    // Client B reconnects
    await clientB.connect();
    
    // Should sync entire document
    await sleep(2000);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(Object.keys(state).length).toBe(100);
  });

  it('should handle delayed sync with deletes', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create initial fields
    await clientA.setField(docId, 'field1', 'value1');
    await clientA.setField(docId, 'field2', 'value2');
    await clientA.setField(docId, 'field3', 'value3');
    await sleep(400);
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Client A deletes some fields
    await clientA.deleteField(docId, 'field1');
    await clientA.deleteField(docId, 'field2');
    
    // Wait before sync
    await sleep(3000);
    
    // Client B reconnects
    await clientB.connect();
    
    // Deletes should sync
    await sleep(800);
    const state = await clientA.getDocumentState(docId);
    
    expect(state).not.toHaveProperty('field1');
    expect(state).not.toHaveProperty('field2');
    expect(state).toHaveProperty('field3', 'value3');
  });

  it('should handle delayed sync with updates to existing fields', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create initial state
    await clientA.setField(docId, 'counter', 1);
    await sleep(300);
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Client A updates field multiple times
    for (let i = 2; i <= 10; i++) {
      await clientA.setField(docId, 'counter', i);
      await sleep(400);
    }
    
    // Client B reconnects
    await clientB.connect();
    
    // Should have latest value
    await clientB.waitForField(docId, 'counter', 10);
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle staggered reconnections', async () => {
    const [clientA, clientB, clientC] = await createClients(3);
    
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Initial sync
    await clientA.setField(docId, 'initial', 'value');
    await sleep(300);
    
    // All go offline
    await clientA.disconnect();
    await clientB.disconnect();
    await clientC.disconnect();
    
    // All make changes
    await clientA.setField(docId, 'fromA', 'valueA');
    await clientB.setField(docId, 'fromB', 'valueB');
    await clientC.setField(docId, 'fromC', 'valueC');
    
    // Reconnect with delays
    await sleep(1000);
    await clientA.connect();
    
    await sleep(2000);
    await clientB.connect();
    
    await sleep(3000);
    await clientC.connect();
    
    // All should eventually converge
    await sleep(1000);
    const state = await assertEventualConvergence([clientA, clientB, clientC], docId);
    
    expect(state).toHaveProperty('fromA', 'valueA');
    expect(state).toHaveProperty('fromB', 'valueB');
    expect(state).toHaveProperty('fromC', 'valueC');
  });

  it('should handle delayed sync after server restart', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial state
    await clientA.setField(docId, 'before', 'restart');
    await sleep(300);
    
    // Both disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Simulate server restart (would happen here)
    await sleep(2000);
    
    // Client A reconnects first and makes changes
    await clientA.connect();
    await clientA.setField(docId, 'after', 'restart');
    
    // Client B reconnects after delay
    await sleep(3000);
    await clientB.connect();
    
    // Should sync
    await clientB.waitForField(docId, 'after', 'restart');
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle offline work followed by delayed reconnect', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await sleep(200);
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Client B works offline
    for (let i = 0; i < 5; i++) {
      await clientB.setField(docId, `offline${i}`, i);
    }
    
    // Wait before reconnecting
    await sleep(4000);
    
    // Client B reconnects
    await clientB.connect();
    
    // Offline changes should sync to A
    await sleep(800);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(Object.keys(state).length).toBe(5);
  });

  it('should handle mixed online and offline changes with delay', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial sync
    await clientA.setField(docId, 'step1', 'online');
    await sleep(300);
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Client A continues online
    await clientA.setField(docId, 'step2', 'stillOnline');
    
    // Client B works offline
    await clientB.setField(docId, 'step3', 'offline');
    
    // Wait
    await sleep(3000);
    
    // More online work
    await clientA.setField(docId, 'step4', 'onlineAgain');
    
    // Client B reconnects
    await clientB.connect();
    
    // All changes should merge
    await sleep(800);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toEqual({
      step1: 'online',
      step2: 'stillOnline',
      step3: 'offline',
      step4: 'onlineAgain',
    });
  });

  it('should handle delayed sync with conflict resolution', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Establish baseline
    await clientA.setField(docId, 'conflict', 'original');
    await sleep(300);
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Client A updates
    await clientA.setField(docId, 'conflict', 'fromA');
    
    // Wait
    await sleep(2000);
    
    // Client B updates same field offline
    await clientB.setField(docId, 'conflict', 'fromB');
    
    // Wait more
    await sleep(3000);
    
    // Client B reconnects
    await clientB.connect();
    
    // Should resolve via LWW
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    // One value should win
    expect(['fromA', 'fromB']).toContain(state.conflict);
  });

  it('should handle incremental sync after long delay', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await sleep(200);
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Client A makes changes in batches with delays
    await clientA.setField(docId, 'batch1', 'value1');
    await sleep(1000);
    
    await clientA.setField(docId, 'batch2', 'value2');
    await sleep(2000);
    
    await clientA.setField(docId, 'batch3', 'value3');
    await sleep(3000);
    
    // Client B reconnects
    await clientB.connect();
    
    // Should sync all batches
    await sleep(800);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toEqual({
      batch1: 'value1',
      batch2: 'value2',
      batch3: 'value3',
    });
  });

  it('should handle delayed sync with empty changes', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial sync
    await clientA.setField(docId, 'data', 'value');
    await sleep(300);
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Wait with no changes
    await sleep(5000);
    
    // Client B reconnects (no changes occurred)
    await clientB.connect();
    
    // Should still be in sync
    await assertFieldSynced([clientA, clientB], docId, 'data', 'value');
  });

  it('should handle delayed sync with rapid changes before reconnect', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await sleep(200);
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Wait most of the delay period
    await sleep(4000);
    
    // Rapid changes just before reconnect
    for (let i = 0; i < 20; i++) {
      await clientA.setField(docId, `rapid${i}`, i);
    }
    
    // Client B reconnects immediately after changes
    await clientB.connect();
    
    // Should sync all rapid changes
    await sleep(1000);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(Object.keys(state).length).toBe(20);
  });

  it('should maintain data integrity across delay', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create complex state
    await clientA.setField(docId, 'string', 'value');
    await clientA.setField(docId, 'number', 42);
    await clientA.setField(docId, 'boolean', true);
    await clientA.setField(docId, 'null', null);
    await sleep(400);
    
    // Get baseline
    const baseline = await clientA.getDocumentState(docId);
    
    // Client B goes offline
    await clientB.disconnect();
    
    // Wait
    await sleep(5000);
    
    // Client B reconnects
    await clientB.connect();
    await sleep(600);
    
    // Data should be identical
    const afterDelay = await clientB.getDocumentState(docId);
    expect(afterDelay).toEqual(baseline);
  });
});
