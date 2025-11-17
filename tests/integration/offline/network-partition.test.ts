/**
 * Network Partition Test
 * 
 * Tests system behavior during network splits and split-brain scenarios
 */

import { describe, it, expect } from 'bun:test';
import {
  setupTestSuite,
  createClients,
  assertEventualConvergence,
  assertFieldSynced,
  sleep,
} from '../setup';

describe('Offline/Online - Network Partition', () => {
  setupTestSuite();

  const docId = 'partition-doc';

  it('should handle simple network partition and heal', async () => {
    const [clientA, clientB, clientC] = await createClients(3);
    
    // All connected initially
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Initial sync
    await clientA.setField(docId, 'initial', 'value');
    await sleep(400);
    
    // Create partition: A+B | C
    await clientC.disconnect();
    
    // Partition 1 (A+B) continues working
    await clientA.setField(docId, 'partition1', 'data');
    await clientB.waitForField(docId, 'partition1', 'data');
    
    // Partition 2 (C) works independently
    await clientC.setField(docId, 'partition2', 'isolated');
    
    // Heal partition
    await clientC.connect();
    
    // Should eventually converge
    await sleep(800);
    const state = await assertEventualConvergence([clientA, clientB, clientC], docId);
    
    expect(state).toHaveProperty('partition1', 'data');
    expect(state).toHaveProperty('partition2', 'isolated');
  });

  it('should handle three-way partition', async () => {
    const [clientA, clientB, clientC] = await createClients(3);
    
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Baseline
    await clientA.setField(docId, 'baseline', 'value');
    await sleep(400);
    
    // All disconnect (three-way split)
    await clientA.disconnect();
    await clientB.disconnect();
    await clientC.disconnect();
    
    // Each makes independent changes
    await clientA.setField(docId, 'fromA', 'isolated');
    await clientB.setField(docId, 'fromB', 'isolated');
    await clientC.setField(docId, 'fromC', 'isolated');
    
    // All reconnect (heal partition)
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Should merge all changes
    await sleep(1000);
    const state = await assertEventualConvergence([clientA, clientB, clientC], docId);
    
    expect(state).toHaveProperty('fromA', 'isolated');
    expect(state).toHaveProperty('fromB', 'isolated');
    expect(state).toHaveProperty('fromC', 'isolated');
  });

  it('should handle conflicting writes during partition', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Establish initial value
    await clientA.setField(docId, 'conflict', 'original');
    await sleep(300);
    
    // Create partition
    await clientB.disconnect();
    
    // Both update same field (LWW should resolve)
    await clientA.setField(docId, 'conflict', 'valueA');
    await sleep(100);
    await clientB.setField(docId, 'conflict', 'valueB');
    
    // Heal partition
    await clientB.connect();
    
    // Should converge to one value (LWW)
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    // One of the values should win
    expect(['valueA', 'valueB']).toContain(state.conflict);
  });

  it('should handle partition with different field updates', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await sleep(200);
    
    // Create partition
    await clientB.disconnect();
    
    // Different fields (no conflict)
    await clientA.setField(docId, 'fieldA', 'valueA');
    await clientB.setField(docId, 'fieldB', 'valueB');
    
    // Heal partition
    await clientB.connect();
    
    // Both changes should be preserved
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toEqual({
      fieldA: 'valueA',
      fieldB: 'valueB',
    });
  });

  it('should handle extended partition period', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial sync
    await clientA.setField(docId, 'synced', 'value');
    await sleep(300);
    
    // Create partition
    await clientB.disconnect();
    
    // Extended offline period with many changes
    for (let i = 0; i < 10; i++) {
      await clientA.setField(docId, `online${i}`, i);
      await clientB.setField(docId, `offline${i}`, i);
      await sleep(50);
    }
    
    // Heal partition
    await clientB.connect();
    
    // All changes should merge
    await sleep(1000);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(Object.keys(state).length).toBe(21); // 1 + 10 + 10
  });

  it('should handle partition with deletes', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create initial fields
    await clientA.setField(docId, 'field1', 'value1');
    await clientA.setField(docId, 'field2', 'value2');
    await sleep(300);
    
    // Create partition
    await clientB.disconnect();
    
    // Client A deletes, Client B updates same field
    await clientA.deleteField(docId, 'field1');
    await clientB.setField(docId, 'field1', 'updated');
    
    // Heal partition
    await clientB.connect();
    
    // LWW should determine outcome
    await sleep(600);
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle multiple partition-heal cycles', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    for (let cycle = 0; cycle < 3; cycle++) {
      // Create partition
      await clientB.disconnect();
      
      // Make divergent changes
      await clientA.setField(docId, `cycleA${cycle}`, cycle);
      await clientB.setField(docId, `cycleB${cycle}`, cycle);
      await sleep(100);
      
      // Heal partition
      await clientB.connect();
      await sleep(400);
    }
    
    // Final convergence
    const state = await assertEventualConvergence([clientA, clientB], docId);
    expect(Object.keys(state).length).toBe(6); // 3 cycles * 2 clients
  });

  it('should handle asymmetric partition (A can reach B, B cannot reach A)', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial sync
    await clientA.setField(docId, 'initial', 'value');
    await sleep(300);
    
    // Simulate asymmetric partition: B disconnects but A stays connected
    await clientB.disconnect();
    
    // A continues working (can reach server)
    await clientA.setField(docId, 'fromConnected', 'data');
    
    // B works offline
    await clientB.setField(docId, 'fromDisconnected', 'data');
    
    // B reconnects
    await clientB.connect();
    
    // Should converge
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toHaveProperty('fromConnected', 'data');
    expect(state).toHaveProperty('fromDisconnected', 'data');
  });

  it('should handle partition with rapid state changes', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await sleep(200);
    
    // Create partition
    await clientB.disconnect();
    
    // Rapid changes on both sides
    const changesA = Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        clientA.setField(docId, `rapidA${i}`, i)
      )
    );
    
    const changesB = Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        clientB.setField(docId, `rapidB${i}`, i)
      )
    );
    
    await Promise.all([changesA, changesB]);
    
    // Heal partition
    await clientB.connect();
    
    // All changes should merge
    await sleep(1200);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(Object.keys(state).length).toBe(40);
  });

  it('should handle cascading partition', async () => {
    const [clientA, clientB, clientC] = await createClients(3);
    
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Initial sync
    await clientA.setField(docId, 'initial', 'value');
    await sleep(300);
    
    // First partition: C isolates
    await clientC.disconnect();
    await clientA.setField(docId, 'phase1', 'AB');
    await clientC.setField(docId, 'phase1', 'C');
    await sleep(200);
    
    // Second partition: B isolates (A+C now partitioned from B)
    await clientB.disconnect();
    await clientA.setField(docId, 'phase2', 'A');
    await clientB.setField(docId, 'phase2', 'B');
    await sleep(200);
    
    // Heal: C rejoins
    await clientC.connect();
    await sleep(400);
    
    // Heal: B rejoins
    await clientB.connect();
    await sleep(600);
    
    // Should eventually all converge
    await assertEventualConvergence([clientA, clientB, clientC], docId);
  });

  it('should handle partition with one-way sync', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Baseline
    await clientA.setField(docId, 'baseline', 'value');
    await sleep(300);
    
    // B disconnects but keeps receiving A's changes somehow (asymmetric)
    await clientB.disconnect();
    
    // A makes changes
    await clientA.setField(docId, 'fromA', 'data');
    
    // B makes changes offline
    await clientB.setField(docId, 'fromB', 'data');
    
    // B reconnects and pushes its changes
    await clientB.connect();
    
    // Should merge
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toHaveProperty('fromA', 'data');
    expect(state).toHaveProperty('fromB', 'data');
  });

  it('should maintain causality across partition', async () => {
    const [clientA, clientB, clientC] = await createClients(3);
    
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Establish causal chain: A -> B
    await clientA.setField(docId, 'step1', 'A');
    await clientB.waitForField(docId, 'step1', 'A');
    await clientB.setField(docId, 'step2', 'B');
    await sleep(300);
    
    // Create partition before C sees step2
    await clientC.disconnect();
    
    // C makes independent change
    await clientC.setField(docId, 'step3', 'C');
    
    // Heal partition
    await clientC.connect();
    
    // All changes should be present
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB, clientC], docId);
    
    expect(state).toHaveProperty('step1', 'A');
    expect(state).toHaveProperty('step2', 'B');
    expect(state).toHaveProperty('step3', 'C');
  });

  it('should handle partition with empty document', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // No initial data, just partition
    await clientB.disconnect();
    
    // Both create data independently
    await clientA.setField(docId, 'firstA', 'valueA');
    await clientB.setField(docId, 'firstB', 'valueB');
    
    // Heal partition
    await clientB.connect();
    
    // Both initial changes should be preserved
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toEqual({
      firstA: 'valueA',
      firstB: 'valueB',
    });
  });

  it('should handle partition with complex conflict patterns', async () => {
    const [clientA, clientB, clientC] = await createClients(3);
    
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Initial state
    await clientA.setField(docId, 'shared1', 'original');
    await clientA.setField(docId, 'shared2', 'original');
    await sleep(400);
    
    // All disconnect (total partition)
    await clientA.disconnect();
    await clientB.disconnect();
    await clientC.disconnect();
    
    // Complex conflict pattern
    await clientA.setField(docId, 'shared1', 'fromA'); // Conflict on shared1
    await clientA.setField(docId, 'uniqueA', 'valueA'); // Unique to A
    
    await clientB.setField(docId, 'shared1', 'fromB'); // Conflict on shared1
    await clientB.setField(docId, 'shared2', 'fromB'); // Conflict on shared2
    await clientB.setField(docId, 'uniqueB', 'valueB'); // Unique to B
    
    await clientC.setField(docId, 'shared2', 'fromC'); // Conflict on shared2
    await clientC.setField(docId, 'uniqueC', 'valueC'); // Unique to C
    
    // All reconnect
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Should converge with LWW resolution
    await sleep(1000);
    const state = await assertEventualConvergence([clientA, clientB, clientC], docId);
    
    // Unique fields should all be present
    expect(state).toHaveProperty('uniqueA', 'valueA');
    expect(state).toHaveProperty('uniqueB', 'valueB');
    expect(state).toHaveProperty('uniqueC', 'valueC');
    
    // Conflicting fields should have one winner
    expect(['fromA', 'fromB']).toContain(state.shared1);
    expect(['fromB', 'fromC']).toContain(state.shared2);
  });

  it('should handle partition lasting longer than timeout', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial sync
    await clientA.setField(docId, 'before_timeout', 'value');
    await sleep(300);
    
    // Create partition
    await clientB.disconnect();
    
    // Both work for extended period (simulating long partition)
    await sleep(2000);
    
    await clientA.setField(docId, 'after_timeout_A', 'valueA');
    await clientB.setField(docId, 'after_timeout_B', 'valueB');
    
    // Heal partition
    await clientB.connect();
    
    // Should still converge despite timeout
    await sleep(800);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toHaveProperty('after_timeout_A', 'valueA');
    expect(state).toHaveProperty('after_timeout_B', 'valueB');
  });
});
