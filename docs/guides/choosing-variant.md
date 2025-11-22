# Choosing the Right SyncKit Variant

SyncKit ships with two optimized variants to balance bundle size with functionality. This guide helps you choose the right one for your use case.

---

## 🎯 Quick Decision Tree

```
Start here
│
└─ Do you need network synchronization with a server?
   │
   ├─ YES → Use Default variant
   │         ✅ 49 KB gzipped
   │         ✅ Server sync with WebSocket
   │         ✅ Protocol support (delta sync)
   │         ✅ Recommended for most apps (95% of use cases)
   │
   └─ NO  → Use Lite variant
             ✅ 44 KB gzipped (smallest)
             ✅ Local-only sync
             ✅ Perfect for offline-first apps without backend
             ✅ 5 KB smaller than Default
```

---

## 📦 Variant Comparison

### Default Variant - 49 KB gzipped (Recommended)

**Import:**
```typescript
import { SyncKit } from '@synckit/sdk'
```

**Includes:**
- ✅ Document sync (Last-Write-Wins)
- ✅ Vector clocks (causality tracking)
- ✅ Conflict resolution (automatic)
- ✅ Offline-first (works without network)
- ✅ IndexedDB persistence
- ✅ Network protocol (Protocol Buffers)
- ✅ Delta computation (efficient sync)
- ✅ Server synchronization (WebSocket)
- ✅ DateTime serialization
- ❌ Text CRDT *(coming in v0.2.0)*
- ❌ Counters *(coming in v0.2.0)*
- ❌ Sets *(coming in v0.2.0)*

**Perfect for:**
- Todo applications with server sync
- CRM systems
- Project management tools
- Dashboards and admin panels
- E-commerce applications
- Social media apps (posts, profiles)
- Settings sync across devices
- Form data with server sync
- **Any app that syncs structured data (JSON objects) with a server**

**Real-world examples:**
- [Todo App](../../examples/todo-app/) - Simple CRUD with filters
- [Project Management App](../../examples/project-management/) - Kanban board with drag-and-drop
- [Collaborative Editor](../../examples/collaborative-editor/) - Real-time document editing

**Code example:**
```typescript
import { SyncKit } from '@synckit/sdk'

const sync = new SyncKit({
  serverUrl: 'ws://localhost:8080',
  storage: 'indexeddb'
})

await sync.init()

// Create a document
const task = sync.document<Task>('task-123')
await task.update({
  title: 'Build feature',
  status: 'in-progress',
  assignee: 'alice@example.com',
  dueDate: new Date('2025-12-01')
})

// Syncs automatically to server
// Works offline, queues operations
// Resolves conflicts automatically
```

**When to use:**
- ✅ You're building a CRUD app with server sync
- ✅ Data is structured (objects, arrays, primitives)
- ✅ You want network synchronization
- ✅ You need cross-device sync
- ✅ **This is the recommended default for 95% of applications**

**When NOT to use:**
- ❌ You don't need server sync → Use Lite variant (save 5 KB)

**Bundle size:** 49 KB (WASM) + ~4 KB (SDK) = **~53 KB total**

---

### Lite Variant - 44 KB gzipped (Smallest)

**Import:**
```typescript
import { SyncKit } from '@synckit/sdk/lite'
```

**Includes:**
- ✅ Document sync (Last-Write-Wins)
- ✅ Vector clocks (causality tracking)
- ✅ Conflict resolution (automatic)
- ✅ Offline-first (works without network)
- ✅ IndexedDB persistence
- ❌ Network protocol (Protocol Buffers)
- ❌ Delta computation
- ❌ Server synchronization
- ❌ DateTime serialization
- ❌ Text CRDT
- ❌ Counters
- ❌ Sets

**Perfect for:**
- Local-only applications
- Offline-first apps without backend sync
- Browser extensions
- Electron apps with file-based storage
- Progressive Web Apps (PWAs) with local data
- Apps where bundle size is critical

**Real-world examples:**
- Todo apps with local storage only
- Note-taking apps (without real-time collaboration)
- Settings/preferences management
- Form data persistence (local draft)
- Shopping carts (local-only)

**Code example:**
```typescript
import { SyncKit } from '@synckit/sdk/lite'

const sync = new SyncKit({
  storage: 'indexeddb'
})

await sync.init()

// Create a document
const todo = sync.document<Todo>('todo-123')
await todo.update({
  text: 'Buy milk',
  completed: false,
  priority: 'high'
})

// Works offline, persists to IndexedDB
// No network sync - perfect for local-first
```

**When to use:**
- ✅ You don't need server synchronization
- ✅ Local-only data storage is sufficient
- ✅ Want the absolute smallest bundle
- ✅ Building offline-first without backend

**When NOT to use:**
- ❌ You need server sync → Use Default variant
- ❌ You need cross-device synchronization → Use Default variant

**Bundle size:** 44 KB (WASM) + ~4 KB (SDK) = **~48 KB total**

**Bundle size savings:** 5 KB smaller than Default (10% reduction)

---

## 🔄 Switching Between Variants

Switching between variants is seamless - just change the import:

```typescript
// Before (lite)
import { SyncKit } from '@synckit/sdk/lite'

// After (need server sync)
import { SyncKit } from '@synckit/sdk'

// All core APIs remain exactly the same!
// No breaking changes, just additional features available
```

**Important:** Don't mix imports from different variants in the same app:

```typescript
// ❌ BAD: Imports from multiple variants (duplicates WASM)
import { SyncKit } from '@synckit/sdk'
import { SyncDocument } from '@synckit/sdk/lite'  // Imports separate WASM!

// ✅ GOOD: Import everything from one variant
import { SyncKit, SyncDocument } from '@synckit/sdk'
```

**Migration is non-breaking:**
- Data format is the same across both variants
- A document created with Lite can be opened with Default
- You can upgrade anytime without data migration

---

## 📊 Bundle Size Impact

Understanding the size trade-offs:

| Variant | WASM (gzipped) | SDK (gzipped) | Total | What You Get |
|---------|----------------|---------------|-------|--------------|
| Lite | 44 KB | ~4 KB | **~48 KB** | Local-only sync |
| Default | 49 KB | ~4 KB | **~53 KB** | + Server sync (recommended) |

**Key insights:**
1. SDK overhead is minimal (~4 KB). WASM dominates bundle size.
2. Lite to Default: +5 KB for network protocol support
3. For most apps, the 5 KB is worth it for server sync capability

**Comparison to alternatives (gzipped):**

| Library | Size | Type | Notes |
|---------|------|------|-------|
| **Yjs** | **~19 KB** | Pure JS | Text CRDT, lightest |
| **SyncKit Lite** | **~48 KB** | WASM + JS | Local-only |
| **SyncKit Default** | **~53 KB** | WASM + JS | Recommended |
| **Automerge** | **~60-78 KB** | WASM + JS | Full CRDT suite |
| **Firebase SDK** | **~150 KB** | Pure JS | Plus server dependency |

**SyncKit's Position:**
- 2.8x larger than Yjs (trade-off: WASM portability for multi-language servers)
- Competitive with Automerge (similar size, simpler API for structured data)
- 2.8x smaller than Firebase

---

## 🎓 Common Scenarios

### Scenario 1: Todo Application with Server Sync

**Recommended:** Default variant

**Why:**
- Structured data (tasks, status, due dates)
- Server sync for cross-device access
- Offline-first with automatic sync

**Bundle:** ~53 KB (SyncKit) + ~130 KB (React) = ~183 KB total

**Example:** [Todo App](../../examples/todo-app/)

---

### Scenario 2: Local-Only Todo Application

**Recommended:** Lite variant

**Why:**
- No server needed
- Local storage only
- Smallest bundle size

**Bundle:** ~48 KB (SyncKit) + ~130 KB (React) = ~178 KB total

---

### Scenario 3: Project Management (Kanban)

**Recommended:** Default variant

**Why:**
- Cards are structured data (title, description, status)
- Server sync for team collaboration
- Offline-first with automatic conflict resolution

**Bundle:** ~53 KB (SyncKit) + ~130 KB (React) + ~28 KB (dnd-kit) = ~211 KB total

**Example:** [Project Management App](../../examples/project-management/)

---

### Scenario 4: Collaborative Editor

**Recommended:** Default variant

**Why:**
- Document-level sync for editor content
- Real-time collaboration via server sync
- Works offline with automatic merge

**Bundle:** ~53 KB (SyncKit) + ~130 KB (React) + ~124 KB (CodeMirror) = ~307 KB total

**Example:** [Collaborative Editor](../../examples/collaborative-editor/)

**Note:** This example uses document-level sync (LWW), not character-level Text CRDT. Character-level CRDTs are coming in v0.2.0.

---

### Scenario 5: Offline-First Browser Extension

**Recommended:** Lite variant

**Why:**
- Bundle size is critical for extensions
- Local-only storage (chrome.storage)
- No server sync needed
- Fastest performance

**Bundle:** ~48 KB (smallest possible)

---

### Scenario 6: Cross-Platform Desktop App (Electron)

**Decision depends on sync needs:**

**Use Default if:**
- Need cloud sync across devices
- Multiple users collaborate
- Data backup to server required

**Use Lite if:**
- Local files only (no cloud sync)
- Single user application
- Want smallest bundle

---

## 💡 Best Practices

### 1. Start with Default

Use the Default variant unless you have a specific reason not to. It's the recommended default for 95% of applications.

```typescript
import { SyncKit } from '@synckit/sdk'
```

You only need to consider Lite if:
- Bundle size is absolutely critical (saving 5 KB matters)
- You're 100% sure you'll never need server sync

### 2. Don't Over-Optimize

**Rule of thumb:**
- If you're unsure → Use Default variant
- 5 KB difference is negligible for most apps
- Server sync is valuable even if you don't use it immediately

**Example of premature optimization:**
```typescript
// ❌ BAD: Using Lite to save 5 KB, then realizing you need sync
import { SyncKit } from '@synckit/sdk/lite'
// Later: "We need cross-device sync now..."
// Now you have to refactor

// ✅ GOOD: Use Default from the start
import { SyncKit } from '@synckit/sdk'
// Works offline, adds server sync later with zero code changes
```

### 3. Profile Your App

Use browser dev tools to measure actual bundle impact:

```bash
# Chrome DevTools → Network tab → Filter: WASM
# Look for synckit_core_bg.wasm size (should match variant size)
```

### 4. Consider Your Use Case

| If your app is... | Use variant |
|-------------------|-------------|
| Like Trello | Default |
| Like Todoist | Default |
| Like Notion | Default |
| Like Airtable | Default |
| Like Obsidian (cloud sync) | Default |
| Like Obsidian (local-only) | Lite |
| Browser extension (local) | Lite |
| Offline-first PWA (no server) | Lite |

---

## ❓ FAQ

### Q: Which variant should most apps use?

**A:** Default variant. It's only 5 KB larger than Lite and gives you server sync capability. Even if you don't use server sync immediately, having it available is valuable.

### Q: What's missing from Lite?

**A:** Lite excludes:
- Protocol Buffers (network sync protocol): ~3 KB
- DateTime library (chrono): ~2 KB

These are only needed for network synchronization with a server.

### Q: Will my bundle really be ~50 KB?

**A:** Yes:
- Lite: ~48 KB total (WASM + SDK)
- Default: ~53 KB total (WASM + SDK)

This is just SyncKit. Your total bundle includes:
- SyncKit: ~48-53 KB
- React (if used): ~130 KB
- Other libraries: varies
- Your code: varies

### Q: Can I switch variants later?

**A:** Yes! Switching is seamless:
1. Change your import statement
2. Rebuild your app
3. No data migration needed
4. All existing data works with the new variant

### Q: Do variants affect data format?

**A:** No. Both variants use the same storage format. Data created with one variant can be opened with the other.

### Q: Can I use both variants in one app?

**A:** Not recommended. Each variant includes its own WASM binary, so using both duplicates code (~50 KB overhead). Choose one variant for your entire app.

### Q: What happened to Text/Counter/Set CRDTs?

**A:** These features are implemented in the Rust core but not yet exposed in the SDK. They're planned for v0.2.0. Currently, SyncKit focuses on document-level sync (LWW), which covers 95% of use cases.

### Q: Why is the Collaborative Editor example using Default?

**A:** The collaborative editor uses document-level sync (syncing the entire document content as a field), not character-level Text CRDT. This works well for most collaborative editing scenarios and is available today. True character-level Text CRDT is coming in v0.2.0.

### Q: Is 5 KB really worth worrying about?

**A:** Usually no. For most web apps, 5 KB is negligible. Only optimize for this if:
- You're building a browser extension (strict size limits)
- You're targeting low-end devices with slow networks
- Your total bundle is already very large

Otherwise, use Default and get server sync capability.

---

## 🚀 Next Steps

Ready to build? Here's what to do next:

1. **Choose your variant** using the decision tree above
2. **Install SyncKit:** `npm install @synckit/sdk`
3. **Import your variant:**
   ```typescript
   // Most apps
   import { SyncKit } from '@synckit/sdk'

   // Local-only apps
   import { SyncKit } from '@synckit/sdk/lite'
   ```
4. **Build your app:** Follow our [Getting Started Guide](./getting-started.md)

**Recommended reading:**
- [Getting Started Guide](./getting-started.md) - Build your first app
- [API Reference](../api/SDK_API.md) - Complete API documentation
- [Performance Guide](./performance.md) - Optimization tips
- [Examples](../../examples/) - Real-world applications

---

## 📚 Further Reading

- [Todo App Example](../../examples/todo-app/) - Simple CRUD
- [Project Management Example](../../examples/project-management/) - Kanban board
- [Collaborative Editor Example](../../examples/collaborative-editor/) - Real-time editing
- [Performance Optimization Guide](./performance.md)
- [Offline-First Architecture](./offline-first.md)
- [Conflict Resolution](./conflict-resolution.md)

---

**Still have questions?**
- [GitHub Issues](https://github.com/Dancode-188/synckit/issues)
- [GitHub Discussions](https://github.com/Dancode-188/synckit/discussions)
- Email: danbitengo@gmail.com

---

## 📝 Summary

### Two Variants Available

**Default (Recommended):**
```typescript
import { SyncKit } from '@synckit/sdk'
```
- 49 KB gzipped WASM
- Includes server sync, protocol support
- Perfect for 95% of applications
- Use this unless you have a specific reason not to

**Lite (Size-Optimized):**
```typescript
import { SyncKit } from '@synckit/sdk/lite'
```
- 44 KB gzipped WASM
- Local-only, no server sync
- 5 KB smaller than Default
- Use for offline-first apps without backend

### Decision Matrix

| Need server sync? | Use variant |
|-------------------|-------------|
| Yes or Maybe | Default |
| No, never | Lite |
| Unsure | Default |

**When in doubt, choose Default.** The 5 KB difference is worth the flexibility.
