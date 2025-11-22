# Performance Optimization Guide

Get the most out of SyncKit with proven optimization techniques.

---

## Table of Contents

1. [Performance Philosophy](#performance-philosophy)
2. [Understanding SyncKit Performance](#understanding-synckit-performance)
3. [Measurement and Profiling](#measurement-and-profiling)
4. [Bundle Size Optimization](#bundle-size-optimization)
5. [Memory Optimization](#memory-optimization)
6. [Sync Performance](#sync-performance)
7. [Web Workers for Background Sync](#web-workers-for-background-sync)
8. [Framework-Specific Optimizations](#framework-specific-optimizations)
9. [Real-World Case Studies](#real-world-case-studies)
10. [Monitoring and Maintenance](#monitoring-and-maintenance)

---

## Performance Philosophy

SyncKit is designed for **"fast enough for real-world use, easy to optimize"** rather than absolute peak performance.

### Performance Goals

| Metric | Target | SyncKit Achieves |
|--------|--------|------------------|
| **Local operation** | <1ms | ~371ns (single field) |
| **Merge operation** | <5ms | ~74µs (document merge) |
| **Sync latency** | <100ms | ~10-50ms (p95) |
| **Bundle size** | <100KB | 44-53KB (tiered variants) |
| **Memory** | <10MB | ~3MB (10K documents) |
| **Initial load** | <3s | ~1.2s (cached WASM) |

**SyncKit is already fast. This guide helps you keep it that way.**

---

## Understanding SyncKit Performance

### Performance Characteristics

```
Operation Hierarchy (fastest → slowest):

Memory Read            <1ms    ████
IndexedDB Read        1-5ms    ████████████████
Local Update          <1ms    ████
WASM Processing      <1ms    ████
Cross-tab Broadcast  <1ms    ████
Network Sync        10-100ms  ████████████████████████████████
```

### Where Time Goes

**Typical operation breakdown:**

```typescript
await todo.update({ completed: true })
```

| Phase | Time | % Total | Optimizable? |
|-------|------|---------|-------------|
| **JavaScript → WASM** | 0.05ms | 0.5% | ❌ |
| **WASM merge logic** | 0.07ms | 0.7% | ❌ |
| **IndexedDB write** | 2ms | 20% | ⚠️ Batch writes |
| **BroadcastChannel** | 0.5ms | 5% | ❌ |
| **Network sync** | 10-50ms | 70%+ | ✅ Background |
| **Total (online)** | ~12-52ms | 100% | |
| **Total (offline)** | ~2.6ms | 100% | |

**Key insight:** Network is the bottleneck. Optimize by making it async/background.

---

## Measurement and Profiling

### Measure Before Optimizing

**Golden rule:** Profile first, optimize second.

```typescript
// Measure operation performance
console.time('update-todo')
await todo.update({ completed: true })
console.timeEnd('update-todo')
// Output: "update-todo: 2.3ms"
```

### Performance API

Use the Performance API for precise measurements:

```typescript
// Mark start
performance.mark('sync-start')

await todo.update({ completed: true })

// Mark end and measure
performance.mark('sync-end')
performance.measure('sync-operation', 'sync-start', 'sync-end')

// Get results
const measures = performance.getEntriesByName('sync-operation')
console.log(`Operation took ${measures[0].duration}ms`)

// Clear marks
performance.clearMarks()
performance.clearMeasures()
```

### Chrome DevTools Performance Tab

1. Open DevTools → Performance tab
2. Click Record
3. Perform operations (update documents, sync, etc.)
4. Stop recording
5. Analyze flame graph

**Look for:**
- Long tasks (>50ms)
- Forced reflows
- Memory spikes
- Network waterfall

### Memory Profiling

Track memory usage:

```typescript
// Check memory usage
if (performance.memory) {
  const used = performance.memory.usedJSHeapSize / 1024 / 1024
  const total = performance.memory.totalJSHeapSize / 1024 / 1024
  console.log(`Memory: ${used.toFixed(2)} MB / ${total.toFixed(2)} MB`)
}

// Heap snapshot in DevTools
// Memory tab → Take heap snapshot → Compare snapshots
```

### Network Analysis

Monitor network performance:

```typescript
// Track WebSocket traffic
sync.onMessage((message) => {
  console.log('Message size:', JSON.stringify(message).length, 'bytes')
})

// Track sync latency
let syncStart: number

sync.on('sync-start', () => {
  syncStart = performance.now()
})

sync.on('sync-complete', () => {
  const latency = performance.now() - syncStart
  console.log(`Sync latency: ${latency.toFixed(2)}ms`)
})
```

---

## Bundle Size Optimization

### Bundle Variants

SyncKit offers 2 optimized variants:

```
Variant        WASM      SDK       Total     Use Case
─────────────────────────────────────────────────────────────
Lite           44 KB     ~4 KB    ~48 KB    Local-only sync
Default        49 KB     ~4 KB    ~53 KB    Network sync (recommended)

Compare to competitors (gzipped):
- Yjs:               ~19 KB   (pure JS)
- SyncKit Lite:      ~48 KB   (WASM + JS)
- SyncKit Default:   ~53 KB   (WASM + JS, recommended)
- Automerge:      ~60-78 KB   (WASM + JS)
- Firebase:        ~150 KB   (pure JS)
- RxDB:           ~100 KB+
```

**[Choosing a variant guide →](./choosing-variant.md)**

### Variant Selection

Choose the variant that meets your needs:

```typescript
// Lite (~48 KB) - Local-only sync
import { SyncKit } from '@synckit/sdk/lite'

// Default (~53 KB) - Network sync (recommended)
import { SyncKit } from '@synckit/sdk'
```

**Rule of thumb:** Use Default variant unless you don't need server sync. See the [variant selection guide](./choosing-variant.md) for details.

### Tree-Shaking

Variants are already optimized - you automatically get only what you import:

```typescript
// ✅ Good: Import from one variant
import { SyncKit } from '@synckit/sdk'

// ❌ Bad: Mixing variants (duplicates WASM)
import { SyncKit } from '@synckit/sdk'
import { SyncDocument } from '@synckit/sdk/lite'  // Loads separate WASM!

// ✅ Good: Import everything from one variant
import { SyncKit, SyncDocument } from '@synckit/sdk'
```

**Vite configuration:**

```javascript
// vite.config.js
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks
          'synckit': ['@synckit/sdk'],
          'react-vendor': ['react', 'react-dom']
        }
      }
    }
  }
}
```

### Code Splitting

Load SyncKit on-demand for better initial load:

```typescript
// Lazy load SyncKit
const initSync = async () => {
  const { SyncKit } = await import('@synckit/sdk')
  return new SyncKit({
    serverUrl: 'ws://localhost:8080'
  })
}

// Use in component
function App() {
  const [sync, setSync] = useState<SyncKit | null>(null)

  useEffect(() => {
    initSync().then(setSync)
  }, [])

  if (!sync) return <div>Loading...</div>

  return <TodoApp sync={sync} />
}
```

### Lazy Loading for Rarely-Used Features

Load SyncKit only when needed:

```typescript
// Initial load: No SyncKit yet
// Later: Load when user needs offline sync
async function enableOfflineSync() {
  const { SyncKit } = await import('@synckit/sdk')
  const sync = new SyncKit({
    serverUrl: 'ws://localhost:8080'
  })
  return sync
}
```

**Note:** For most apps, SyncKit is essential from the start, so lazy loading isn't necessary.

### Dynamic Imports for React Adapter

```typescript
// Load React hooks only when needed
const { useSyncDocument } = await import('@synckit/sdk')
```

### WASM Optimization

SyncKit's WASM binary is already optimized with:
- ✅ `wasm-opt -Oz` (maximum size optimization)
- ✅ Brotli compression
- ✅ Streaming compilation
- ✅ Minimal dependencies

**No action needed** - WASM is production-ready out of the box.

---

## Memory Optimization

### Document Lifecycle Management

Unsubscribe from documents when done:

```typescript
// ❌ Memory leak
function TodoItem({ id }) {
  const todo = sync.document<Todo>(id)
  todo.subscribe(data => setTodoData(data))  // Never cleaned up!
}

// ✅ Proper cleanup
function TodoItem({ id }) {
  useEffect(() => {
    const todo = sync.document<Todo>(id)
    const unsubscribe = todo.subscribe(data => setTodoData(data))
    return unsubscribe  // Cleanup on unmount
  }, [id])
}
```

### Garbage Collection Helpers

```typescript
// Clear old documents periodically
async function cleanupOldDocuments() {
  const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000)  // 30 days

  // Get all document IDs
  const docIds = await sync.listDocuments()

  for (const id of docIds) {
    const doc = sync.document(id)
    const data = doc.get()

    if (data.createdAt < cutoff && data.deleted) {
      await sync.deleteDocument(id)  // Permanently delete entire document
    }
  }
}

// Run on app startup
cleanupOldDocuments()
```

### Memory Leak Detection

```typescript
// Track subscription count
let subscriptionCount = 0

const originalSubscribe = sync.document.prototype.subscribe
sync.document.prototype.subscribe = function(callback) {
  subscriptionCount++
  console.log('Subscriptions:', subscriptionCount)

  const unsubscribe = originalSubscribe.call(this, callback)

  return () => {
    subscriptionCount--
    console.log('Subscriptions:', subscriptionCount)
    unsubscribe()
  }
}

// Monitor over time
setInterval(() => {
  console.log('Active subscriptions:', subscriptionCount)
}, 5000)
```

### IndexedDB Storage Limits

Monitor storage usage:

```typescript
async function checkStorageUsage() {
  if (!navigator.storage || !navigator.storage.estimate) {
    console.warn('Storage API not supported')
    return
  }

  const estimate = await navigator.storage.estimate()
  const usedMB = (estimate.usage || 0) / 1024 / 1024
  const quotaMB = (estimate.quota || 0) / 1024 / 1024
  const percentUsed = (usedMB / quotaMB) * 100

  console.log(`Storage: ${usedMB.toFixed(2)} MB / ${quotaMB.toFixed(2)} MB (${percentUsed.toFixed(1)}%)`)

  if (percentUsed > 80) {
    console.warn('Storage usage above 80% - consider cleanup')
    await cleanupOldDocuments()
  }
}

// Check on startup
checkStorageUsage()
```

---

## Sync Performance

### Batch Updates

Combine multiple updates into a single operation:

```typescript
// ❌ Slow: 3 separate syncs
await todo1.update({ completed: true })
await todo2.update({ completed: true })
await todo3.update({ completed: true })

// ✅ Fast: Single batched sync
await sync.batch(() => {
  todo1.update({ completed: true })
  todo2.update({ completed: true })
  todo3.update({ completed: true })
})
// All updates sent in one network round-trip
```

**Performance gain:** 3x fewer network round-trips

### Selective Syncing

Only sync documents you need:

```typescript
// ❌ Sync everything
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080'
})

// ✅ Sync only active project
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',
  syncFilter: (docId) => docId.startsWith('project-123-')
})
```

### Delta Syncing

SyncKit uses **delta syncing** by default—only changed fields are sent:

```typescript
// Document: { id: '1', title: 'Todo', description: '...long text...', completed: false }

// Update only one field
await todo.update({ completed: true })

// Network payload (delta only):
// { id: '1', completed: true }  ← Small!
// Not: { id: '1', title: 'Todo', description: '...', completed: true }  ← Large!
```

**Typical savings:** 80-95% bandwidth reduction

### Debounce Rapid Updates

Avoid syncing on every keystroke:

```typescript
// ❌ Syncs on every keystroke (expensive)
<input
  value={title}
  onChange={(e) => todo.update({ title: e.target.value })}
/>

// ✅ Debounce updates (efficient)
import { debounce } from 'lodash'

const updateTitle = debounce((title: string) => {
  todo.update({ title })
}, 300)  // Wait 300ms after last keystroke

<input
  value={title}
  onChange={(e) => {
    setTitle(e.target.value)  // Update UI immediately
    updateTitle(e.target.value)  // Debounced sync
  }}
/>
```

**Performance gain:** 90%+ reduction in sync operations

---

## Web Workers for Background Sync

Move sync operations to a background thread for 60fps UI:

### Setup Web Worker

```typescript
// sync-worker.ts
import { SyncKit } from '@synckit/sdk'

const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080'
})

// Listen for messages from main thread
self.onmessage = async (event) => {
  const { type, id, data } = event.data

  switch (type) {
    case 'update':
      await sync.document(id).update(data)
      self.postMessage({ type: 'update-complete', id })
      break

    case 'get':
      const result = sync.document(id).get()
      self.postMessage({ type: 'get-result', id, data: result })
      break
  }
}
```

### Use from Main Thread

```typescript
// main.ts
const worker = new Worker(new URL('./sync-worker.ts', import.meta.url), {
  type: 'module'
})

// Send update to worker
worker.postMessage({
  type: 'update',
  id: 'todo-1',
  data: { completed: true }
})

// Listen for results
worker.addEventListener('message', (event) => {
  if (event.data.type === 'update-complete') {
    console.log('Update completed in background')
  }
})
```

**Performance gain:** Main thread stays responsive, no jank

---

## Framework-Specific Optimizations

### React Optimization

#### Use `useMemo` for Expensive Computations

```typescript
function TodoList({ projectId }: { projectId: string }) {
  const [todos, setTodos] = useState<Todo[]>([])

  // ✅ Memoize filtered todos
  const completedTodos = useMemo(
    () => todos.filter(t => t.completed),
    [todos]
  )

  return (
    <div>
      <h2>Completed ({completedTodos.length})</h2>
      {completedTodos.map(todo => <TodoItem key={todo.id} todo={todo} />)}
    </div>
  )
}
```

#### Use `React.memo` to Prevent Re-renders

```typescript
// ✅ Memoize component
const TodoItem = React.memo(({ todo }: { todo: Todo }) => {
  return (
    <div>
      <input type="checkbox" checked={todo.completed} />
      <span>{todo.text}</span>
    </div>
  )
})
```

#### Virtualize Long Lists

```typescript
import { FixedSizeList } from 'react-window'

function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={todos.length}
      itemSize={50}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <TodoItem todo={todos[index]} />
        </div>
      )}
    </FixedSizeList>
  )
}
```

**Performance gain:** Render only visible items (100,000+ items supported)

### Vue Optimization

```vue
<template>
  <div>
    <!-- Use v-memo to skip re-rendering -->
    <TodoItem
      v-for="todo in todos"
      :key="todo.id"
      :todo="todo"
      v-memo="[todo.completed, todo.text]"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { SyncKit } from '@synckit/sdk'

// Note: @synckit/sdk/vue coming in v0.2.0
// For now, use the core SDK with Vue reactivity
const sync = new SyncKit()
const todoList = ref({})

// Memoize filtered results
const completedTodos = computed(() =>
  todoList.value.todos?.filter(t => t.completed) || []
)
</script>
```

### Svelte Optimization

```svelte
<script>
  import { writable, derived } from 'svelte/store'
  import { SyncKit } from '@synckit/sdk'

  // Note: @synckit/sdk/svelte coming in v0.2.0
  // For now, use the core SDK with Svelte stores
  const sync = new SyncKit()
  const todoList = writable({ todos: [] })

  // Derive computed store
  const completedTodos = derived(
    todoList,
    $todoList => $todoList.todos.filter(t => t.completed)
  )
</script>

<!-- Svelte auto-optimizes reactivity -->
<div>
  {#each $completedTodos as todo (todo.id)}
    <TodoItem {todo} />
  {/each}
</div>
```

---

## Real-World Case Studies

### Case Study 1: Todo App

**Before optimization:**
- Bundle size: 245KB gzipped
- Initial load: 4.2s
- Memory: 18MB (1K todos)

**After optimization:**
- ✅ Code splitting → 180KB (-27%)
- ✅ React.memo → Reduced re-renders by 60%
- ✅ Virtualized list → 8MB memory (-56%)

**Result:** 2.1s initial load, 8MB memory

### Case Study 2: Collaborative Editor

**Before optimization:**
- Sync latency: 150ms p95
- Keystroke lag: 50ms
- Memory: 45MB

**After optimization:**
- ✅ Debounced sync → 30ms latency (-80%)
- ✅ Web Worker → 5ms keystroke lag (-90%)
- ✅ WASM optimization → 22MB memory (-51%)

**Result:** Sub-30ms sync, no perceptible lag

---

## Monitoring and Maintenance

### Performance Budget

Set and enforce performance budgets:

```javascript
// vite.config.js
export default {
  build: {
    chunkSizeWarningLimit: 500,  // Warn if chunk >500KB
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        }
      }
    }
  }
}
```

### Lighthouse CI

Automate performance testing:

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI
on: [push]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install && npm run build
      - uses: treosh/lighthouse-ci-action@v9
        with:
          urls: |
            http://localhost:3000
          budgetPath: ./budget.json
          uploadArtifacts: true
```

**budget.json:**
```json
[
  {
    "path": "/*",
    "resourceSizes": [
      {
        "resourceType": "script",
        "budget": 300
      },
      {
        "resourceType": "total",
        "budget": 500
      }
    ],
    "timings": [
      {
        "metric": "interactive",
        "budget": 3000
      },
      {
        "metric": "first-contentful-paint",
        "budget": 1500
      }
    ]
  }
]
```

### Real User Monitoring (RUM)

Track real-world performance:

```typescript
// Send performance metrics to analytics
window.addEventListener('load', () => {
  setTimeout(() => {
    const perfData = performance.getEntriesByType('navigation')[0]

    analytics.track('page_performance', {
      loadTime: perfData.loadEventEnd - perfData.fetchStart,
      domInteractive: perfData.domInteractive - perfData.fetchStart,
      firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime
    })
  }, 0)
})

// Track SyncKit operations
sync.on('operation-complete', (event) => {
  analytics.track('sync_operation', {
    operation: event.type,
    duration: event.duration,
    size: event.size
  })
})
```

---

## Summary

**Key Optimizations:**

1. **Bundle size** - Tree-shaking, code splitting, dynamic imports (<100KB total)
2. **Memory** - Proper cleanup, garbage collection, subscription management (<10MB)
3. **Sync** - Batching, debouncing, delta syncing (80-95% bandwidth reduction)
4. **Rendering** - React.memo, virtualization, Web Workers (60fps UI)
5. **Monitoring** - Performance budgets, Lighthouse CI, RUM (continuous improvement)

**Quick Wins:**

- ✅ Use `React.memo` for TodoItem components
- ✅ Debounce text inputs (300ms)
- ✅ Batch related updates with `sync.batch()`
- ✅ Virtualize lists >100 items
- ✅ Clean up subscriptions in `useEffect`

**Next Steps:**

- Implement [Testing](./testing.md) to catch performance regressions
- Review [Real-World Example](../../examples/real-world/) for production patterns
- Set up Lighthouse CI for continuous monitoring

---

**Fast and getting faster! 🚀**
