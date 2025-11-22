# SyncKit SDK API Design

**Version:** 0.1.0
**Last Updated:** November 23, 2025

---

## ⚠️ v0.1.0 - IMPLEMENTATION STATUS

**SyncKit v0.1.0 is a LOCAL-FIRST library.** Network sync features are documented but **NOT YET IMPLEMENTED**.

### ✅ Implemented in v0.1.0

**Core SDK (`@synckit/sdk`):**
- ✅ `SyncKit` class: `init()`, `document()`, `listDocuments()`, `deleteDocument()`, `clearAll()`
- ✅ `SyncDocument<T>` with LWW-CRDT
- ✅ Document methods: `init()`, `get()`, `getField()`, `set()`, `update()`, `delete()`, `subscribe()`, `merge()`, `toJSON()`, `dispose()`
- ✅ IndexedDB & Memory storage adapters
- ✅ Custom storage adapter interface

**React (`@synckit/sdk/react`):**
- ✅ `SyncProvider`, `useSyncKit()`, `useSyncDocument()`, `useSyncField()`, `useSyncDocumentList()`

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

// Minimal configuration (auto-detects IndexedDB in browser, Memory in Node)
const sync = new SyncKit()
await sync.init()  // ✅ REQUIRED before using documents!

// With server URL (accepted but not used in v0.1.0)
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080'
})
await sync.init()

// Full v0.1.0 configuration
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',  // ⚠️ Accepted but not yet used
  storage: 'indexeddb',              // ✅ WORKS: 'indexeddb' | 'memory'
  name: 'my-app',                    // ✅ WORKS: Storage namespace
  clientId: 'user-123',              // ✅ WORKS: Auto-generated if omitted
})
await sync.init()
```

### Configuration Options

```typescript
// ✅ v0.1.0 ACTUAL interface
interface SyncKitConfig {
  // Storage adapter (✅ WORKS in v0.1.0)
  storage?: 'indexeddb' | 'memory' | StorageAdapter

  // Storage namespace (✅ WORKS in v0.1.0)
  name?: string

  // Server URL (⚠️ ACCEPTED but not used in v0.1.0)
  serverUrl?: string

  // Client ID (✅ WORKS - auto-generated if omitted)
  clientId?: string
}

// ❌ Future options (NOT in v0.1.0):
// auth, offlineQueue, reconnect, batchInterval, logLevel
```

### SyncKit Methods

```typescript
class SyncKit {
  // ✅ Initialize WASM and storage (REQUIRED before use)
  init(): Promise<void>

  // ✅ Get or create a document (documents are cached)
  document<T extends Record<string, unknown>>(id: string): SyncDocument<T>

  // ✅ List all document IDs in storage
  listDocuments(): Promise<string[]>

  // ✅ Delete entire document by ID
  deleteDocument(id: string): Promise<void>

  // ✅ Clear all documents from storage
  clearAll(): Promise<void>

  // ✅ Get the client ID
  getClientId(): string

  // ✅ Check if initialized
  isInitialized(): boolean
}

// ❌ NOT in v0.1.0: connect(), disconnect(), status, onStatusChange(), reconnect()
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

// ✅ REQUIRED: Initialize SyncKit first
const sync = new SyncKit({ storage: 'indexeddb' })
await sync.init()  // MUST call before using documents!

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

// Delete a field
await todo.delete('dueDate')

// Unsubscribe when done
unsubscribe()
```

### Document API

```typescript
// ✅ v0.1.0 ACTUAL API
class SyncDocument<T extends Record<string, unknown>> {
  // Initialize document (auto-called by sync.document(), but can call manually)
  init(): Promise<void>

  // Subscribe to document changes
  subscribe(callback: (data: T) => void): () => void

  // Get current value (synchronous)
  get(): T

  // Get a single field value
  getField<K extends keyof T>(field: K): T[K] | undefined

  // Set a single field
  set<K extends keyof T>(field: K, value: T[K]): Promise<void>

  // Update document (partial update)
  update(changes: Partial<T>): Promise<void>

  // Delete a field (NOT the whole document!)
  delete<K extends keyof T>(field: K): Promise<void>

  // Merge another document into this one
  merge(other: SyncDocument<T>): Promise<void>

  // Export to plain object
  toJSON(): T

  // Get document ID
  getId(): string

  // Get number of fields
  getFieldCount(): number

  // Clean up subscriptions
  dispose(): void
}

// To delete entire document, use: sync.deleteDocument(id)
```

### Batch Operations *(Not in v0.1.0)*

```typescript
// ❌ NOT IMPLEMENTED - batch() method doesn't exist in v0.1.0
await sync.batch(() => {
  todo1.update({ completed: true })
  todo2.update({ completed: true })
  todo3.update({ completed: false })
})
```

### Query API *(Not in v0.1.0)*

```typescript
// ❌ NOT IMPLEMENTED - query() method doesn't exist in v0.1.0
const todos = sync.query<Todo>()
  .where('completed', '==', false)
  .orderBy('dueDate', 'asc')
  .limit(10)

todos.subscribe((results) => {
  console.log('Incomplete todos:', results)
})
```

---

## Tier 2: Text Sync (CRDT) ❌ *(NOT in v0.1.0 - Coming in v0.2.0)*

**Use Cases:** Collaborative editors, note apps, documentation tools (15% of applications)

**⚠️ WARNING:** The Text CRDT API is **NOT implemented in v0.1.0**. This is the **proposed** API design for v0.2.0.

### Basic Usage (Future API)

```typescript
// ❌ NOT IMPLEMENTED - This code will NOT work in v0.1.0
const noteText = sync.text('note-456')  // ❌ text() method doesn't exist

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

### Text API (Proposed for v0.2.0)

```typescript
// ❌ NOT IMPLEMENTED - Proposed API only
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

## Tier 3: Custom CRDTs ❌ *(NOT in v0.1.0 - Coming in v0.2.0)*

**Use Cases:** Counters, sets, lists, whiteboards (5% of applications)

**⚠️ WARNING:** Counter and Set APIs are **NOT implemented in v0.1.0**. These are **proposed** API designs for v0.2.0.

### Counter (PN-Counter) - Proposed API

```typescript
// ❌ NOT IMPLEMENTED - This code will NOT work in v0.1.0
const likesCounter = sync.counter('likes-789')  // ❌ counter() method doesn't exist

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

### Counter API (Proposed for v0.2.0)

```typescript
// ❌ NOT IMPLEMENTED - Proposed API only
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

### Set (OR-Set) - Proposed API

```typescript
// ❌ NOT IMPLEMENTED - This code will NOT work in v0.1.0
const tags = sync.set<string>('tags-101')  // ❌ set() method doesn't exist

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

### Set API (Proposed for v0.2.0)

```typescript
// ❌ NOT IMPLEMENTED - Proposed API only
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

### Setup

```typescript
import { useState, useEffect } from 'react'
import { SyncProvider } from '@synckit/sdk/react'
import { SyncKit } from '@synckit/sdk'

// ✅ Initialize SyncKit and wrap app with provider
function App() {
  const [sync] = useState(() => new SyncKit({ storage: 'indexeddb' }))

  useEffect(() => {
    sync.init()  // Initialize on mount
  }, [sync])

  return (
    <SyncProvider synckit={sync}>
      <TodoItem id="todo-1" />
    </SyncProvider>
  )
}
```

### useSyncDocument ✅ v0.1.0

```typescript
function TodoItem({ id }: { id: string }) {
  // Hook gets SyncKit from context, takes only id parameter
  const [todo, { set, update, delete: deleteField }, doc] = useSyncDocument<Todo>(id)

  return (
    <div>
      <input
        type="checkbox"
        checked={todo.completed || false}
        onChange={(e) => set('completed', e.target.checked)}
      />
      <span>{todo.text || ''}</span>
      <button onClick={() => deleteField('completed')}>Clear</button>
    </div>
  )
}

// API signature
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
```

### useSyncField ✅ v0.1.0

```typescript
// Sync a single field instead of entire document
function CompletedCheckbox({ id }: { id: string }) {
  const [completed, setCompleted] = useSyncField<Todo, 'completed'>(id, 'completed')

  return (
    <input
      type="checkbox"
      checked={completed || false}
      onChange={(e) => setCompleted(e.target.checked)}
    />
  )
}

// API signature
function useSyncField<T, K extends keyof T>(
  id: string,
  field: K
): [T[K] | undefined, (value: T[K]) => Promise<void>]
```

### useSyncDocumentList ✅ v0.1.0

```typescript
// List all document IDs
function DocumentList() {
  const documentIds = useSyncDocumentList()

  return (
    <ul>
      {documentIds.map(id => (
        <li key={id}>{id}</li>
      ))}
    </ul>
  )
}

// API signature
function useSyncDocumentList(): string[]
```

### useSyncKit ✅ v0.1.0

```typescript
// Access SyncKit instance from context
function CustomComponent() {
  const sync = useSyncKit()

  const handleClearAll = async () => {
    await sync.clearAll()
  }

  return <button onClick={handleClearAll}>Clear All</button>
}
```

### useText ❌ NOT in v0.1.0

```typescript
// ❌ NOT IMPLEMENTED - Text CRDT not in v0.1.0
import { useText } from '@synckit/sdk/react'

function NoteEditor({ id }: { id: string }) {
  const [text, { insert, delete: del, append }] = useText(id)
  // ...
}
```

### useCounter ❌ NOT in v0.1.0

```typescript
// ❌ NOT IMPLEMENTED - Counter CRDT not in v0.1.0
import { useCounter } from '@synckit/sdk/react'

function LikeButton({ postId }: { postId: string }) {
  const [likes, { increment, decrement }] = useCounter(`likes-${postId}`)
  // ...
}
```

### useSet ❌ NOT in v0.1.0

```typescript
// ❌ NOT IMPLEMENTED - Set CRDT not in v0.1.0
import { useSet } from '@synckit/sdk/react'

function TagList({ docId }: { docId: string }) {
  const [tags, { add, remove }] = useSet<string>(`tags-${docId}`)
  // ...
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
// ✅ v0.1.0 ACTUAL error types
class SyncKitError extends Error {
  constructor(message: string, public code: string) {
    super(message)
  }
}

// Specific error types in v0.1.0
class StorageError extends SyncKitError { /* Storage operations */ }
class WASMError extends SyncKitError { /* WASM initialization */ }
class DocumentError extends SyncKitError { /* Document operations */ }

// ❌ NOT in v0.1.0: NetworkError, AuthError, PermissionError, ConflictError
```

### Error Handling Patterns

```typescript
// ✅ v0.1.0: Try-catch for async operations
try {
  await sync.init()
  await todo.update({ completed: true })
} catch (error) {
  if (error instanceof StorageError) {
    console.error('Storage failed:', error.message)
  } else if (error instanceof WASMError) {
    console.error('WASM initialization failed:', error.message)
  } else if (error instanceof SyncKitError) {
    console.error('SyncKit error:', error.code, error.message)
  }
}

// ❌ NOT in v0.1.0: sync.onError() event listener doesn't exist
```

---

## TypeScript Types

### Full Type Definitions (v0.1.0 Actual Exports)

```typescript
// ✅ Core classes
export { SyncKit } from '@synckit/sdk'
export { SyncDocument } from '@synckit/sdk'

// ✅ Storage adapters
export { MemoryStorage, IndexedDBStorage, createStorage } from '@synckit/sdk'
export type { StorageAdapter, StoredDocument } from '@synckit/sdk'

// ✅ Configuration and types
export type {
  SyncKitConfig,
  DocumentData,
  FieldPath,
  SubscriptionCallback,
  Unsubscribe,
  QueuedOperation,
  QueueConfig
} from '@synckit/sdk'

// ✅ Error classes
export {
  SyncKitError,
  StorageError,
  WASMError,
  DocumentError
} from '@synckit/sdk'

// ✅ React hooks (requires React)
export {
  SyncProvider,
  useSyncKit,
  useSyncDocument,
  useSyncField,
  useSyncDocumentList
} from '@synckit/sdk/react'
export type { SyncProviderProps } from '@synckit/sdk/react'

// ❌ NOT in v0.1.0: Text, Counter, CRDTSet, ConnectionStatus,
// AuthProvider, StatusChangeCallback, ErrorCallback
```

---

## Examples

### Complete Todo App (v0.1.0 - Local-First)

```typescript
import { SyncKit } from '@synckit/sdk'

interface Todo {
  id: string
  text: string
  completed: boolean
}

// ✅ Initialize (REQUIRED)
const sync = new SyncKit({
  storage: 'indexeddb',
  name: 'todo-app'
})
await sync.init()

// ✅ Add new todo
async function addTodo(text: string) {
  const id = crypto.randomUUID()
  const todo = sync.document<Todo>(id)
  await todo.update({
    id,
    text,
    completed: false
  })
}

// ✅ Toggle todo
async function toggleTodo(id: string) {
  const todo = sync.document<Todo>(id)
  const current = todo.get()
  await todo.update({ completed: !current.completed })
}

// ✅ List all todos
async function listTodos() {
  const ids = await sync.listDocuments()
  return ids.map(id => sync.document<Todo>(id).get())
}

// ✅ Delete todo
async function deleteTodo(id: string) {
  await sync.deleteDocument(id)
}
```

### Collaborative Editor *(Not in v0.1.0)*

```typescript
// ❌ NOT IMPLEMENTED - Text CRDT and network sync not in v0.1.0
import { SyncKit } from '@synckit/sdk'

const sync = new SyncKit({ serverUrl: 'ws://localhost:8080' })
await sync.init()

const noteText = sync.text('shared-note')  // ❌ text() doesn't exist

noteText.subscribe((content) => {
  // ...
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
