# Migrating from Firebase/Firestore to SyncKit

A comprehensive guide for migrating from Firebase/Firestore to SyncKit for true offline-first architecture and freedom from vendor lock-in.

---

## Table of Contents

1. [Why Migrate from Firebase?](#why-migrate-from-firebase)
2. [Firebase vs SyncKit Comparison](#firebase-vs-synckit-comparison)
3. [Migration Considerations](#migration-considerations)
4. [Data Model Mapping](#data-model-mapping)
5. [Code Migration Patterns](#code-migration-patterns)
6. [Testing Strategy](#testing-strategy)
7. [Deployment Plan](#deployment-plan)
8. [Common Challenges](#common-challenges)

---

## Why Migrate from Firebase?

### Top 5 Pain Points with Firebase

#### 1. Vendor Lock-In Risk

**Problem:** Deep integration with Google infrastructure makes migration difficult and expensive.

> "Firestore is the epitome of vendor lock-in. Everything from your data model to your security rules to your client code is Firebase-specific." — Spencer Pauly, Engineering Lead

**Impact:**
- Can't easily switch providers
- Forced Google Cloud ecosystem
- Migration costs escalate over time
- Limited negotiating power on pricing

#### 2. Unpredictable Pricing

**Problem:** Costs can spike unexpectedly with no change in usage patterns.

**Real-world example:**
- **Before:** $25/month for production app
- **After:** $2,000/month (7,000% increase!)
- **Cause:** Document read charges, no usage change
- **Source:** Medium case study, HackerNews discussions

**Billing surprises:**
- Document reads: $0.036 per 100,000
- Document writes: $0.108 per 100,000
- Network egress: $0.12/GB
- No spending caps available

#### 3. Cache-Based "Offline" (Not True Offline-First)

**Problem:** Firebase persistence is cache-based with strict limitations.

**Limitations:**
- **40MB cache limit** - Exceeded cache is evicted unpredictably
- **500 offline mutations** - Exceeding causes errors
- **Lost on restart** - Cache cleared when app restarts
- **No unlimited storage** - Can't support large offline workloads

**Compare to SyncKit:**
- ✅ Unlimited storage (IndexedDB, ~50GB+ typical)
- ✅ Persistent across restarts
- ✅ Unlimited offline operations
- ✅ True local database, not cache

#### 4. Query Limitations

**Problem:** Firestore queries have strict limitations that block common use cases.

**Limitations:**
- **Single-field range queries only** - Can't query `WHERE age > 18 AND score > 100`
- **No OR queries** - Must use `IN` with array (max 10 values)
- **No wildcard searches** - Full-text search requires Algolia ($)
- **No JOIN operations** - Must denormalize data

> "The range queries only on a single field limitation is irritating." — LeanCode Review

**SyncKit alternative:**
- Query your own database (Postgres, SQLite, etc.)
- No artificial query restrictions
- Use SQL for complex queries

#### 5. Cold Start Issues

**Problem:** Initial load times can be **2-30 seconds** on poor connections.

**GitHub Issue #4691** (8+ years old, 600+ comments):
- "Initial load takes 2 mins for some users"
- "No way to show progress to user"
- "Can't optimize without CDN control"

**SyncKit advantage:**
- Data already local (IndexedDB)
- <100ms initial load from local database
- No network dependency for initial render

---

## Firebase vs SyncKit Comparison

| Feature | Firebase | SyncKit | Winner |
|---------|----------|---------|--------|
| **Offline Support** | ⚠️ Cache (40MB, 500 ops) | ✅ True offline-first (unlimited) | 🏆 SyncKit |
| **Pricing** | 💰 Usage-based, unpredictable | ✅ Self-hosted, predictable | 🏆 SyncKit |
| **Vendor Lock-in** | ❌ Deep Google integration | ✅ Open source, portable | 🏆 SyncKit |
| **Query Capabilities** | ⚠️ Limited (single-field range) | ✅ Use any database (SQL, NoSQL) | 🏆 SyncKit |
| **Bundle Size** | ~150KB gzipped | **~53KB** gzipped (~48KB lite) | 🏆 SyncKit (2.8x smaller) |
| **Cold Start** | ⚠️ 2-30s on slow networks | ✅ <100ms (local data) | 🏆 SyncKit |
| **Managed Backend** | ✅ Fully managed | ⚠️ Self-hosted (or managed soon) | 🏆 Firebase |
| **Auth Integration** | ✅ Built-in | ⚠️ Bring your own (JWT) | 🏆 Firebase |
| **Ecosystem** | ✅ Mature (Cloud Functions, etc.) | ⚠️ Growing | 🏆 Firebase |
| **Data Sovereignty** | ❌ Google Cloud only | ✅ Your infrastructure | 🏆 SyncKit |

**When to migrate:**
- ✅ **CRITICAL:** Cost unpredictability is business risk
- ✅ **CRITICAL:** Regulatory compliance requires data sovereignty
- ✅ **HIGH:** Extended offline capability required
- ✅ **HIGH:** Query limitations blocking features
- ✅ **MEDIUM:** Vendor lock-in concerns

**When to stay:**
- ✅ **Budget <$100/month** and predictable usage
- ✅ **Need managed backend** (no DevOps resources)
- ✅ **Heavy Firebase ecosystem** usage (Functions, ML, etc.)

---

## Migration Considerations

### Pre-Migration Checklist

**Assess your Firebase usage:**

```bash
# Check Firebase usage
firebase projects:list
firebase apps:list
firebase firestore:indexes

# Analyze billing
# Visit Firebase Console → Usage and Billing → View detailed usage
```

**Questions to answer:**

1. **Data volume:** How many documents? Total size?
2. **Read/write patterns:** Reads per day? Writes per day?
3. **Query complexity:** Are you hitting query limitations?
4. **Offline requirements:** Do users need unlimited offline?
5. **Current costs:** Monthly Firebase bill?
6. **Team readiness:** DevOps resources for self-hosting?

### Migration Strategies

#### Strategy 1: Gradual Migration (Recommended)

Run Firebase and SyncKit **side-by-side** during transition:

```typescript
// Hybrid mode: Read from SyncKit, write to both
async function updateTodo(id: string, updates: Partial<Todo>) {
  // Write to both systems
  await Promise.all([
    synckit.document(id).update(updates),  // New system
    firebase.doc(`todos/${id}`).update(updates)  // Old system (backup)
  ])
}

// After migration completes, remove Firebase writes
```

**Timeline:** 2-4 weeks
**Risk:** Low (Firebase as fallback)
**Downtime:** Zero

#### Strategy 2: Big Bang Migration

Migrate all data and code at once:

```bash
# 1. Export Firebase data
firebase firestore:export gs://my-bucket/export

# 2. Transform and import to SyncKit
node scripts/migrate-firebase-to-synckit.js

# 3. Deploy new code with SyncKit
git push production

# 4. Cutover DNS/users
```

**Timeline:** 1 week
**Risk:** High (all or nothing)
**Downtime:** 1-4 hours

#### Strategy 3: Feature-by-Feature

Migrate one feature at a time:

```
Week 1: Migrate todos module
Week 2: Migrate projects module
Week 3: Migrate comments module
...
```

**Timeline:** 4-8 weeks
**Risk:** Medium (complex dual-state management)
**Downtime:** Zero

---

## Data Model Mapping

### Firebase Collection → SyncKit Document

**Firebase:**
```typescript
// Collection structure
todos/
  ├── todo-1
  │   ├── text: "Buy milk"
  │   ├── completed: false
  │   └── createdAt: Timestamp
  └── todo-2
      ├── text: "Buy eggs"
      └── completed: true
```

**SyncKit:**
```typescript
// Document-based structure
sync.document<Todo>('todo-1')
sync.document<Todo>('todo-2')

// Or: Single document with nested structure
sync.document<TodoList>('todos')
// { todos: { 'todo-1': { ... }, 'todo-2': { ... } } }
```

### Firebase onSnapshot → SyncKit subscribe

**Firebase:**
```typescript
const unsubscribe = firebase
  .collection('todos')
  .doc('todo-1')
  .onSnapshot((doc) => {
    console.log('Todo updated:', doc.data())
  })
```

**SyncKit:**
```typescript
const todo = sync.document<Todo>('todo-1')
const unsubscribe = todo.subscribe((data) => {
  console.log('Todo updated:', data)
})
```

### Firebase Transactions → SyncKit Batch

**Firebase:**
```typescript
await firebase.runTransaction(async (transaction) => {
  const todoRef = firebase.collection('todos').doc('todo-1')
  const doc = await transaction.get(todoRef)

  const newCount = doc.data().count + 1
  transaction.update(todoRef, { count: newCount })
})
```

**SyncKit:**
```typescript
// Automatic optimistic locking via LWW
await sync.batch(() => {
  const todo = sync.document<Todo>('todo-1')
  todo.update({ count: currentCount + 1 })
})
```

---

## Code Migration Patterns

### Pattern 1: Real-Time Listener

**Before (Firebase):**
```typescript
import { onSnapshot, doc } from 'firebase/firestore'

function TodoComponent({ id }: { id: string }) {
  const [todo, setTodo] = useState<Todo | null>(null)

  useEffect(() => {
    const todoRef = doc(db, 'todos', id)

    const unsubscribe = onSnapshot(todoRef, (doc) => {
      if (doc.exists()) {
        setTodo({ id: doc.id, ...doc.data() } as Todo)
      }
    })

    return unsubscribe
  }, [id])

  if (!todo) return <div>Loading...</div>

  return <div>{todo.text}</div>
}
```

**After (SyncKit):**
```typescript
import { useSyncDocument } from '@synckit/sdk'

function TodoComponent({ id }: { id: string }) {
  const [todo, { update }] = useSyncDocument<Todo>(id)

  if (!todo) return <div>Loading...</div>

  return <div>{todo.text}</div>
}
```

**Benefits:**
- ✅ 60% less code
- ✅ Automatic cleanup
- ✅ Works offline immediately
- ✅ Type-safe updates included

### Pattern 2: Writing Data with Offline Support

**Before (Firebase):**
```typescript
import { doc, setDoc } from 'firebase/firestore'
import { enableIndexedDbPersistence } from 'firebase/firestore'

// Enable offline
await enableIndexedDbPersistence(db)

async function updateTodo(id: string, updates: Partial<Todo>) {
  try {
    await setDoc(
      doc(db, 'todos', id),
      updates,
      { merge: true }
    )
  } catch (error) {
    if (error.code === 'failed-precondition') {
      console.error('Offline persistence failed')
    }
  }
}
```

**After (SyncKit):**
```typescript
// Offline enabled by default
async function updateTodo(id: string, updates: Partial<Todo>) {
  const todo = sync.document<Todo>(id)
  await todo.update(updates)  // Works offline automatically
}
```

**Benefits:**
- ✅ Offline by default (no setup)
- ✅ No cache limits (40MB → unlimited)
- ✅ Simpler error handling
- ✅ Persistent across restarts

### Pattern 3: Querying Data

**Before (Firebase):**
```typescript
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'

async function getIncompleteTodos() {
  const q = query(
    collection(db, 'todos'),
    where('completed', '==', false),
    orderBy('createdAt', 'desc'),
    limit(10)
  )

  const querySnapshot = await getDocs(q)
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }))
}
```

**After (SyncKit + Your Backend):**
```typescript
// Option 1: Client-side filtering (simple cases)
const todoList = sync.document<TodoList>('todos')
const todos = todoList.get()
const incompleteTodos = Object.values(todos)
  .filter(t => !t.completed)
  .sort((a, b) => b.createdAt - a.createdAt)
  .slice(0, 10)

// Option 2: Server-side queries (complex cases)
// Use your own backend with SQL/NoSQL database
const response = await fetch('/api/todos?completed=false&limit=10')
const todos = await response.json()
```

**Trade-offs:**
- ⚠️ SyncKit doesn't include query language (use your database)
- ✅ No query limitations (single-field range, OR, etc.)
- ✅ Full SQL power if needed
- ✅ Works offline (client-side filtering)

---

## Testing Strategy

### Parallel Testing During Migration

Run Firebase and SyncKit in parallel to verify correctness:

```typescript
describe('Migration parity tests', () => {
  test('Firebase and SyncKit should return same data', async () => {
    const todoId = 'test-todo-1'

    // Read from Firebase
    const firebaseDoc = await firebase
      .collection('todos')
      .doc(todoId)
      .get()
    const firebaseData = firebaseDoc.data()

    // Read from SyncKit
    const synckitDoc = sync.document<Todo>(todoId)
    const synckitData = synckitDoc.get()

    // Should match
    expect(synckitData).toEqual(firebaseData)
  })

  test('Writes should sync to both systems', async () => {
    const todoId = 'test-todo-2'
    const updates = { completed: true }

    // Write to both
    await Promise.all([
      firebase.collection('todos').doc(todoId).update(updates),
      sync.document<Todo>(todoId).update(updates)
    ])

    // Wait for sync
    await new Promise(r => setTimeout(r, 1000))

    // Verify both updated
    const firebaseDoc = await firebase.collection('todos').doc(todoId).get()
    const synckitDoc = sync.document<Todo>(todoId).get()

    expect(firebaseDoc.data().completed).toBe(true)
    expect(synckitDoc.completed).toBe(true)
  })
})
```

### Performance Comparison

```typescript
test('SyncKit should be faster than Firebase for local reads', async () => {
  // Firebase read
  const firebaseStart = performance.now()
  await firebase.collection('todos').doc('todo-1').get()
  const firebaseDuration = performance.now() - firebaseStart

  // SyncKit read
  const synckitStart = performance.now()
  sync.document<Todo>('todo-1').get()
  const synckitDuration = performance.now() - synckitStart

  console.log(`Firebase: ${firebaseDuration.toFixed(2)}ms`)
  console.log(`SyncKit: ${synckitDuration.toFixed(2)}ms`)

  // SyncKit should be significantly faster (local IndexedDB)
  expect(synckitDuration).toBeLessThan(firebaseDuration / 2)
})
```

---

## Deployment Plan

### Phase 1: Dual-Write Setup (Week 1)

**Goal:** Write to both Firebase and SyncKit, read from Firebase

```typescript
// Write to both systems
async function updateTodo(id: string, updates: Partial<Todo>) {
  await Promise.all([
    firebase.collection('todos').doc(id).update(updates),
    sync.document<Todo>(id).update(updates)
  ])
}

// Read from Firebase (existing)
const unsubscribe = firebase
  .collection('todos')
  .doc(id)
  .onSnapshot((doc) => setTodo(doc.data()))
```

**Validation:**
- ✅ SyncKit data matches Firebase
- ✅ No errors in dual-write

### Phase 2: Dual-Read Validation (Week 2)

**Goal:** Read from both, compare results, alert on mismatch

```typescript
async function getTodo(id: string): Promise<Todo> {
  const [firebaseTodo, synckitTodo] = await Promise.all([
    firebase.collection('todos').doc(id).get().then(d => d.data()),
    sync.document<Todo>(id).get()
  ])

  // Compare
  if (!isEqual(firebaseTodo, synckitTodo)) {
    console.error('Data mismatch!', { firebaseTodo, synckitTodo })
    analytics.track('migration_data_mismatch', { id })
  }

  return firebaseTodo  // Still using Firebase as source of truth
}
```

**Validation:**
- ✅ <1% data mismatches
- ✅ SyncKit performance meets targets

### Phase 3: Cutover to SyncKit (Week 3)

**Goal:** Switch to reading from SyncKit

```typescript
// Read from SyncKit (new)
const [todo, { update }] = useSyncDocument<Todo>(id)

// Write to both (safety)
async function saveTodo(id: string, updates: Partial<Todo>) {
  const doc = sync.document<Todo>(id)
  await doc.init()
  await doc.update(updates)

  // Keep Firebase as backup for 1 week
  await firebase.collection('todos').doc(id).update(updates)
}
```

**Validation:**
- ✅ User experience unchanged
- ✅ Performance improved
- ✅ Offline works correctly

### Phase 4: Cleanup (Week 4)

**Goal:** Remove Firebase dependencies

```typescript
// Remove Firebase writes
async function updateTodo(id: string, updates: Partial<Todo>) {
  await sync.document<Todo>(id).update(updates)
  // Firebase code removed
}

// Uninstall Firebase
npm uninstall firebase
```

**Validation:**
- ✅ No Firebase code remaining
- ✅ Bundle size reduced
- ✅ All features working

---

## Common Challenges

### Challenge 1: Firebase Security Rules → JWT Auth

**Firebase:**
```javascript
// Firestore security rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /todos/{todoId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}
```

**SyncKit:**
```typescript
// Server-side JWT validation
const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',  // Optional - for remote sync
  // Note: Built-in auth integration coming in future version
  // For now, handle authentication at the server level
})

// Server validates JWT and checks permissions
```

### Challenge 2: Firebase Cloud Functions → Your Backend

**Firebase:**
```typescript
// Cloud Function
exports.onTodoCreate = functions.firestore
  .document('todos/{todoId}')
  .onCreate(async (snap, context) => {
    const todo = snap.data()
    await sendNotification(todo.userId, 'New todo created')
  })
```

**SyncKit:**
```typescript
// Backend webhook (Node.js/Bun)
sync.on('document-created', async (event) => {
  if (event.collection === 'todos') {
    const todo = event.data
    await sendNotification(todo.userId, 'New todo created')
  }
})
```

### Challenge 3: Firebase Hosting → Your Hosting

**Firebase:**
```bash
# Firebase hosting
firebase deploy --only hosting
```

**SyncKit:**
```bash
# Vercel
vercel deploy

# Netlify
netlify deploy

# Or any static hosting
npm run build
aws s3 sync dist/ s3://my-bucket
```

---

## Summary

**Migration Decision Matrix:**

| Factor | Migrate if... |
|--------|---------------|
| **Cost** | Firebase bill >$500/month OR unpredictable spikes |
| **Offline** | Need unlimited offline storage/operations |
| **Compliance** | Data sovereignty required (GDPR, HIPAA) |
| **Queries** | Hitting Firebase query limitations |
| **Vendor lock-in** | Strategic concern about Google dependency |
| **Bundle size** | Need <50KB bundle (mobile) |

**Expected Benefits After Migration:**

| Metric | Before (Firebase) | After (SyncKit) | Improvement |
|--------|-------------------|-----------------|-------------|
| **Bundle size** | ~150KB | **~53KB** (~48KB lite) | 65% smaller |
| **Offline storage** | 40MB (cache) | Unlimited (IndexedDB) | ∞ |
| **Monthly cost** | $25-$2,000+ | $0 (self-hosted) | 100% savings |
| **Initial load** | 2-30s | <100ms | 20-300x faster |
| **Vendor lock-in** | High | None | Free to migrate |

**Typical Migration Timeline:**

- **Week 1:** Dual-write setup
- **Week 2:** Validation and testing
- **Week 3:** Cutover to SyncKit
- **Week 4:** Cleanup and decommission Firebase

**Total: 4 weeks with zero downtime**

**Next Steps:**

1. Analyze your Firebase usage and costs
2. Set up SyncKit in parallel (dual-write mode)
3. Run validation tests
4. Gradually cutover traffic
5. Monitor and optimize

---

**Freedom from vendor lock-in awaits! 🚀**
