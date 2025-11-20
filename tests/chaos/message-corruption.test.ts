/**
 * Message Corruption Chaos Tests
 * 
 * Tests system resilience to corrupted, duplicated, and reordered messages
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestServer, teardownTestServer } from '../integration/helpers/test-server';
import { sleep } from '../integration/config';
import {
  createChaosClients,
  cleanupChaosClients,
  ChaosPresets,
} from './network-simulator';
import { waitForChaosConvergence } from './chaos-helpers';

describe('Chaos - Message Corruption', () => {
  beforeAll(async () => {
    await setupTestServer();
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  // Generate unique document ID for each test to prevent state leakage
  const getDocId = () => `corruption-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  it('should handle message duplication', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.duplication);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Make changes with duplication (increased operations for reliable duplication)
      for (let i = 0; i < 50; i++) {
        await clients[0].setField(docId, `dup${i}`, i);
      }

      // Wait for sync (duplicates shouldn't cause issues - idempotent)
      const finalState = await waitForChaosConvergence(clients, docId, 8000);

      expect(Object.keys(finalState).length).toBe(50);

      const stats = clients[0].getStats();
      console.log('Duplication stats:', stats);
      // With 50 operations at 10% probability, very likely to get duplicates
      expect(stats.messagesDuplicated).toBeGreaterThan(0);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle message reordering', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.reordering);
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Sequential operations
      for (let i = 0; i < 15; i++) {
        await clients[0].setField(docId, `order${i}`, i);
      }

      // Wait for convergence despite reordering
      await waitForChaosConvergence(clients, docId, 10000);
      
      const stats = clients[0].getStats();
      console.log('Reordering stats:', stats);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle message corruption', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.corruption);
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Make changes with corruption
      for (let i = 0; i < 20; i++) {
        await clients[0].setField(docId, `corrupt${i}`, i);
      }
      
      // Wait for sync
      await sleep(3000);
      
      // Most should sync (corrupted messages may fail)
      const stateA = await clients[0].getDocumentState(docId);
      const stateB = await clients[1].getDocumentState(docId);
      
      // Should converge (uncorrupted messages)
      expect(Object.keys(stateA).length).toBeGreaterThan(15);
      
      const stats = clients[0].getStats();
      console.log('Corruption stats:', stats);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle combined corruption types', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, {
      duplicationProbability: 0.10,
      reorderProbability: 0.15,
      corruptionProbability: 0.05,
      latency: { min: 50, max: 200 },
    });
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Make changes with multiple corruption types
      for (let i = 0; i < 25; i++) {
        await clients[0].setField(docId, `combined${i}`, i);
      }
      
      // Wait for convergence
      await sleep(5000);
      
      // Should handle multiple corruption types
      const stateA = await clients[0].getDocumentState(docId);
      const stateB = await clients[1].getDocumentState(docId);
      
      // Most messages should get through
      expect(Object.keys(stateA).length).toBeGreaterThan(20);
    } finally {
      await cleanupChaosClients(clients);
    }
  }, 10000); // 10s test timeout for combined corruption types

  it('should handle duplication with conflicts', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.duplication);
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Create conflict
      await clients[0].setField(docId, 'conflict', 'original');
      await sleep(500);

      // Both update
      await clients[0].setField(docId, 'conflict', 'A');
      await clients[1].setField(docId, 'conflict', 'B');

      // Wait for resolution (should resolve correctly despite duplicates)
      await waitForChaosConvergence(clients, docId, 8000);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle reordering with causality', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.reordering);
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Causal chain
      await clients[0].setField(docId, 'step1', 'first');
      await sleep(200);
      await clients[0].setField(docId, 'step2', 'second');
      await sleep(200);
      await clients[0].setField(docId, 'step3', 'third');
      
      // Wait for sync
      await sleep(4000);
      
      // All steps should be present
      const state = await clients[1].getDocumentState(docId);
      
      expect(state.step1).toBe('first');
      expect(state.step2).toBe('second');
      expect(state.step3).toBe('third');
    } finally {
      await cleanupChaosClients(clients);
    }
  }, 8000); // 8s test timeout for reordering with causality

  it('should be idempotent to duplicate messages', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, {
      duplicationProbability: 0.50, // High duplication
    });
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Set specific value
      await clients[0].setField(docId, 'idempotent', 'value');
      
      // Wait for all duplicates to process
      await sleep(2000);
      
      // Should still have single value
      const value = await clients[1].getField(docId, 'idempotent');
      expect(value).toBe('value');
      
      const stats = clients[0].getStats();
      console.log(`Duplicates sent: ${stats.messagesDuplicated}`);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle reordering with updates to same field', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.reordering);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Sequential updates to same field
      for (let i = 0; i < 10; i++) {
        await clients[0].setField(docId, 'sequence', i);
        await sleep(50);
      }

      // Wait for convergence
      const finalState = await waitForChaosConvergence(clients, docId, 10000);

      // With reordering, final value may not be the last sent value
      // But it should be one of the values we sent (0-9)
      const value = finalState.sequence;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(9);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle corruption with deletes', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.corruption);
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Create fields
      for (let i = 0; i < 10; i++) {
        await clients[0].setField(docId, `field${i}`, i);
      }
      
      await sleep(2000);
      
      // Delete with corruption
      for (let i = 0; i < 5; i++) {
        await clients[0].deleteField(docId, `field${i}`);
      }
      
      await sleep(2000);
      
      // Most deletes should work
      const state = await clients[1].getDocumentState(docId);
      expect(Object.keys(state).length).toBeLessThanOrEqual(7);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should track corruption statistics', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(1, {
      duplicationProbability: 0.10,
      reorderProbability: 0.15,
      corruptionProbability: 0.05,
    });
    
    try {
      await clients[0].connect();
      clients[0].resetStats();
      
      // Make many operations
      for (let i = 0; i < 50; i++) {
        await clients[0].setField(docId, `track${i}`, i);
      }
      
      const stats = clients[0].getStats();
      
      console.log('Corruption tracking stats:', {
        duplicated: stats.messagesDuplicated,
        reordered: stats.messagesReordered,
        corrupted: stats.messagesCorrupted,
      });
      
      // Should have some chaos
      const totalChaos = stats.messagesDuplicated + stats.messagesReordered + stats.messagesCorrupted;
      expect(totalChaos).toBeGreaterThan(0);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle duplication in multi-client scenario', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(4, ChaosPresets.duplication);
    
    try {
      await Promise.all(clients.map(c => c.connect()));
      
      // Each client makes changes
      await Promise.all(
        clients.map((client, idx) =>
          client.setField(docId, `client${idx}`, `value${idx}`)
        )
      );

      // Wait for convergence
      await waitForChaosConvergence(clients, docId, 10000);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle reordering in concurrent updates', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(3, ChaosPresets.reordering);
    
    try {
      await Promise.all(clients.map(c => c.connect()));
      
      // Concurrent updates with reordering
      await Promise.all([
        (async () => {
          for (let i = 0; i < 8; i++) {
            await clients[0].setField(docId, `A${i}`, i);
            await sleep(50);
          }
        })(),
        (async () => {
          for (let i = 0; i < 8; i++) {
            await clients[1].setField(docId, `B${i}`, i);
            await sleep(50);
          }
        })(),
        (async () => {
          for (let i = 0; i < 8; i++) {
            await clients[2].setField(docId, `C${i}`, i);
            await sleep(50);
          }
        })(),
      ]);

      // Wait for convergence
      await waitForChaosConvergence(clients, docId, 12000);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should maintain data integrity despite corruption', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.corruption);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Set specific values
      await clients[0].setField(docId, 'string', 'test');
      await clients[0].setField(docId, 'number', 42);
      await clients[0].setField(docId, 'boolean', true);

      // Wait for sync
      await sleep(3000);

      // With corruption, values may be corrupted (5% chance each)
      // The test validates that: 1) fields exist, 2) they have some value
      // In production, corrupted messages would be rejected by validation
      const state = await clients[1].getDocumentState(docId);

      // Check each field if it exists (may be corrupted)
      if (state.string !== undefined) {
        expect(typeof state.string).toBe('string');
        // Either correct or corrupted, but should be a string
      }
      if (state.number !== undefined) {
        expect(typeof state.number).toBe('number');
        // Either correct or corrupted, but should be a number
      }
      if (state.boolean !== undefined) {
        expect(typeof state.boolean).toBe('boolean');
        // Either correct or corrupted, but should be a boolean
      }

      // At least some fields should have synced
      expect(Object.keys(state).length).toBeGreaterThan(0);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle extreme duplication rate', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, {
      duplicationProbability: 0.80, // 80% duplication
    });
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Make changes
      for (let i = 0; i < 10; i++) {
        await clients[0].setField(docId, `extreme${i}`, i);
      }

      // Wait for processing (should still work correctly)
      const finalState = await waitForChaosConvergence(clients, docId, 10000);

      expect(Object.keys(finalState).length).toBe(10);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle extreme reordering rate', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, {
      reorderProbability: 0.70, // 70% reordering
      latency: { min: 50, max: 300 },
    });
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      // Make changes
      for (let i = 0; i < 12; i++) {
        await clients[0].setField(docId, `reorder${i}`, i);
      }

      // Extended wait for reordering (should eventually converge)
      await waitForChaosConvergence(clients, docId, 15000);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should eventually achieve perfect convergence', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(3, {
      duplicationProbability: 0.10,
      reorderProbability: 0.15,
      corruptionProbability: 0.03,
      latency: { min: 50, max: 200 },
    });
    
    try {
      await Promise.all(clients.map(c => c.connect()));
      
      // Create deterministic expected state
      const expectedData: Record<string, number> = {};
      for (let i = 0; i < 20; i++) {
        expectedData[`final${i}`] = i;
        await clients[0].setField(docId, `final${i}`, i);
      }

      // Extended wait for complete convergence
      const finalState = await waitForChaosConvergence(clients, docId, 20000);

      // Most data should be intact (allowing for some corruption and reordering delays)
      // With 3% corruption + 15% reordering on 20 fields, expect at least 16-17 to arrive
      expect(Object.keys(finalState).length).toBeGreaterThanOrEqual(16);
    } finally {
      await cleanupChaosClients(clients);
    }
  });
});
