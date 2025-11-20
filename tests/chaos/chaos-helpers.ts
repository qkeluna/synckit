/**
 * Helper functions for chaos tests
 */

import { TEST_CONFIG, sleep } from '../integration/config';
import { ChaosNetworkSimulator } from './network-simulator';

/**
 * Deep equality comparison that ignores property order
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();

  if (keysA.length !== keysB.length) return false;
  if (!deepEqual(keysA, keysB)) return false;

  for (const key of keysA) {
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}

/**
 * Wait for all chaos clients to converge to the same state
 * Similar to assertEventualConvergence but works with ChaosNetworkSimulator
 */
export async function waitForChaosConvergence<T = any>(
  clients: ChaosNetworkSimulator[],
  documentId: string,
  timeout: number = 30000 // Default 30s for chaos tests
): Promise<T> {
  if (clients.length === 0) {
    throw new Error('No clients provided for convergence check');
  }

  const startTime = Date.now();
  let lastStates: any[] = [];
  let attempts = 0;

  while (Date.now() - startTime < timeout) {
    attempts++;

    try {
      // Get states from all clients
      const states = await Promise.all(
        clients.map(client => client.getDocumentState<T>(documentId))
      );

      // Check if all states are identical
      const firstState = states[0];
      const allMatch = states.every(state => deepEqual(state, firstState));

      if (allMatch) {
        console.log(`[ChaosConvergence] Achieved after ${Date.now() - startTime}ms (${attempts} attempts)`);
        return states[0];
      }

      lastStates = states;
    } catch (error) {
      // Ignore errors during convergence check (client might be disconnected)
      if (TEST_CONFIG.features.verbose) {
        console.log(`[ChaosConvergence] Error checking state (attempt ${attempts}):`, error);
      }
    }

    // Poll more frequently for faster convergence detection
    await sleep(200);
  }

  // Convergence failed
  throw new Error(
    `Convergence failed after ${timeout}ms (${attempts} attempts).\n` +
    `Client states:\n${lastStates.map((state, i) =>
      `  Client ${i}: ${JSON.stringify(state)}`
    ).join('\n')}`
  );
}

/**
 * Wait for chaos clients to have expected field count
 */
export async function waitForFieldCount(
  clients: ChaosNetworkSimulator[],
  documentId: string,
  expectedCount: number,
  timeout: number = 30000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const states = await Promise.all(
        clients.map(client => client.getDocumentState(documentId))
      );

      const allHaveCount = states.every(
        state => Object.keys(state).length === expectedCount
      );

      if (allHaveCount) {
        return;
      }
    } catch (error) {
      // Ignore errors
    }

    await sleep(200);
  }

  throw new Error(`Timeout waiting for field count ${expectedCount} after ${timeout}ms`);
}
