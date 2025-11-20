/**
 * Custom Assertions for Integration Tests
 * 
 * Specialized assertions for testing sync behavior
 */

import { expect } from 'bun:test';
import { TestClient } from './test-client';
import { sleep, waitFor, TEST_CONFIG } from '../config';

/**
 * Deep equality comparison that ignores property order
 * Handles objects, arrays, primitives, null, undefined
 */
function deepEqual(a: any, b: any): boolean {
  // Handle primitives, null, undefined
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Handle objects
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
 * Assert that all clients have converged to the same state
 */
export async function assertConvergence<T = any>(
  clients: TestClient[],
  documentId: string,
  timeout: number = TEST_CONFIG.timeouts.convergence
): Promise<T> {
  if (clients.length === 0) {
    throw new Error('No clients provided for convergence check');
  }

  const startTime = Date.now();
  let lastStates: any[] = [];

  while (Date.now() - startTime < timeout) {
    // Get states from all clients
    const states = await Promise.all(
      clients.map(client => client.getDocumentState<T>(documentId))
    );

    // Check if all states are identical (using deep equality that ignores property order)
    const firstState = states[0];
    const allMatch = states.every(state => deepEqual(state, firstState));

    if (allMatch) {
      if (TEST_CONFIG.features.verbose) {
        console.log(`[Assertion] Convergence achieved in ${Date.now() - startTime}ms`);
      }
      return states[0];
    }

    lastStates = states;
    await sleep(100);
  }

  // Convergence failed - provide detailed error
  throw new Error(
    `Convergence failed after ${timeout}ms.\n` +
    `Client states:\n${lastStates.map((state, i) => 
      `  Client ${i}: ${JSON.stringify(state)}`
    ).join('\n')}`
  );
}

/**
 * Assert that a client's document has expected state
 */
export async function assertDocumentState<T = any>(
  client: TestClient,
  documentId: string,
  expectedState: T
): Promise<void> {
  const actualState = await client.getDocumentState<T>(documentId);
  expect(actualState).toEqual(expectedState);
}

/**
 * Assert that a client's document has expected field value
 */
export async function assertFieldValue(
  client: TestClient,
  documentId: string,
  field: string,
  expectedValue: any
): Promise<void> {
  const actualValue = await client.getField(documentId, field);
  expect(actualValue).toBe(expectedValue);
}

/**
 * Assert that a field exists in document
 */
export async function assertFieldExists(
  client: TestClient,
  documentId: string,
  field: string
): Promise<void> {
  const state = await client.getDocumentState(documentId);
  expect(state).toHaveProperty(field);
}

/**
 * Assert that a field does not exist in document
 */
export async function assertFieldNotExists(
  client: TestClient,
  documentId: string,
  field: string
): Promise<void> {
  const state = await client.getDocumentState(documentId);
  expect(state).not.toHaveProperty(field);
}

/**
 * Assert that document is empty
 */
export async function assertDocumentEmpty(
  client: TestClient,
  documentId: string
): Promise<void> {
  const state = await client.getDocumentState(documentId);
  expect(Object.keys(state).length).toBe(0);
}

/**
 * Assert that eventual convergence happens (wait and check)
 */
export async function assertEventualConvergence<T = any>(
  clients: TestClient[],
  documentId: string,
  timeout: number = TEST_CONFIG.timeouts.convergence
): Promise<T> {
  // Give some time for sync to propagate
  await sleep(500);
  
  return await assertConvergence<T>(clients, documentId, timeout);
}

/**
 * Assert that a field value is synced across all clients
 */
export async function assertFieldSynced(
  clients: TestClient[],
  documentId: string,
  field: string,
  expectedValue: any,
  timeout: number = TEST_CONFIG.timeouts.sync
): Promise<void> {
  await waitFor(async () => {
    const values = await Promise.all(
      clients.map(client => client.getField(documentId, field))
    );
    return values.every(value => value === expectedValue);
  }, timeout);

  // Final verification
  for (const client of clients) {
    await assertFieldValue(client, documentId, field, expectedValue);
  }
}

/**
 * Assert that clients can connect to server
 */
export async function assertClientsConnected(
  clients: TestClient[]
): Promise<void> {
  const connectPromises = clients.map(client => client.connect());
  await Promise.all(connectPromises);
  
  for (const client of clients) {
    expect(client.isConnected).toBe(true);
  }
}

/**
 * Assert that sync latency is within acceptable range
 */
export async function assertSyncLatency(
  sourceClient: TestClient,
  targetClient: TestClient,
  documentId: string,
  field: string,
  value: any,
  maxLatencyMs: number = 100
): Promise<number> {
  const startTime = Date.now();
  
  // Source client makes change
  await sourceClient.setField(documentId, field, value);
  
  // Wait for target client to receive change
  await targetClient.waitForField(documentId, field, value);
  
  const latency = Date.now() - startTime;
  
  expect(latency).toBeLessThan(maxLatencyMs);
  
  if (TEST_CONFIG.features.verbose) {
    console.log(`[Assertion] Sync latency: ${latency}ms`);
  }
  
  return latency;
}

/**
 * Assert that all clients have same number of fields
 */
export async function assertSameFieldCount(
  clients: TestClient[],
  documentId: string
): Promise<void> {
  const states = await Promise.all(
    clients.map(client => client.getDocumentState(documentId))
  );
  
  const counts = states.map(state => Object.keys(state).length);
  const firstCount = counts[0];
  
  for (let i = 1; i < counts.length; i++) {
    expect(counts[i]).toBe(firstCount);
  }
}

/**
 * Assert no data loss occurred
 */
export async function assertNoDataLoss(
  clients: TestClient[],
  documentId: string,
  expectedFields: string[]
): Promise<void> {
  // Check each client has all expected fields
  for (const client of clients) {
    const state = await client.getDocumentState(documentId);
    for (const field of expectedFields) {
      expect(state).toHaveProperty(field);
    }
  }
}

/**
 * Assert that LWW conflict resolution worked correctly
 */
export async function assertLWWResolution(
  clients: TestClient[],
  documentId: string,
  field: string,
  expectedWinner: any
): Promise<void> {
  // Wait for convergence
  await assertEventualConvergence(clients, documentId);
  
  // All clients should have the same value (the "winning" value)
  for (const client of clients) {
    const value = await client.getField(documentId, field);
    expect(value).toBe(expectedWinner);
  }
}

/**
 * Measure and assert convergence time
 */
export async function measureConvergenceTime(
  clients: TestClient[],
  documentId: string,
  maxTimeMs: number = 1000
): Promise<number> {
  const startTime = Date.now();
  
  await assertConvergence(clients, documentId);
  
  const convergenceTime = Date.now() - startTime;
  
  expect(convergenceTime).toBeLessThan(maxTimeMs);
  
  if (TEST_CONFIG.features.verbose) {
    console.log(`[Assertion] Convergence time: ${convergenceTime}ms`);
  }
  
  return convergenceTime;
}

/**
 * Assert server health
 */
export async function assertServerHealth(
  expectedStatus: 'healthy' | 'unhealthy' = 'healthy'
): Promise<void> {
  const response = await fetch(`http://localhost:${TEST_CONFIG.server.port}/health`);
  expect(response.ok).toBe(true);
  
  const data = await response.json();
  expect(data.status).toBe(expectedStatus);
}
