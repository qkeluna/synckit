# SyncKit SDK API Design

**Version:** 0.1.0
**Last Updated:** November 22, 2025

---

## ⚠️ v0.1.0 - IMPLEMENTATION STATUS

**SyncKit v0.1.0 is a LOCAL-FIRST library.** Network sync features are documented but **NOT YET IMPLEMENTED**.

### ✅ Implemented in v0.1.0

**Core SDK (`@synckit/sdk`):**
- ✅ `SyncKit` class with storage
- ✅ `SyncDocument<T>` with LWW-CRDT
- ✅ Methods: `get()`, `set()`, `update()`, `delete()`, `subscribe()`, `merge()`
- ✅ IndexedDB & Memory storage adapters

**React (`@synckit/sdk/react`):**
- ✅ `SyncProvider`, `useSyncKit()`, `useSyncDocument()`

**Config Options:**
- ✅ `storage`, `name`, `clientId`
- ⚠️ `serverUrl` (accepted but not used yet)

### ❌ NOT Implemented Yet

- ❌ Network/WebSocket sync
- ❌ `connect()`, `disconnect()`, `reconnect()`
- ❌ `Text`, `Counter`, `Set` CRDTs
- ❌ `onConflict()` callbacks
- ❌ `auth`, `offlineQueue`, `syncStrategy` config
- ❌ Vue/Svelte adapters

**Current use:** Offline-only apps. Network sync coming soon.

---

## Overview

This document defines the TypeScript SDK API for SyncKit. The design follows these principles:

1. **Simple by default** - Common cases require minimal code
2. **Type-safe** - Full TypeScript support with generics
3. **Framework-agnostic core** - React/Vue/Svelte adapters built on top
4. **Progressive disclosure** - Advanced features available but not required

---

## Table of Contents

1. [Core API](#core-api)
2. [Tier 1: Document Sync (LWW)](#tier-1-document-sync-lww)
3. [Tier 2: Text Sync (CRDT)](#tier-2-text-sync-crdt)
4. [Tier 3: Custom CRDTs](#tier-3-custom-crdts)
5. [React Hooks](#react-hooks)
6. [Vue Composables](#vue-composables)
7. [Svelte Stores](#svelte-stores)

---

## Core API

### SyncKit Constructor

```typescript
import { SyncKit } from '@synckit/sdk'

// Minimal configuration
const sync = new SyncKit()

// With server URL
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080'
})

// Full configuration (many options planned for future versions)
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',  // Accepted in v0.1.0 but not yet used
  storage: 'indexeddb',              // ✅ WORKS: 'indexeddb' | 'memory'
  name: 'my-app',                    // ✅ WORKS: Storage namespace
  clientId: 'user-123',              // ✅ WORKS: Auto-generated if omitted
  // Future options (not yet implemented):
  // auth, offlineQueue, reconnect, reconnectDelay, maxReconnectDelay
})
```

### Configuration Options

```typescript
interface SyncKitConfig {
  // Server URL (optional, works offline-only without)
  url?: string
  
  // Authentication function
  auth?: () => string | Promise<string>
  
  // Storage adapter
  storage?: 'indexeddb' | 'opfs' | 'sqlite' | 'memory'
  
  // Offline queue configuration
  offlineQueue?: boolean
  offlineQueueSize?: number  // Max operations to buffer (default: 1000)
  
  // Reconnection configuration
  reconnect?: boolean
  reconnectDelay?: number
  maxReconnectDelay?: number
  
  // Advanced
  batchInterval?: number    // Batch operations every N ms (default: 100)
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
}
```

### Connection Status

```typescript
// Get current status
const status = sync.status
// Returns: 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

// Subscribe to status changes
sync.onStatusChange((status) => {
  console.log('Connection status:', status)
})

// Force reconnect
await sync.reconnect()

// Disconnect
await sync.disconnect()
```

---

## Tier 1: Document Sync (LWW)

**Use Cases:** Task apps, CRMs, project management, simple note apps (80% of applications)

### Basic Usage

```typescript
interface Todo {
  id: string
  text: string
  completed: boolean
  dueDate?: Date
}

// Get document reference
const todo = sync.document<Todo>('todo-123')

// Subscribe to changes (reactive)
const unsubscribe = todo.subscribe((data) => {
  console.log('Todo updated:', data)
  // { id: 'todo-123', text: '...', completed: false }
})

// Update document (partial)
await todo.update({ completed: true })

// Update multiple fields
await todo.update({
  text: 'Buy groceries',
  dueDate: new Date('2025-12-01')
})

// Get current value (one-time read)
const currentTodo = todo.get()

// Delete field
await todo.update({ dueDate: null })

// Unsubscribe when done
unsubscribe()
```

### Document API

```typescript
class Document<T> {
  // Subscribe to document changes
  subscribe(callback: (data: T) => void): () => void
  
  // Update document (partial update)
  update(changes: Partial<T>): Promise<void>

  // Set a single field
  set<K extends keyof T>(field: K, value: T[K]): Promise<void>

  // Get current value (synchronous)
  get(): T
  
  // Delete document
  delete(): Promise<void>
  
  // Get document ID
  readonly id: string
  
  // Check if document exists
  exists(): Promise<boolean>
}
```

### Batch Operations

```typescript
// Update multiple documents atomically
await sync.batch(() => {
  todo1.update({ completed: true })
  todo2.update({ completed: true })
  todo3.update({ completed: false })
})
// All updates succeed or all fail
```

### Query API (Future - Phase 6)

```typescript
// Subscribe to query results
const todos = sync.query<Todo>()
  .where('completed', '==', false)
  .orderBy('dueDate', 'asc')
  .limit(10)

todos.subscribe((results) => {
  console.log('Incomplete todos:', results)
})
```

---

## Tier 2: Text Sync (CRDT) *(Coming in v0.2.0)*

**Use Cases:** Collaborative editors, note apps, documentation tools (15% of applications)

**Note:** The Text CRDT API is planned for v0.2.0. The following is the proposed API design.

### Basic Usage

```typescript
// Get text reference
const noteText = sync.text('note-456')

// Subscribe to changes
noteText.subscribe((content) => {
  console.log('Text content:', content)
  editor.setValue(content)
})

// Insert text at position
await noteText.insert(0, 'Hello ')

// Insert at end
await noteText.append('World!')

// Delete range
await noteText.delete(0, 6)  // Delete 'Hello '

// Replace range
await noteText.replace(0, 5, 'Hi')

// Get current text
const content = await noteText.get()
```

### Text API

```typescript
class Text {
  // Subscribe to text changes
  subscribe(callback: (content: string) => void): () => void
  
  // Insert text at position
  insert(position: number, text: string): Promise<void>
  
  // Delete range
  delete(start: number, end: number): Promise<void>
  
  // Replace range
  replace(start: number, end: number, text: string): Promise<void>
  
  // Append to end
  append(text: string): Promise<void>
  
  // Get current content
  get(): Promise<string>
  
  // Get text length
  length(): Promise<number>
  
  // Get text ID
  readonly id: string
}
```

### Rich Text (Future - Phase 6)

```typescript
interface RichText extends Text {
  // Apply formatting to range
  format(start: number, end: number, style: TextStyle): Promise<void>
  
  // Insert link
  insertLink(position: number, text: string, url: string): Promise<void>
}

type TextStyle = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  backgroundColor?: string
}
```

---

## Tier 3: Custom CRDTs *(Coming in v0.2.0)*

**Use Cases:** Counters, sets, lists, whiteboards (5% of applications)

**Note:** Counter and Set APIs are planned for v0.2.0. The following is the proposed API design.

### Counter (PN-Counter)

```typescript
// Get counter reference
const likesCounter = sync.counter('likes-789')

// Subscribe to changes
likesCounter.subscribe((value) => {
  console.log('Likes count:', value)
  updateUI(value)
})

// Increment
await likesCounter.increment()

// Increment by N
await likesCounter.increment(5)

// Decrement
await likesCounter.decrement()

// Get current value
const currentCount = await likesCounter.get()
```

### Counter API

```typescript
class Counter {
  // Subscribe to counter changes
  subscribe(callback: (value: number) => void): () => void
  
  // Increment counter
  increment(delta?: number): Promise<void>
  
  // Decrement counter
  decrement(delta?: number): Promise<void>
  
  // Get current value
  get(): Promise<number>
  
  // Reset to zero (not recommended - loses history)
  reset(): Promise<void>
  
  // Get counter ID
  readonly id: string
}
```

### Set (OR-Set)

```typescript
// Get set reference
const tags = sync.set<string>('tags-101')

// Subscribe to changes
tags.subscribe((items) => {
  console.log('Current tags:', Array.from(items))
})

// Add item
await tags.add('important')

// Add multiple items
await tags.addAll(['urgent', 'review'])

// Remove item
await tags.remove('important')

// Check membership
const hasTag = await tags.has('urgent')

// Get all items
const allTags = await tags.get()  // Returns Set<string>

// Get size
const count = await tags.size()
```

### Set API

```typescript
class CRDTSet<T> {
  // Subscribe to set changes
  subscribe(callback: (items: Set<T>) => void): () => void
  
  // Add item
  add(item: T): Promise<void>
  
  // Add multiple items
  addAll(items: T[]): Promise<void>
  
  // Remove item
  remove(item: T): Promise<void>
  
  // Check membership
  has(item: T): Promise<boolean>
  
  // Get all items
  get(): Promise<Set<T>>
  
  // Get size
  size(): Promise<number>
  
  // Clear set
  clear(): Promise<void>
  
  // Get set ID
  readonly id: string
}
```

---

## React Hooks

**Package:** `@synckit/sdk/react`

### useSyncDocument

```typescript
import { useSyncDocument, SyncProvider } from '@synckit/sdk/react'

// Wrap your app with SyncProvider
function App() {
  const sync = new SyncKit({ storage: 'indexeddb' })

  return (
    <SyncProvider synckit={sync}>
      <TodoItem id="todo-1" />
    </SyncProvider>
  )
}

function TodoItem({ id }: { id: string }) {
  // Hook gets SyncKit from context, takes only id parameter
  const [todo, { update }, doc] = useSyncDocument<Todo>(id)

  return (
    <div>
      <input
        type="checkbox"
        checked={todo.completed || false}
        onChange={(e) => update({ completed: e.target.checked })}
      />
      <span>{todo.text || ''}</span>
    </div>
  )
}
```

### Hook API

```typescript
function useSyncDocument<T>(
  id: string,
  options?: { autoInit?: boolean }
): [
  T,  // Current document data
  {
    set: <K extends keyof T>(field: K, value: T[K]) => Promise<void>
    update: (updates: Partial<T>) => Promise<void>
    delete: <K extends keyof T>(field: K) => Promise<void>
  },
  SyncDocument<T>  // Raw document instance
]

// Note: Requires <SyncProvider> wrapper to access SyncKit instance
```

### useText

```typescript
import { useText } from '@synckit/sdk/react'

function NoteEditor({ id }: { id: string }) {
  const [text, { insert, delete: del, append }] = useText(sync, id)
  
  return (
    <textarea
      value={text}
      onChange={(e) => {
        // Handle text change
        const newText = e.target.value
        // Compute diff and apply operations
      }}
    />
  )
}
```

### useCounter

```typescript
import { useCounter } from '@synckit/sdk/react'

function LikeButton({ postId }: { postId: string }) {
  const [likes, { increment, decrement }] = useCounter(sync, `likes-${postId}`)
  
  return (
    <button onClick={increment}>
      👍 {likes} likes
    </button>
  )
}
```

### useSet

```typescript
import { useSet } from '@synckit/sdk/react'

function TagList({ docId }: { docId: string }) {
  const [tags, { add, remove }] = useSet<string>(sync, `tags-${docId}`)
  
  return (
    <div>
      {Array.from(tags).map(tag => (
        <span key={tag}>
          {tag}
          <button onClick={() => remove(tag)}>×</button>
        </span>
      ))}
      <button onClick={() => add('new-tag')}>Add Tag</button>
    </div>
  )
}
```

---

## Vue Composables *(Coming Soon)*

**Status:** Not yet implemented in v0.1.0

Vue 3 composables (`@synckit/vue`) are planned for a future release. Currently, only React hooks are available.

**Planned API:**
- `useDocument` - Document composable
- `useText` - Text CRDT composable
- `useCounter` - Counter CRDT composable
- `useSet` - Set CRDT composable

**Workaround for now:** Use the core SDK directly in Vue 3 with `ref()` and `watch()` for reactivity.

---

## Svelte Stores *(Coming Soon)*

**Status:** Not yet implemented in v0.1.0

Svelte stores (`@synckit/svelte`) are planned for a future release. Currently, only React hooks are available.

**Planned API:**
- `documentStore` - Document store
- `textStore` - Text CRDT store
- `counterStore` - Counter CRDT store
- `setStore` - Set CRDT store

**Workaround for now:** Use the core SDK directly in Svelte with `$:` reactivity or Svelte stores wrapping SyncKit documents.

---

## Error Handling

### Error Types

```typescript
class SyncError extends Error {
  code: string
  retryable: boolean
}

// Specific error types
class NetworkError extends SyncError { code = 'NETWORK_ERROR'; retryable = true }
class AuthError extends SyncError { code = 'AUTH_ERROR'; retryable = false }
class PermissionError extends SyncError { code = 'PERMISSION_DENIED'; retryable = false }
class ConflictError extends SyncError { code = 'CONFLICT'; retryable = true }
class StorageError extends SyncError { code = 'STORAGE_ERROR'; retryable = true }
```

### Error Handling Patterns

```typescript
// Try-catch for async operations
try {
  await todo.update({ completed: true })
} catch (error) {
  if (error instanceof NetworkError) {
    // Will be retried automatically if offline queue enabled
    console.log('Update queued for later')
  } else if (error instanceof PermissionError) {
    // User doesn't have write permission
    console.error('Permission denied')
  }
}

// Error event listener
sync.onError((error) => {
  console.error('Sync error:', error)
  if (!error.retryable) {
    // Show error to user
    showErrorNotification(error.message)
  }
})
```

---

## TypeScript Types

### Full Type Definitions

```typescript
// Re-export for convenience
export { SyncKit, Document, Text, Counter, CRDTSet }

// Configuration
export interface SyncKitConfig { /* ... */ }

// Status
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

// Callbacks
export type StatusChangeCallback = (status: ConnectionStatus) => void
export type ErrorCallback = (error: SyncError) => void
export type DocumentCallback<T> = (data: T) => void

// Storage adapters
export type StorageType = 'indexeddb' | 'opfs' | 'sqlite' | 'memory'

// Auth
export type AuthProvider = () => string | Promise<string>
```

---

## Examples

### Complete Todo App

```typescript
import { SyncKit } from '@synckit/sdk'

interface Todo {
  id: string
  text: string
  completed: boolean
}

// Initialize
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',  // For future network sync
  // Note: auth config not yet implemented in v0.1.0
})

// Get all todos (future - query API)
const todos = sync.query<Todo>()
  .where('userId', '==', currentUserId)
  .orderBy('createdAt', 'desc')

// Subscribe to changes
todos.subscribe((allTodos) => {
  renderTodoList(allTodos)
})

// Add new todo
async function addTodo(text: string) {
  const id = generateId()
  const todo = sync.document<Todo>(id)
  await todo.update({
    id,
    text,
    completed: false
  })
}

// Toggle todo
async function toggleTodo(id: string) {
  const todo = sync.document<Todo>(id)
  const current = todo.get()
  await todo.update({ completed: !current.completed })
}
```

### Collaborative Editor

```typescript
import { SyncKit } from '@synckit/sdk'

const sync = new SyncKit({ serverUrl: 'ws://localhost:8080' })
const noteText = sync.text('shared-note')

// Sync with editor
const editor = document.querySelector('textarea')

noteText.subscribe((content) => {
  if (editor.value !== content) {
    editor.value = content
  }
})

editor.addEventListener('input', async () => {
  // Simple approach: replace entire content
  // Advanced: compute diff and send delta
  await noteText.replace(0, await noteText.length(), editor.value)
})
```

---

## Summary

**API Design Principles:**
✅ **Type-safe** - Full TypeScript support  
✅ **Minimal** - 3 core methods per API  
✅ **Consistent** - Same patterns across tiers  
✅ **Framework-friendly** - React/Vue/Svelte adapters  
✅ **Progressive** - Simple by default, powerful when needed  

**What's Next:** Phase 6 TypeScript SDK implementation following this API!
