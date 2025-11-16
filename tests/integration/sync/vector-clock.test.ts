/**
 * Vector Clock Test
 * 
 * Tests vector clock advancement and causality tracking
 */

import { describe, it, expect } from 'bun:test';
import {
  setupTestSuite,
  createClients,
  assertEventualConvergence,
  sleep,
} from '../setup';

describe('E2E Sync - Vector Clock', () => {
  setupTestSuite();

  const docId = 'vector-clock-doc';

  it('should advance clock on local updates', async () => {
    const client = await createClients(1);
    
    await client[0].connect();
    
    // Make updates (clock should advance)
    await client[0].setField(docId, 'a', 1);
    await client[0].setField(docId, 'b', 2);
    await client[0].setField(docId, 'c', 3);
    
    // Clock should have advanced (we can't directly test the clock value,
    // but we can verify updates happened)
    const state = await client[0].getDocumentState(docId);
    expect(Object.keys(state).length).toBe(3);
  });

  it('should track causality between clients', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Sequential updates with clear causality
    await clientA.setField(docId, 'step', 1);
    await clientB.waitForField(docId, 'step', 1);
    
    await clientB.setField(docId, 'step', 2);
    await clientA.waitForField(docId, 'step', 2);
    
    await clientA.setField(docId, 'step', 3);
    await clientB.waitForField(docId, 'step', 3);
    
    // Final value should respect causality
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle concurrent updates from different clients', async () => {
    const [clientA, clientB, clientC] = await createClients(3);
    
    await Promise.all([clientA, clientB, clientC].map(c => c.connect()));
    
    // Each client updates its own field
    await Promise.all([
      clientA.setField(docId, 'a', 'A'),
      clientB.setField(docId, 'b', 'B'),
      clientC.setField(docId, 'c', 'C'),
    ]);
    
    // All clients should see all updates
    await sleep(500);
    const state = await assertEventualConvergence([clientA, clientB, clientC], docId);
    
    expect(state).toEqual({
      a: 'A',
      b: 'B',
      c: 'C',
    });
  });

  it('should maintain happens-before relationship', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Clear happens-before: A → B → A
    await clientA.setField(docId, 'message', 'from A');
    await clientB.waitForField(docId, 'message', 'from A');
    
    await clientB.setField(docId, 'message', 'from B');
    await clientA.waitForField(docId, 'message', 'from B');
    
    await clientA.setField(docId, 'message', 'back to A');
    
    // Should respect causality
    await assertEventualConvergence([clientA, clientB], docId);
    
    const finalValue = await clientA.getField(docId, 'message');
    expect(finalValue).toBe('back to A');
  });

  it('should handle complex causal chains', async () => {
    const clients = await createClients(4);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Create causal chain: 0 → 1 → 2 → 3
    await clients[0].setField(docId, 'chain', 'step0');
    await clients[1].waitForField(docId, 'chain', 'step0');
    
    await clients[1].setField(docId, 'chain', 'step1');
    await clients[2].waitForField(docId, 'chain', 'step1');
    
    await clients[2].setField(docId, 'chain', 'step2');
    await clients[3].waitForField(docId, 'chain', 'step2');
    
    await clients[3].setField(docId, 'chain', 'step3');
    
    // All should converge to final step
    await sleep(500);
    const state = await assertEventualConvergence(clients, docId);
    expect(state.chain).toBe('step3');
  });

  it('should handle independent concurrent operations', async () => {
    const clients = await createClients(3);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Three independent operations (no causal relationship)
    await Promise.all([
      clients[0].setField(docId, 'independent0', 'value0'),
      clients[1].setField(docId, 'independent1', 'value1'),
      clients[2].setField(docId, 'independent2', 'value2'),
    ]);
    
    // All should be present (no conflicts)
    await sleep(500);
    const state = await assertEventualConvergence(clients, docId);
    
    expect(Object.keys(state).length).toBe(3);
  });

  it('should handle partial ordering', async () => {
    const clients = await createClients(4);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Create partial order:
    // 0 → 2
    // 1 → 3
    // (0 and 1 are concurrent, 2 and 3 are concurrent)
    
    await clients[0].setField(docId, 'branch', 'A0');
    await clients[1].setField(docId, 'branch', 'B1');
    await sleep(300);
    
    await clients[2].waitForField(docId, 'branch', 'A0');
    await clients[2].setField(docId, 'branch', 'A2');
    
    await clients[3].waitForField(docId, 'branch', 'B1');
    await clients[3].setField(docId, 'branch', 'B3');
    
    // Should converge to one of the final values
    await sleep(500);
    const state = await assertEventualConvergence(clients, docId);
    expect(['A2', 'B3']).toContain(state.branch);
  });

  it('should track multiple field updates correctly', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Client A updates multiple fields
    await clientA.setField(docId, 'f1', 1);
    await clientA.setField(docId, 'f2', 2);
    await clientA.setField(docId, 'f3', 3);
    
    // Client B should see all updates
    await clientB.waitForField(docId, 'f3', 3);
    
    const state = await assertEventualConvergence([clientA, clientB], docId);
    expect(state).toEqual({ f1: 1, f2: 2, f3: 3 });
  });

  it('should handle interleaved updates from multiple clients', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Interleaved updates
    await clientA.setField(docId, 'counter', 1);
    await sleep(50);
    await clientB.setField(docId, 'counter', 2);
    await sleep(50);
    await clientA.setField(docId, 'counter', 3);
    await sleep(50);
    await clientB.setField(docId, 'counter', 4);
    
    // Should converge to last write
    await sleep(500);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    expect(state.counter).toBe(4);
  });

  it('should maintain consistency with rapid updates', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Rapid updates from both clients
    const updates: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      updates.push(clientA.setField(docId, `a${i}`, i));
      updates.push(clientB.setField(docId, `b${i}`, i));
    }
    
    await Promise.all(updates);
    
    // Should converge with all fields
    await sleep(1000);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(Object.keys(state).length).toBe(40);
  });

  it('should handle update after network partition heals', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Both clients have initial state
    await clientA.setField(docId, 'shared', 'initial');
    await clientB.waitForField(docId, 'shared', 'initial');
    
    // Simulate partition: clientB disconnects
    await clientB.disconnect();
    
    // ClientA makes updates during partition
    await clientA.setField(docId, 'shared', 'updated');
    await clientA.setField(docId, 'duringPartition', 'value');
    
    // ClientB reconnects (partition heals)
    await clientB.connect();
    
    // Should sync updates made during partition
    await clientB.waitForField(docId, 'shared', 'updated');
    await clientB.waitForField(docId, 'duringPartition', 'value');
    
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle diamond causality pattern', async () => {
    const clients = await createClients(4);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Diamond: 0 → {1, 2} → 3
    await clients[0].setField(docId, 'diamond', 'start');
    await sleep(200);
    
    // 1 and 2 both see start and update concurrently
    await clients[1].waitForField(docId, 'diamond', 'start');
    await clients[2].waitForField(docId, 'diamond', 'start');
    
    await Promise.all([
      clients[1].setField(docId, 'diamond', 'branch1'),
      clients[2].setField(docId, 'diamond', 'branch2'),
    ]);
    
    await sleep(300);
    
    // 3 should eventually see one of the branches
    const finalValue = await clients[3].getField(docId, 'diamond');
    expect(['branch1', 'branch2']).toContain(finalValue);
  });

  it('should handle clock synchronization after reconnect', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Initial sync
    await clientA.setField(docId, 'reconnect', 'v1');
    await clientB.waitForField(docId, 'reconnect', 'v1');
    
    // ClientB disconnects and reconnects multiple times
    for (let i = 0; i < 3; i++) {
      await clientB.disconnect();
      await clientA.setField(docId, 'reconnect', `v${i + 2}`);
      await clientB.connect();
      await clientB.waitForField(docId, 'reconnect', `v${i + 2}`);
    }
    
    // Should be in sync
    await assertEventualConvergence([clientA, clientB], docId);
  });
});
