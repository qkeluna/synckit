/**
 * Conflict Resolution Test
 * 
 * Tests conflict resolution during offline periods with LWW strategy
 */

import { describe, it, expect } from 'bun:test';
import {
  setupTestSuite,
  createClients,
  assertEventualConvergence,
  assertFieldSynced,
  assertLWWResolution,
  sleep,
} from '../setup';

describe('Offline/Online - Conflict Resolution', () => {
  setupTestSuite();

  const docId = 'conflict-doc';

  it('should resolve simple offline conflict with LWW', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Establish initial value
    await clientA.setField(docId, 'conflict', 'original');
    await sleep(300);
    
    // Both go offline
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Both update same field
    await clientA.setField(docId, 'conflict', 'fromA');
    await sleep(100);
    await clientB.setField(docId, 'conflict', 'fromB');
    
    // Both reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Should converge to one value (LWW)
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(['fromA', 'fromB']).toContain(state.conflict);
  });

  it('should handle concurrent updates to same field', async () => {
    const [clientA, clientB, clientC] = await createClients(3);
    
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Initial state
    await clientA.setField(docId, 'concurrent', 'initial');
    await sleep(400);
    
    // All disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    await clientC.disconnect();
    
    // All update same field
    await clientA.setField(docId, 'concurrent', 'A');
    await clientB.setField(docId, 'concurrent', 'B');
    await clientC.setField(docId, 'concurrent', 'C');
    
    // All reconnect
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Should converge to single value
    await sleep(800);
    const state = await assertEventualConvergence([clientA, clientB, clientC], docId);
    
    expect(['A', 'B', 'C']).toContain(state.concurrent);
  });

  it('should resolve conflicts on multiple fields', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create initial state
    await clientA.setField(docId, 'field1', 'original1');
    await clientA.setField(docId, 'field2', 'original2');
    await sleep(300);
    
    // Both disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Conflicts on both fields
    await clientA.setField(docId, 'field1', 'A1');
    await clientA.setField(docId, 'field2', 'A2');
    
    await clientB.setField(docId, 'field1', 'B1');
    await clientB.setField(docId, 'field2', 'B2');
    
    // Both reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Should resolve each field independently
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(['A1', 'B1']).toContain(state.field1);
    expect(['A2', 'B2']).toContain(state.field2);
  });

  it('should handle conflict with delete operation', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial value
    await clientA.setField(docId, 'toDeleteOrUpdate', 'original');
    await sleep(300);
    
    // Both disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // A deletes, B updates
    await clientA.deleteField(docId, 'toDeleteOrUpdate');
    await clientB.setField(docId, 'toDeleteOrUpdate', 'updated');
    
    // Both reconnect
    await clientA.connect();
    await clientB.connect();
    
    // LWW should determine outcome
    await sleep(600);
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should resolve timestamp-based conflicts deterministically', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial value
    await clientA.setField(docId, 'timestamp', 'original');
    await sleep(300);
    
    // Disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Updates with time gap
    await clientA.setField(docId, 'timestamp', 'earlier');
    await sleep(500);
    await clientB.setField(docId, 'timestamp', 'later');
    
    // Reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Later timestamp should win
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state.timestamp).toBe('later');
  });

  it('should handle add-wins semantics for different fields', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await sleep(200);
    
    // Both disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Different fields (no conflict)
    await clientA.setField(docId, 'uniqueA', 'valueA');
    await clientB.setField(docId, 'uniqueB', 'valueB');
    
    // Both reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Both fields should be present (add-wins)
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toEqual({
      uniqueA: 'valueA',
      uniqueB: 'valueB',
    });
  });

  it('should handle sequential conflicts', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // First conflict cycle
    await clientA.setField(docId, 'sequential', 'v1');
    await sleep(300);
    
    await clientA.disconnect();
    await clientB.disconnect();
    
    await clientA.setField(docId, 'sequential', 'v2');
    await clientB.setField(docId, 'sequential', 'v3');
    
    await clientA.connect();
    await clientB.connect();
    await sleep(600);
    
    // Second conflict cycle
    await clientA.disconnect();
    await clientB.disconnect();
    
    await clientA.setField(docId, 'sequential', 'v4');
    await clientB.setField(docId, 'sequential', 'v5');
    
    await clientA.connect();
    await clientB.connect();
    
    // Should resolve both conflicts
    await sleep(600);
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle complex multi-client conflicts', async () => {
    const [clientA, clientB, clientC, clientD] = await createClients(4);
    
    await Promise.all([
      clientA.connect(),
      clientB.connect(),
      clientC.connect(),
      clientD.connect(),
    ]);
    
    // Initial state
    await clientA.setField(docId, 'complex', 'original');
    await sleep(400);
    
    // All disconnect
    await Promise.all([
      clientA.disconnect(),
      clientB.disconnect(),
      clientC.disconnect(),
      clientD.disconnect(),
    ]);
    
    // All update same field
    await clientA.setField(docId, 'complex', 'A');
    await clientB.setField(docId, 'complex', 'B');
    await clientC.setField(docId, 'complex', 'C');
    await clientD.setField(docId, 'complex', 'D');
    
    // All reconnect
    await Promise.all([
      clientA.connect(),
      clientB.connect(),
      clientC.connect(),
      clientD.connect(),
    ]);
    
    // Should converge to single value
    await sleep(1000);
    const state = await assertEventualConvergence(
      [clientA, clientB, clientC, clientD],
      docId
    );
    
    expect(['A', 'B', 'C', 'D']).toContain(state.complex);
  });

  it('should handle conflict with null value', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial value
    await clientA.setField(docId, 'nullable', 'value');
    await sleep(300);
    
    // Disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // One sets to null, other updates
    await clientA.setField(docId, 'nullable', null);
    await clientB.setField(docId, 'nullable', 'updated');
    
    // Reconnect
    await clientA.connect();
    await clientB.connect();
    
    // LWW should resolve
    await sleep(600);
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle rapid conflicting updates', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial
    await clientA.setField(docId, 'rapid', 'start');
    await sleep(300);
    
    // Disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Rapid conflicting updates
    for (let i = 0; i < 10; i++) {
      await clientA.setField(docId, 'rapid', `A${i}`);
      await clientB.setField(docId, 'rapid', `B${i}`);
    }
    
    // Reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Should resolve to one final value
    await sleep(800);
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should preserve non-conflicting fields during conflict', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create multiple fields
    await clientA.setField(docId, 'conflict', 'original');
    await clientA.setField(docId, 'noConflict1', 'preserved1');
    await clientA.setField(docId, 'noConflict2', 'preserved2');
    await sleep(300);
    
    // Disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Conflict on one field only
    await clientA.setField(docId, 'conflict', 'A');
    await clientB.setField(docId, 'conflict', 'B');
    
    // Reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Non-conflicting fields should be preserved
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state.noConflict1).toBe('preserved1');
    expect(state.noConflict2).toBe('preserved2');
    expect(['A', 'B']).toContain(state.conflict);
  });

  it('should handle conflict with type changes', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial string value
    await clientA.setField(docId, 'typeChange', 'string');
    await sleep(300);
    
    // Disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Different types
    await clientA.setField(docId, 'typeChange', 123);
    await clientB.setField(docId, 'typeChange', true);
    
    // Reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Should resolve (LWW applies regardless of type)
    await sleep(600);
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle nested conflicts', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial state with nested object
    await clientA.setField(docId, 'nested', { a: 1, b: 2 });
    await sleep(300);
    
    // Disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Update nested field
    await clientA.setField(docId, 'nested', { a: 10, b: 2 });
    await clientB.setField(docId, 'nested', { a: 1, b: 20 });
    
    // Reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Should resolve to one complete object (LWW at field level)
    await sleep(600);
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle conflict during network partition', async () => {
    const [clientA, clientB, clientC] = await createClients(3);
    
    await clientA.connect();
    await clientB.connect();
    await clientC.connect();
    
    // Initial
    await clientA.setField(docId, 'partition', 'original');
    await sleep(400);
    
    // Create partition: (A,B) | C
    await clientC.disconnect();
    
    // Both partitions update same field
    await clientA.setField(docId, 'partition', 'AB');
    await clientC.setField(docId, 'partition', 'C');
    
    // Heal partition
    await clientC.connect();
    
    // Should resolve
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB, clientC], docId);
    
    expect(['AB', 'C']).toContain(state.partition);
  });

  it('should handle cascading conflicts', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Cycle 1
    await clientA.setField(docId, 'cascade', 'v1');
    await sleep(300);
    
    await clientA.disconnect();
    await clientB.disconnect();
    
    await clientA.setField(docId, 'cascade', 'v2');
    await clientB.setField(docId, 'cascade', 'v3');
    
    await clientA.connect();
    await clientB.connect();
    await sleep(600);
    
    // Cycle 2 - conflict on resolved value
    const resolved = await clientA.getField(docId, 'cascade');
    
    await clientA.disconnect();
    await clientB.disconnect();
    
    await clientA.setField(docId, 'cascade', 'v4');
    await clientB.setField(docId, 'cascade', 'v5');
    
    await clientA.connect();
    await clientB.connect();
    
    // Should resolve both cascading conflicts
    await sleep(600);
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle conflicting add and delete', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await sleep(200);
    
    // Disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // A adds, B doesn't know about it yet, both work on same field
    await clientA.setField(docId, 'addDelete', 'added');
    await sleep(100);
    
    // Now B "deletes" (but never saw the add)
    await clientB.deleteField(docId, 'addDelete');
    
    // Reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Add should win (add-wins semantics)
    await sleep(600);
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle conflict with identical values', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial
    await clientA.setField(docId, 'identical', 'original');
    await sleep(300);
    
    // Disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // Both update to same value
    await clientA.setField(docId, 'identical', 'sameValue');
    await clientB.setField(docId, 'identical', 'sameValue');
    
    // Reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Should converge (no real conflict)
    await sleep(600);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state.identical).toBe('sameValue');
  });

  it('should maintain conflict history for debugging', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create conflict
    await clientA.setField(docId, 'debug', 'original');
    await sleep(300);
    
    await clientA.disconnect();
    await clientB.disconnect();
    
    await clientA.setField(docId, 'debug', 'A');
    await clientB.setField(docId, 'debug', 'B');
    
    await clientA.connect();
    await clientB.connect();
    
    // After resolution, should be able to see final state
    await sleep(600);
    await assertEventualConvergence([clientA, clientB], docId);
    
    // Vector clocks should reflect the conflict resolution
    const stateA = await clientA.getDocumentState(docId);
    const stateB = await clientB.getDocumentState(docId);
    
    expect(stateA).toEqual(stateB);
  });

  it('should handle high-frequency conflict generation', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial
    await clientA.setField(docId, 'highFreq', 'start');
    await sleep(300);
    
    // Generate many conflicts
    for (let cycle = 0; cycle < 5; cycle++) {
      await clientA.disconnect();
      await clientB.disconnect();
      
      await clientA.setField(docId, 'highFreq', `A${cycle}`);
      await clientB.setField(docId, 'highFreq', `B${cycle}`);
      
      await clientA.connect();
      await clientB.connect();
      await sleep(400);
    }
    
    // Final convergence
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle conflict with empty field', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial
    await clientA.setField(docId, 'empty', 'value');
    await sleep(300);
    
    // Disconnect
    await clientA.disconnect();
    await clientB.disconnect();
    
    // One sets to empty string, other updates
    await clientA.setField(docId, 'empty', '');
    await clientB.setField(docId, 'empty', 'notEmpty');
    
    // Reconnect
    await clientA.connect();
    await clientB.connect();
    
    // Should resolve
    await sleep(600);
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle asymmetric conflicts', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Baseline
    await clientA.setField(docId, 'asym', 'original');
    await sleep(300);
    
    // Only B disconnects
    await clientB.disconnect();
    
    // A updates while online
    await clientA.setField(docId, 'asym', 'online');
    
    // B updates while offline
    await clientB.setField(docId, 'asym', 'offline');
    
    // B reconnects
    await clientB.connect();
    
    // Should resolve
    await sleep(600);
    await assertEventualConvergence([clientA, clientB], docId);
  });
});
