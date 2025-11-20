/**
 * Concurrent Operations Test
 * 
 * Tests concurrent edits and LWW conflict resolution
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  setupTestSuite,
  createClients,
  assertEventualConvergence,
  assertLWWResolution,
  assertFieldSynced,
  sleep,
  TEST_CONFIG,
} from '../setup';
import { generateTestId } from '../config';

describe('E2E Sync - Concurrent Operations', () => {
  setupTestSuite();

  let docId: string;

  beforeEach(() => {
    docId = generateTestId('concurrent');
  });

  it('should resolve concurrent edits to same field (LWW)', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Both clients edit the same field concurrently
    await Promise.all([
      clientA.setField(docId, 'contested', 'valueA'),
      clientB.setField(docId, 'contested', 'valueB'),
    ]);
    
    // Should converge to one value (last write wins)
    await sleep(500);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    // One of the values should win
    expect(['valueA', 'valueB']).toContain(state.contested);
    
    // Both clients should agree on the winner
    const valueA = await clientA.getField(docId, 'contested');
    const valueB = await clientB.getField(docId, 'contested');
    expect(valueA).toBe(valueB);
  });

  it('should handle concurrent edits to different fields', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Concurrent edits to different fields - no conflict
    await Promise.all([
      clientA.setField(docId, 'fieldA', 'valueA'),
      clientB.setField(docId, 'fieldB', 'valueB'),
    ]);
    
    // Should converge with both fields
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    expect(state).toEqual({
      fieldA: 'valueA',
      fieldB: 'valueB',
    });
  });

  it('should handle three-way concurrent edit', async () => {
    const clients = await createClients(3);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // All three clients edit the same field
    await Promise.all([
      clients[0].setField(docId, 'threeway', 'value0'),
      clients[1].setField(docId, 'threeway', 'value1'),
      clients[2].setField(docId, 'threeway', 'value2'),
    ]);
    
    // Should converge to one value
    await sleep(500);
    const state = await assertEventualConvergence(clients, docId);
    
    // One of the values should win
    expect(['value0', 'value1', 'value2']).toContain(state.threeway);
  });

  it('should handle rapid concurrent updates', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Both clients make rapid updates to the same field
    const updatesA = Array.from({ length: 10 }, (_, i) =>
      clientA.setField(docId, 'rapid', `A${i}`)
    );
    
    const updatesB = Array.from({ length: 10 }, (_, i) =>
      clientB.setField(docId, 'rapid', `B${i}`)
    );
    
    await Promise.all([...updatesA, ...updatesB]);
    
    // Should converge to one of the final values
    await sleep(1000);
    await assertEventualConvergence([clientA, clientB], docId);
    
    const value = await clientA.getField(docId, 'rapid');
    expect(value).toMatch(/^(A9|B9)$/);
  });

  it('should handle concurrent create and delete', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Set initial value
    await clientA.setField(docId, 'volatile', 'initial');
    await clientB.waitForField(docId, 'volatile', 'initial');
    
    // Client A updates, Client B deletes (concurrent)
    await Promise.all([
      clientA.setField(docId, 'volatile', 'updated'),
      clientB.deleteField(docId, 'volatile'),
    ]);
    
    // Should converge (LWW determines outcome)
    await sleep(500);
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle concurrent updates with different data types', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Concurrent updates with different types
    await Promise.all([
      clientA.setField(docId, 'typed', 'string'),
      clientB.setField(docId, 'typed', 123),
    ]);
    
    await sleep(300);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    // One type should win
    expect(typeof state.typed === 'string' || typeof state.typed === 'number').toBe(true);
  });

  it('should maintain causality with sequential updates', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Sequential updates (not concurrent)
    await clientA.setField(docId, 'sequential', 'first');
    await clientB.waitForField(docId, 'sequential', 'first');
    
    await clientB.setField(docId, 'sequential', 'second');
    await clientA.waitForField(docId, 'sequential', 'second');
    
    await clientA.setField(docId, 'sequential', 'third');
    
    // Should converge to 'third' (clear causality)
    await assertFieldSynced([clientA, clientB], docId, 'sequential', 'third');
  });

  it('should handle concurrent operations on multiple fields', async () => {
    const clients = await createClients(3);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Each client updates multiple fields concurrently
    await Promise.all([
      clients[0].setField(docId, 'field1', 'A1'),
      clients[0].setField(docId, 'field2', 'A2'),
      clients[1].setField(docId, 'field1', 'B1'),
      clients[1].setField(docId, 'field3', 'B3'),
      clients[2].setField(docId, 'field2', 'C2'),
      clients[2].setField(docId, 'field4', 'C4'),
    ]);
    
    // Should converge with all fields
    await sleep(800);
    const state = await assertEventualConvergence(clients, docId);
    
    expect(Object.keys(state).length).toBe(4);
  });

  it('should handle write after delete conflict', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Create initial field
    await clientA.setField(docId, 'recreate', 'original');
    await clientB.waitForField(docId, 'recreate', 'original');
    
    // Client A deletes, Client B updates (concurrent)
    await Promise.all([
      clientA.deleteField(docId, 'recreate'),
      clientB.setField(docId, 'recreate', 'updated'),
    ]);
    
    // LWW should determine the outcome
    await sleep(500);
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle concurrent null assignments', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    await clientA.setField(docId, 'nullable', 'value');
    await clientB.waitForField(docId, 'nullable', 'value');
    
    // Both set to null concurrently
    await Promise.all([
      clientA.setField(docId, 'nullable', null),
      clientB.setField(docId, 'nullable', null),
    ]);
    
    // Should converge to null
    await assertFieldSynced([clientA, clientB], docId, 'nullable', null);
  });

  it('should handle complex concurrent scenario', async () => {
    const clients = await createClients(4);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // Create base state
    await clients[0].setField(docId, 'a', 1);
    await clients[0].setField(docId, 'b', 2);
    await clients[0].setField(docId, 'c', 3);
    await sleep(300);
    
    // Concurrent operations
    await Promise.all([
      clients[0].setField(docId, 'a', 10),        // Update a
      clients[1].setField(docId, 'a', 20),        // Concurrent update to a
      clients[2].deleteField(docId, 'b'),         // Delete b
      clients[3].setField(docId, 'd', 4),         // Add new field d
      clients[1].setField(docId, 'c', 30),        // Update c
    ]);
    
    // Should converge to a consistent state
    await sleep(1000);
    const state = await assertEventualConvergence(clients, docId);
    
    // field 'a' should have one of the competing values
    expect([10, 20]).toContain(state.a);
    
    // field 'd' should exist
    expect(state.d).toBe(4);
  });

  it('should handle interleaved updates', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Interleaved updates to same field
    await clientA.setField(docId, 'interleaved', 'A1');
    await sleep(50);
    await clientB.setField(docId, 'interleaved', 'B1');
    await sleep(50);
    await clientA.setField(docId, 'interleaved', 'A2');
    await sleep(50);
    await clientB.setField(docId, 'interleaved', 'B2');
    
    // Should converge to last write
    await sleep(500);
    await assertEventualConvergence([clientA, clientB], docId);
  });

  it('should handle concurrent array updates', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Both update array field
    await Promise.all([
      clientA.setField(docId, 'list', [1, 2, 3]),
      clientB.setField(docId, 'list', [4, 5, 6]),
    ]);
    
    await sleep(500);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    // One of the arrays should win
    const validArrays = [[1, 2, 3], [4, 5, 6]];
    const matchesOne = validArrays.some(arr =>
      JSON.stringify(arr) === JSON.stringify(state.list)
    );
    expect(matchesOne).toBe(true);
  });

  it('should handle concurrent object updates', async () => {
    const [clientA, clientB] = await createClients(2);
    
    await clientA.connect();
    await clientB.connect();
    
    // Both update object field
    await Promise.all([
      clientA.setField(docId, 'config', { theme: 'dark' }),
      clientB.setField(docId, 'config', { theme: 'light' }),
    ]);
    
    await sleep(500);
    const state = await assertEventualConvergence([clientA, clientB], docId);
    
    // One of the objects should win
    expect(['dark', 'light']).toContain(state.config.theme);
  });

  it('should handle mass concurrent updates', async () => {
    const clients = await createClients(5);
    
    await Promise.all(clients.map(c => c.connect()));
    
    // All clients update the same field 5 times
    const allUpdates = clients.flatMap((client, i) =>
      Array.from({ length: 5 }, (_, j) =>
        client.setField(docId, 'mass', `client${i}-update${j}`)
      )
    );
    
    await Promise.all(allUpdates);
    
    // Should eventually converge
    await sleep(1500);
    await assertEventualConvergence(clients, docId);
  });
});
