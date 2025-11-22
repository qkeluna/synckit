# Conflict Resolution in SyncKit

**⚠️ IMPORTANT - v0.1.0 STATUS:**

This guide describes SyncKit's conflict resolution architecture. However, **network sync features are not yet fully implemented in v0.1.0**.

**What works now:**
- ✅ LWW (Last-Write-Wins) CRDT conflict resolution
- ✅ Local-first data storage
- ✅ Manual document merging via `doc.merge(otherDoc)`

**Not yet implemented (coming in future version):**
- ❌ WebSocket connectivity (`connect`, `disconnect`, `reconnect` methods)
- ❌ Conflict detection callbacks (`onConflict` method)
- ❌ Automatic real-time sync across devices
- ❌ Network-related config options (`offlineQueue`, `syncStrategy`, etc.)

**How to use this guide:** Examples showing network features are marked for reference/planning purposes. Focus on the CRDT concepts and local merging capabilities available now.

---

Learn how SyncKit handles conflicts automatically, and when to implement custom resolution logic.

---

## Table of Contents

1. [What Are Conflicts?](#what-are-conflicts)
2. [Understanding SyncKit's Strategy](#understanding-synckits-strategy)
3. [Common Conflict Scenarios](#common-conflict-scenarios)
4. [Working with Conflicts](#working-with-conflicts)
5. [Text Editing with CRDTs](#text-editing-with-crdts)
6. [Best Practices](#best-practices)
7. [Advanced Topics](#advanced-topics)
8. [Troubleshooting](#troubleshooting)

---

## What Are Conflicts?

A **conflict** occurs when two or more clients make different changes to the same data while disconnected, then sync.

### Visual Example

```
Time →

Client A (Offline):  Task: "Buy milk" → "Buy organic milk"
                                          ↓ (writes locally)

Client B (Offline):  Task: "Buy milk" → "Buy almond milk"
                                          ↓ (writes locally)

Both clients come online and sync...

❓ Which value wins: "Buy organic milk" or "Buy almond milk"?
```

This is a **conflict**—two clients editing the same field with different values.

---

## Understanding SyncKit's Strategy

### Last-Write-Wins (LWW)

SyncKit uses **Last-Write-Wins (LWW)** as the default conflict resolution strategy.

**How it works:**
1. Every update includes a **timestamp** (milliseconds since epoch)
2. When syncing conflicting changes, the **most recent timestamp wins**
3. All clients converge to the same state automatically

```typescript
// Client A updates at 10:00:01.500
await task.update({
  title: 'Buy organic milk'
})  // Timestamp: 1732147201500

// Client B updates at 10:00:02.000 (500ms later)
await task.update({
  title: 'Buy almond milk'
})  // Timestamp: 1732147202000

// After sync: "Buy almond milk" wins (more recent timestamp)
```

### Why LWW?

**Advantages:**
- ✅ **Simple** - Easy to understand and predict
- ✅ **Automatic** - No manual intervention needed
- ✅ **Fast** - O(1) merge complexity
- ✅ **Convergent** - All clients reach same state
- ✅ **No user interruption** - Silent resolution

**Disadvantages:**
- ⚠️ **Data loss possible** - Earlier writes discarded
- ⚠️ **Clock dependency** - Requires synchronized clocks
- ⚠️ **Semantic unaware** - Doesn't understand intent

**When LWW works well:**
- User profile updates
- Task status changes
- Settings and preferences
- UI state (filters, sorting)
- **~95% of real-world conflicts**

**When LWW doesn't work:**
- Text editing (use Text CRDT instead)
- Counters (use PN-Counter instead)
- Financial calculations
- Cumulative data (logs, analytics)

---

## Common Conflict Scenarios

### Scenario 1: Simple Field Update

**Most common** - Two users update different fields.

```typescript
interface Task {
  id: string
  title: string
  assignee: string
  dueDate: string
}

// Client A (offline)
await task.update({ title: 'New title' })

// Client B (offline)
await task.update({ assignee: 'Bob' })

// After sync: No conflict! Different fields merge automatically
// Result: { title: 'New title', assignee: 'Bob', ... }
```

**Outcome:** ✅ No conflict - Different fields don't conflict

### Scenario 2: Same Field Update

**Conflict** - Two users update the same field.

```typescript
// Client A at 10:00:00
await task.update({ title: 'Buy milk' })

// Client B at 10:00:01
await task.update({ title: 'Buy eggs' })

// After sync: Client B wins (LWW)
// Result: { title: 'Buy eggs', ... }
```

**Outcome:** ⚠️ Conflict resolved by LWW - Client B's value wins

### Scenario 3: Field-Level Granularity

SyncKit resolves conflicts at **field level**, not document level.

```typescript
// Client A (offline)
await task.update({
  title: 'Buy milk',      // timestamp: 10:00:00
  priority: 'high'        // timestamp: 10:00:00
})

// Client B (offline)
await task.update({
  title: 'Buy eggs',      // timestamp: 10:00:01
  assignee: 'Bob'         // timestamp: 10:00:01
})

// After sync (field-level merge):
// Result: {
//   title: 'Buy eggs',        // Client B wins (newer)
//   priority: 'high',         // Client A (no conflict)
//   assignee: 'Bob'           // Client B (no conflict)
// }
```

**Outcome:** ✅ Only `title` conflicts - other fields merge independently

### Scenario 4: Delete vs Update

```typescript
// Client A deletes field
await task.update({ dueDate: null })  // timestamp: 10:00:00

// Client B updates field
await task.update({ dueDate: '2025-12-01' })  // timestamp: 10:00:01

// After sync: Client B wins
// Result: { dueDate: '2025-12-01', ... }
```

**Outcome:** ⚠️ Update wins over delete (LWW)

### Scenario 5: Document Delete vs Update

```typescript
// Client A deletes document
await task.delete()  // timestamp: 10:00:00

// Client B updates document
await task.update({ title: 'Updated' })  // timestamp: 10:00:01

// After sync: Document exists with update (LWW)
// Result: { title: 'Updated', ... }
```

**Outcome:** ⚠️ Update wins over delete - document recreated

---

## Working with Conflicts

### Default Behavior (Automatic)

By default, SyncKit handles conflicts automatically with LWW:

```typescript
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',
  conflictResolution: 'lww'  // Default
})

// All conflicts resolve automatically - no action needed
await task.update({ title: 'New title' })
```

**When to use:** 95% of applications - simple data, clear ownership

### Detecting Conflicts

Get notified when conflicts occur:

```typescript
const task = sync.document<Task>('task-123')

// Subscribe to conflict events
task.onConflict((conflict) => {
  console.log('Conflict detected!')
  console.log('Local value:', conflict.local)
  console.log('Remote value:', conflict.remote)
  console.log('Resolved to:', conflict.resolved)
})
```

**Conflict object:**
```typescript
interface Conflict<T> {
  field: keyof T           // Field that conflicted
  local: any               // Your local value
  remote: any              // Remote value from another client
  resolved: any            // Final value after resolution
  localTimestamp: number   // Your timestamp
  remoteTimestamp: number  // Remote timestamp
}
```

### Logging Conflicts

Track conflicts for debugging or analytics:

```typescript
const conflicts: Conflict[] = []

task.onConflict((conflict) => {
  conflicts.push(conflict)

  // Log to analytics
  analytics.track('conflict_occurred', {
    field: conflict.field,
    documentId: task.id,
    resolution: 'lww'
  })
})

// Review conflicts
console.log(`${conflicts.length} conflicts in last hour`)
```

### Custom Conflict Handlers

Implement custom resolution logic for specific fields:

```typescript
const task = sync.document<Task>('task-123', {
  conflictHandlers: {
    // Custom handler for priority field
    priority: (local, remote, localTime, remoteTime) => {
      // Always prefer 'critical' priority
      if (local === 'critical' || remote === 'critical') {
        return 'critical'
      }

      // Otherwise use LWW
      return localTime > remoteTime ? local : remote
    },

    // Custom handler for assignee field
    assignee: (local, remote) => {
      // Never allow unassigning (null)
      if (local === null) return remote
      if (remote === null) return local

      // Otherwise LWW
      return localTime > remoteTime ? local : remote
    }
  }
})
```

### Manual Conflict Resolution

For complex scenarios, resolve conflicts manually:

```typescript
task.onConflict(async (conflict) => {
  if (conflict.field === 'description') {
    // Show UI for user to choose
    const userChoice = await showConflictDialog({
      local: conflict.local,
      remote: conflict.remote
    })

    // Apply user's choice
    await task.update({
      [conflict.field]: userChoice
    })
  }
})
```

---

## Text Editing with CRDTs

For **collaborative text editing**, LWW doesn't work—you need a **Text CRDT**.

### Why LWW Fails for Text

```typescript
// Document: "Hello World"

// Client A inserts at position 6
"Hello World" → "Hello Brave World"

// Client B inserts at position 6
"Hello World" → "Hello Beautiful World"

// LWW result: One insertion lost! ❌
```

### Using SyncKit Text CRDT

```typescript
// Use Text CRDT for collaborative editing
const doc = sync.text('document-123')

// Subscribe to changes
doc.subscribe((content) => {
  editor.setValue(content)
})

// Insert text at position
await doc.insert(6, 'Brave ')

// Both inserts preserved: "Hello Brave Beautiful World" ✅
```

**Text CRDT guarantees:**
- ✅ **All edits preserved** - No character loss
- ✅ **Conflict-free** - Automatic merge
- ✅ **Convergence** - All clients reach same state
- ✅ **Intention preserved** - Character positions maintained

**See:** [Collaborative Editor Example](../../examples/collaborative-editor/)

---

## Best Practices

### 1. Design to Avoid Conflicts

**Minimize conflict surface area:**

```typescript
// ❌ Bad: Single shared description field
interface Task {
  id: string
  description: string  // Multiple users editing = conflicts
}

// ✅ Good: Separate comment thread
interface Task {
  id: string
  description: string  // Owner only
  comments: Comment[]  // Multiple users can add without conflict
}

interface Comment {
  id: string
  author: string
  text: string
  timestamp: number
}
```

### 2. Use Field-Level Ownership

Assign **ownership** to reduce conflicts:

```typescript
interface Task {
  id: string
  title: string        // Creator only
  assignee: string     // Manager only
  status: string       // Assignee only
  notes: string        // Anyone (expect conflicts)
}
```

### 3. Use Timestamps for Ordering

Track when changes happened:

```typescript
interface Task {
  id: string
  title: string
  lastEditedBy: string
  lastEditedAt: number  // Helps users understand why value changed
}

await task.update({
  title: 'New title',
  lastEditedBy: currentUser.id,
  lastEditedAt: Date.now()
})
```

### 4. Test Offline Scenarios

Most conflicts occur when users work offline:

```typescript
// Simulate offline conflict
async function testConflict() {
  const taskA = syncA.document<Task>('task-1')
  const taskB = syncB.document<Task>('task-1')

  // Disconnect both clients
  await syncA.disconnect()
  await syncB.disconnect()

  // Make conflicting changes
  await taskA.update({ title: 'Version A' })
  await taskB.update({ title: 'Version B' })

  // Reconnect and observe resolution
  await syncA.reconnect()
  await syncB.reconnect()

  // Both should converge to same value (LWW)
  const finalA = taskA.get()
  const finalB = taskB.get()

  console.assert(finalA.title === finalB.title, 'Conflict resolution failed')
}
```

### 5. Show Conflict Indicators

Let users know when conflicts occurred:

```tsx
function TaskItem({ taskId }: { taskId: string }) {
  const [task, { update }] = useSyncDocument<Task>(taskId)
  const [conflicted, setConflicted] = useState(false)

  useEffect(() => {
    const doc = sync.document<Task>(taskId)
    const unsubscribe = doc.onConflict(() => {
      setConflicted(true)
      setTimeout(() => setConflicted(false), 3000)
    })
    return unsubscribe
  }, [taskId])

  return (
    <div className={conflicted ? 'conflicted' : ''}>
      {conflicted && <span>⚠️ Merged with changes from another user</span>}
      <input
        value={task.title}
        onChange={(e) => updateTask({ title: e.target.value })}
      />
    </div>
  )
}
```

---

## Advanced Topics

### Clock Skew Handling

LWW depends on accurate timestamps. SyncKit handles clock skew automatically:

```typescript
// Server timestamps used for conflict resolution
// Client timestamps adjusted based on server offset

// Client A: Local time 10:00:00, Server time 10:00:05 (5s ahead)
await task.update({ title: 'A' })  // Adjusted to 10:00:05

// Client B: Local time 10:00:01, Server time 10:00:01 (in sync)
await task.update({ title: 'B' })  // Timestamp: 10:00:01

// Result: Client A wins (adjusted timestamp is later)
```

### Vector Clocks (Future)

For more precise conflict detection, SyncKit will support **vector clocks** in v0.2.0:

```typescript
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',
  conflictResolution: 'vector-clock'  // v0.2.0
})

// Detects causality violations
// Can identify concurrent edits vs sequential edits
```

### Custom CRDT Types

Implement custom CRDTs for specific use cases:

```typescript
// Example: Sum counter (additions never conflict)
class SumCounter {
  private deltas: Map<string, number> = new Map()

  add(clientId: string, amount: number) {
    const current = this.deltas.get(clientId) || 0
    this.deltas.set(clientId, current + amount)
  }

  get value(): number {
    return Array.from(this.deltas.values()).reduce((a, b) => a + b, 0)
  }

  merge(other: SumCounter) {
    // Merge is commutative and associative
    for (const [clientId, delta] of other.deltas) {
      const current = this.deltas.get(clientId) || 0
      this.deltas.set(clientId, Math.max(current, delta))
    }
  }
}
```

---

## Troubleshooting

### Issue: "My changes keep getting overwritten"

**Cause:** Another client editing same field with later timestamp

**Solutions:**
1. **Use field-level ownership** - Assign specific fields to specific users
2. **Implement custom handler** - Preserve important data
3. **Use optimistic locking** - Warn users about concurrent edits

```typescript
// Optimistic locking pattern
interface Task {
  id: string
  title: string
  version: number  // Increment on every update
}

async function updateTask(task: Task, updates: Partial<Task>) {
  const current = sync.document<Task>(task.id).get()

  if (current.version !== task.version) {
    throw new Error('Task was modified by another user. Please refresh.')
  }

  await sync.document<Task>(task.id).update({
    ...updates,
    version: task.version + 1
  })
}
```

### Issue: "Conflicts not detected"

**Cause:** Subscribing after conflict already resolved

**Solution:**
```typescript
// Subscribe before making changes
const task = sync.document<Task>('task-123')
task.onConflict((conflict) => {
  console.log('Conflict:', conflict)
})

// Now make changes
await task.update({ title: 'New' })
```

### Issue: "Text editing loses characters"

**Cause:** Using LWW for text fields instead of Text CRDT

**Solution:**
```typescript
// ❌ Don't use document.update() for collaborative text
await task.update({ description: newText })

// ✅ Use Text CRDT for collaborative editing
const description = sync.text('task-123-description')
await description.insert(position, newText)
```

---

## Summary

**Key Takeaways:**

1. **Most conflicts resolve automatically** - LWW handles 95% of cases
2. **Design to avoid conflicts** - Field-level ownership, separate comment threads
3. **Test offline scenarios** - Most conflicts occur when users work offline
4. **Text is special** - Use Text CRDT for collaborative editing
5. **Know when to intervene** - Custom handlers for business logic
6. **Show users what happened** - Conflict indicators build trust

**Conflict Resolution Decision Tree:**

```
Is it text editing?
  → YES: Use Text CRDT
  → NO: Continue

Is data additive (logs, comments)?
  → YES: No conflicts possible (append-only)
  → NO: Continue

Do different users own different fields?
  → YES: No conflicts likely (separate ownership)
  → NO: Continue

Are conflicts acceptable (last write wins)?
  → YES: Use default LWW
  → NO: Implement custom handler or manual resolution
```

**Next Steps:**

- Learn about [Performance Optimization](./performance.md)
- Explore [Testing Conflict Scenarios](./testing.md)
- See [Collaborative Editor Example](../../examples/collaborative-editor/)

---

**Conflicts resolved! 🎉**
