/**
 * Latency Chaos Tests
 *
 * Tests sync behavior with injected network latency (50ms, 500ms, 2s)
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestServer, teardownTestServer } from '../integration/helpers/test-server';
import { sleep } from '../integration/config';
import {
  createChaosClients,
  cleanupChaosClients,
  ChaosPresets,
} from './network-simulator';
import { waitForChaosConvergence, waitForFieldCount } from './chaos-helpers';

describe('Chaos - Latency Injection', () => {
  beforeAll(async () => {
    await setupTestServer();
  });

  afterAll(async () => {
    await teardownTestServer();
  });

  // Generate unique document ID for each test to prevent state leakage
  const getDocId = () => `latency-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  it('should converge with 50ms latency', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.lowLatency);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Make changes
      for (let i = 0; i < 10; i++) {
        await clients[0].setField(docId, `field${i}`, i);
      }

      // Wait for convergence (polls until states match or timeout)
      const finalState = await waitForChaosConvergence(clients, docId, 10000);

      // Verify we got all fields
      expect(Object.keys(finalState).length).toBe(10);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should converge with 500ms latency', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.highLatency);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Make changes
      for (let i = 0; i < 10; i++) {
        await clients[0].setField(docId, `field${i}`, i);
      }

      // Wait for convergence with longer timeout for high latency
      await waitForChaosConvergence(clients, docId, 15000);
    } finally {
      await cleanupChaosClients(clients);
    }
  }, 20000); // 20s test timeout for high latency

  it('should converge with 2s latency (extreme)', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.extremeLatency);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Make fewer changes due to extreme latency
      for (let i = 0; i < 5; i++) {
        await clients[0].setField(docId, `field${i}`, i);
      }

      // Wait for convergence with very long timeout for extreme latency
      await waitForChaosConvergence(clients, docId, 25000);
    } finally {
      await cleanupChaosClients(clients);
    }
  }, 30000); // 30s test timeout for extreme latency

  it('should handle concurrent updates with latency', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.highLatency);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Both clients make changes concurrently
      await Promise.all([
        clients[0].setField(docId, 'fromA', 'valueA'),
        clients[1].setField(docId, 'fromB', 'valueB'),
      ]);

      // Wait for convergence
      const state = await waitForChaosConvergence(clients, docId, 12000);

      // Both changes should be present
      expect(state.fromA).toBe('valueA');
      expect(state.fromB).toBe('valueB');
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should maintain causality under latency', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.lowLatency);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Sequential operations
      await clients[0].setField(docId, 'step1', 'first');
      await sleep(500);
      await clients[0].setField(docId, 'step2', 'second');
      await sleep(500);
      await clients[0].setField(docId, 'step3', 'third');

      // Wait for sync
      const state = await waitForChaosConvergence(clients, docId, 8000);

      // Verify all operations synced
      expect(state.step1).toBe('first');
      expect(state.step2).toBe('second');
      expect(state.step3).toBe('third');
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle latency with deletes', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.highLatency);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Create fields
      await clients[0].setField(docId, 'toDelete', 'value');
      await clients[0].setField(docId, 'toKeep', 'value');

      // Wait for initial sync
      await waitForChaosConvergence(clients, docId, 8000);

      // Delete
      await clients[0].deleteField(docId, 'toDelete');

      // Wait for delete to sync
      await sleep(200); // Small delay to allow delete to process

      // Verify delete synced
      const state = await waitForChaosConvergence(clients, docId, 12000);

      expect(state).not.toHaveProperty('toDelete');
      expect(state.toKeep).toBe('value');
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle variable latency', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, {
      latency: { min: 100, max: 1000 }, // Variable 100-1000ms
    });

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Make multiple changes
      for (let i = 0; i < 10; i++) {
        await clients[0].setField(docId, `var${i}`, i);
      }

      // Wait for convergence
      await waitForChaosConvergence(clients, docId, 15000);
    } finally {
      await cleanupChaosClients(clients);
    }
  }, 20000); // 20s test timeout for variable latency

  it('should handle rapid updates under latency', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.lowLatency);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Rapid updates
      for (let i = 0; i < 20; i++) {
        await clients[0].setField(docId, 'counter', i);
      }

      // Wait for convergence
      await waitForChaosConvergence(clients, docId, 8000);

      // Final value should sync
      const value = await clients[1].getField(docId, 'counter');
      expect(value).toBe(19);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle multi-client latency', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(4, ChaosPresets.highLatency);

    try {
      await Promise.all(clients.map(c => c.connect()));

      // Each client makes changes
      await Promise.all(
        clients.map((client, idx) =>
          client.setField(docId, `client${idx}`, `value${idx}`)
        )
      );

      // Wait for convergence
      await waitForChaosConvergence(clients, docId, 20000);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle latency with conflicts', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.highLatency);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Create conflict
      await clients[0].setField(docId, 'conflict', 'original');

      // Wait for initial sync
      await waitForChaosConvergence(clients, docId, 8000);

      // Both update same field
      await clients[0].setField(docId, 'conflict', 'A');
      await clients[1].setField(docId, 'conflict', 'B');

      // Wait for resolution via LWW
      await waitForChaosConvergence(clients, docId, 12000);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should measure sync time under latency', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.lowLatency);
    
    try {
      await clients[0].connect();
      await clients[1].connect();
      
      const startTime = Date.now();
      
      // Make change
      await clients[0].setField(docId, 'timed', 'value');
      
      // Wait for sync
      await clients[1].waitForField(docId, 'timed', 'value', 5000);
      
      const syncTime = Date.now() - startTime;
      
      console.log(`Sync time with 50ms latency: ${syncTime}ms`);
      
      // Should be at least the latency time
      expect(syncTime).toBeGreaterThan(50);
      expect(syncTime).toBeLessThan(2000);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle asymmetric latency', async () => {
    const docId = getDocId();
    const config = { latency: { min: 50, max: 150 } };
    const clients = await createChaosClients(2, config);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Client 0 -> Client 1 has latency
      await clients[0].setField(docId, 'asymmetric', 'value');

      // Wait for convergence
      await waitForChaosConvergence(clients, docId, 5000);

      // Should sync despite asymmetric latency
      const value = await clients[1].getField(docId, 'asymmetric');
      expect(value).toBe('value');
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle latency with large payloads', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.highLatency);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Large string payload
      const largeString = 'x'.repeat(1000);

      await clients[0].setField(docId, 'large', largeString);

      // Wait for convergence
      await waitForChaosConvergence(clients, docId, 15000);

      // Verify large payload synced
      const value = await clients[1].getField(docId, 'large');
      expect(value).toBe(largeString);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle latency spikes', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, {
      latency: { min: 50, max: 2000 }, // Occasional spikes to 2s
    });

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Make multiple changes
      for (let i = 0; i < 15; i++) {
        await clients[0].setField(docId, `spike${i}`, i);
      }

      // Wait for convergence despite spikes (need long timeout due to 2s spikes)
      await waitForChaosConvergence(clients, docId, 25000);
    } finally {
      await cleanupChaosClients(clients);
    }
  }, 35000); // 35s test timeout for latency spikes

  it('should maintain order under latency', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(2, ChaosPresets.lowLatency);

    try {
      await clients[0].connect();
      await clients[1].connect();

      // Sequential updates to same field
      await clients[0].setField(docId, 'sequence', 'v1');
      await sleep(200);
      await clients[0].setField(docId, 'sequence', 'v2');
      await sleep(200);
      await clients[0].setField(docId, 'sequence', 'v3');

      // Wait for convergence
      await waitForChaosConvergence(clients, docId, 6000);

      // Final value should be v3
      const value = await clients[1].getField(docId, 'sequence');
      expect(value).toBe('v3');
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle connection latency', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(1, ChaosPresets.extremeLatency);
    
    try {
      const startTime = Date.now();
      
      // Connect with latency
      await clients[0].connect();
      
      const connectTime = Date.now() - startTime;
      
      console.log(`Connection time with 2s latency: ${connectTime}ms`);
      
      // Should include latency time
      expect(connectTime).toBeGreaterThan(1000);
      expect(clients[0].isConnected).toBe(true);
    } finally {
      await cleanupChaosClients(clients);
    }
  });

  it('should handle combined latency and operations', async () => {
    const docId = getDocId();
    const clients = await createChaosClients(3, ChaosPresets.highLatency);

    try {
      await Promise.all(clients.map(c => c.connect()));

      // All clients make changes with latency
      await Promise.all([
        (async () => {
          for (let i = 0; i < 5; i++) {
            await clients[0].setField(docId, `A${i}`, i);
            await sleep(200);
          }
        })(),
        (async () => {
          for (let i = 0; i < 5; i++) {
            await clients[1].setField(docId, `B${i}`, i);
            await sleep(200);
          }
        })(),
        (async () => {
          for (let i = 0; i < 5; i++) {
            await clients[2].setField(docId, `C${i}`, i);
            await sleep(200);
          }
        })(),
      ]);

      // Wait for convergence
      const finalState = await waitForChaosConvergence(clients, docId, 20000);

      // All should have all changes
      expect(Object.keys(finalState).length).toBe(15);
    } finally {
      await cleanupChaosClients(clients);
    }
  }, 30000); // 30s test timeout for combined latency operations
});
