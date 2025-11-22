# SyncKit Documentation

Welcome to the SyncKit documentation! This guide will help you build offline-first applications with real-time sync.

---

## 🚀 Getting Started

**New to SyncKit?** Start here:

- **[5-Minute Quick Start](guides/getting-started.md)** - Build your first synced app
- **[Installation Guide](guides/getting-started.md#installation)** - Setup instructions
- **[Quick Start Example](guides/getting-started.md#quick-start-your-first-synced-document)** - Copy-paste code

---

## 📖 User Guides

Learn core concepts and patterns:

### Core Concepts
- **[Offline-First Patterns](guides/offline-first.md)** - True offline architecture, IndexedDB foundations, sync strategies
- **[Conflict Resolution](guides/conflict-resolution.md)** - How conflicts work, LWW strategy, custom handlers
- **[Performance Optimization](guides/performance.md)** - Bundle size, memory optimization, Web Workers
- **[Testing Guide](guides/testing.md)** - Unit tests, property-based testing, chaos engineering, E2E

### Advanced Topics
- **[Text CRDTs](api/SDK_API.md#tier-2-text-sync-crdt)** - Collaborative text editing
- **[Custom CRDTs](api/SDK_API.md#tier-3-custom-crdts)** - Counters, sets, lists
- **[Storage Adapters](api/SDK_API.md#storage-adapters)** - IndexedDB, OPFS, SQLite
- **[Server Deployment](../server/typescript/DEPLOYMENT.md)** - Production deployment

---

## 🔄 Migration Guides

Switching from another platform?

- **[From Firebase/Firestore](guides/migration-from-firebase.md)** - Escape vendor lock-in, true offline support
- **[From Supabase](guides/migration-from-supabase.md)** - Add offline functionality (fixes GitHub #357)
- **[From Yjs/Automerge](guides/migration-from-yjs.md)** - Simpler API, WASM portability

---

## 📚 API Reference

Complete API documentation:

### Core SDK
- **[SDK API Reference](api/SDK_API.md)** - Complete API for `SyncKit`, `Document`, `Text`, `Counter`, `Set`
- **[Configuration Options](api/SDK_API.md#configuration-options)** - All SyncKit config options
- **[Storage API](api/SDK_API.md#storage-adapters)** - IndexedDB, memory, OPFS, SQLite

### Framework Adapters
- **[React Hooks](api/SDK_API.md#react-hooks)** - `useSyncDocument`, `useSyncField`, `useSyncDocumentList`
- **[Vue Composables](api/SDK_API.md#vue-composables)** - Vue 3 integration *(coming soon)*
- **[Svelte Stores](api/SDK_API.md#svelte-stores)** - Svelte integration *(coming soon)*

### Server API
- **[Server API Reference](../server/typescript/README.md)** - TypeScript server documentation
- **[Deployment Guide](../server/typescript/DEPLOYMENT.md)** - Production deployment
- **[Authentication](../server/typescript/README.md#authentication)** - JWT + RBAC

---

## 🏗️ Architecture

Understand how SyncKit works:

- **[System Architecture](architecture/ARCHITECTURE.md)** - High-level design, component interactions
- **[Protocol Specification](architecture/ARCHITECTURE.md#protocol-specification)** - Binary protocol, message format
- **[Storage Schema](architecture/ARCHITECTURE.md#storage-schema)** - IndexedDB structure
- **[Security Model](architecture/ARCHITECTURE.md#security-model)** - Authentication, permissions

---

## 💡 Examples

Learn from working examples:

### Basic Examples
- **[Todo App](../examples/todo-app/)** - Simple CRUD with offline support
  - Demonstrates: Document API, offline persistence, real-time sync

### Advanced Examples
- **[Collaborative Editor](../examples/collaborative-editor/)** - Real-time text editing with CodeMirror 6
  - Demonstrates: Text CRDT, multi-document support, offline-first editing, live presence

- **[Project Management App](../examples/project-management/)** - Production-grade kanban board
  - Demonstrates: Drag-and-drop with @dnd-kit, task management, team collaboration, shadcn/ui components

---

## 🎓 Concepts

### Local-First Principles

**What is Local-First?**
- Local database is the source of truth
- Network is optional (optimization, not requirement)
- Instant UI updates (<1ms)
- Works perfectly offline

**Key Benefits:**
- ✅ Speed: No network round-trips for reads
- ✅ Reliability: Works without internet
- ✅ Privacy: Data stays local by default
- ✅ Ownership: You control your data

**[Learn more about offline-first →](guides/offline-first.md)**

### Conflict Resolution

**How Conflicts Work:**
- Two clients edit same field while disconnected
- Both sync when back online
- SyncKit merges automatically

**Strategies:**
- **LWW (Last-Write-Wins)** - Default, works for 95% of cases
- **Custom Handlers** - Custom logic for specific fields
- **Text CRDTs** - Character-level merge for collaborative editing

**[Learn more about conflicts →](guides/conflict-resolution.md)**

### Performance

**Bundle Size (gzipped):**
- **Default variant:** ~53KB (document sync with network protocol)
- **Lite variant:** ~48KB (local-only, no network protocol)
- **Competitive:** Larger than Yjs (~19KB), smaller than Automerge (~60-78KB), much smaller than Firebase (~150KB)

**Operation Speed:**
- Local update: <1ms (371ns single field)
- IndexedDB write: 1-5ms
- Network sync: 10-50ms p95
- Cross-tab sync: <1ms (BroadcastChannel)

**[Learn more about performance →](guides/performance.md)**

---

## 🧪 Testing

Learn how to test offline-first apps:

- **[Unit Testing](guides/testing.md#unit-testing-crdt-operations)** - Test CRDT operations
- **[Property-Based Testing](guides/testing.md#property-based-testing-for-crdts)** - Verify CRDT properties (convergence, commutativity)
- **[Network Testing](guides/testing.md#network-condition-testing)** - Simulate offline, slow networks, packet loss
- **[Chaos Engineering](guides/testing.md#chaos-engineering)** - Random failure injection, network partitions
- **[E2E Testing](guides/testing.md#multi-client-e2e-testing)** - Multi-client scenarios with Playwright

**[Full testing guide →](guides/testing.md)**

---

## 🔧 Troubleshooting

### Common Issues

**Module not found: @synckit/sdk**
```bash
# Core SDK (includes React hooks via @synckit/sdk/react)
npm install @synckit/sdk

# React is a peer dependency if you use the React hooks
npm install react
```

**QuotaExceededError: IndexedDB quota exceeded**
```typescript
// Request persistent storage
if (navigator.storage && navigator.storage.persist) {
  await navigator.storage.persist()
}
```

**Changes not syncing across tabs**
```typescript
// Ensure same document ID in both tabs
const todo = sync.document<Todo>('todo-1')  // Must be identical ID
```

**TypeScript errors**
```typescript
// Define your interface
interface Todo {
  id: string
  text: string
  completed: boolean
  dueDate?: Date  // Optional fields with ?
}

// Use with document
const todo = sync.document<Todo>('todo-1')
```

**[More troubleshooting →](guides/getting-started.md#common-issues)**

---

## 🤝 Community & Support

### Get Help

- **📖 [Documentation](README.md)** - You are here!
- **💬 [Discord Community](#)** - Chat with the community *(coming soon)*
- **🐛 [GitHub Issues](https://github.com/Dancode-188/synckit/issues)** - Report bugs, request features
- **📧 [Email](mailto:danbitengo@gmail.com)** - Direct support for enterprise

### Contributing

We welcome contributions!

- **[Contributing Guide](../CONTRIBUTING.md)** - How to contribute
- **[Code of Conduct](../CODE_OF_CONDUCT.md)** - Community guidelines *(coming soon)*
- **[Roadmap](../ROADMAP.md)** - Development timeline
- **[Architecture Docs](architecture/ARCHITECTURE.md)** - Technical deep-dive

---

## 📊 Status

**Current Phase:** Phase 9 - Documentation & Examples (80% complete)
**Next Release:** v0.1.0 *(~2 weeks)*

### What's Complete ✅

- ✅ Core Rust engine (LWW sync, Text CRDT, protocol)
- ✅ TypeScript SDK (Document API, storage, offline queue)
- ✅ React integration (`useSyncDocument`, `useSyncField`, `useSyncDocumentList`)
- ✅ TypeScript server (WebSocket sync, JWT auth, PostgreSQL)
- ✅ Testing infrastructure (385 tests)
- ✅ Documentation (8 comprehensive guides)
- ✅ Formal verification (TLA+, 118K states)

### What's Next 🚧

- 🚧 Example applications (collaborative editor, project management)
- 🚧 Multi-language servers (Python, Go, Rust)
- 🚧 Vue & Svelte adapters
- 🚧 Advanced storage (OPFS, SQLite)

**[Full roadmap →](../ROADMAP.md)**

---

## 📝 License

MIT License - see [LICENSE](../LICENSE) for details.

---

## 🔗 Quick Links

- **[Main README](../README.md)** - Project overview
- **[Getting Started](guides/getting-started.md)** - 5-minute tutorial
- **[API Reference](api/SDK_API.md)** - Complete API docs
- **[Examples](../examples/)** - Working examples
- **[GitHub](https://github.com/Dancode-188/synckit)** - Source code
- **[Roadmap](../ROADMAP.md)** - Development timeline

---

<div align="center">

**Happy syncing! 🚀**

Questions? Check the [guides](guides/), [API docs](api/), or [open an issue](https://github.com/Dancode-188/synckit/issues).

</div>
