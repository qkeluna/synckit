# Collaborative Editor Example

A production-ready collaborative Markdown and code editor built with SyncKit, React, and CodeMirror 6. This example demonstrates SyncKit's offline-first capabilities, real-time sync, and conflict-free collaboration.

![Bundle Size](https://img.shields.io/badge/bundle-~330KB%20uncompressed%20|%20~119KB%20gzipped-success)
![SyncKit](https://img.shields.io/badge/synckit-49KB-brightgreen)
![React](https://img.shields.io/badge/react-18.2-blue)
![TypeScript](https://img.shields.io/badge/typescript-5.0-blue)

## Features

### Core Capabilities

- **Real-time Collaboration**: Multiple users can edit the same document simultaneously with automatic conflict resolution
- **Offline-First**: Works completely offline, syncs automatically when connection is restored
- **Multi-Document Support**: Create, edit, and switch between multiple documents
- **Syntax Highlighting**: Support for Markdown, JavaScript, and TypeScript with CodeMirror 6
- **Persistent Storage**: All documents saved to IndexedDB for instant load times
- **Live Presence**: See who else is actively editing (when connected to sync server)
- **Tab Management**: VSCode-like tab interface for managing open documents
- **Connection Status**: Clear visual feedback of online/offline state

### Technical Highlights

- **Optimized Bundle**: ~119KB gzipped (CodeMirror 6 + React + SyncKit)
- **Full-Featured**: Uses SyncKit default (49 KB) - includes text CRDT + all features
- **Type-Safe**: Full TypeScript support throughout
- **Modern Stack**: React 18, Vite, CodeMirror 6, Zustand
- **Production-Ready**: Comprehensive error handling, accessibility, and UX polish

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The app will be available at `http://localhost:5173`.

## Architecture

### Component Structure

```
src/
├── components/
│   ├── Header.tsx           # Top bar with menu, title, connection status
│   ├── Sidebar.tsx          # Document list and creation
│   ├── DocumentTabs.tsx     # Tab bar for open documents
│   ├── Editor.tsx           # CodeMirror 6 editor with SyncKit integration
│   └── ParticipantList.tsx  # Live user presence
├── store.ts                 # Zustand state management
├── types.ts                 # TypeScript interfaces
├── App.tsx                  # Main application component
└── main.tsx                 # Entry point
```

### State Management

This example uses [Zustand](https://github.com/pmndrs/zustand) (3KB) for UI state management:

```typescript
const useStore = create<AppState>((set) => ({
  documents: [...],
  openDocuments: [...],
  activeDocumentId: 'welcome',
  participants: new Map(),
  connectionStatus: 'disconnected',
  // Actions
  addDocument: (doc) => set((state) => ({ ... })),
  openDocument: (id) => set((state) => ({ ... })),
  // ... more actions
}))
```

Document content is managed by SyncKit, which handles:
- Persistence to IndexedDB
- Conflict-free merging of concurrent edits
- Sync with remote server (when configured)
- Offline queue management

### SyncKit Integration

The editor uses SyncKit's React hooks for seamless sync:

```typescript
import { useDocument } from '@synckit/react'

function Editor({ documentId, sync }) {
  const [doc, setDoc] = useDocument<{ content: string }>(sync, documentId)

  // Update document on editor change
  const handleChange = (newContent: string) => {
    setDoc({ content: newContent })
  }

  // doc.content automatically updates when remote changes arrive
  return <CodeMirrorEditor value={doc?.content} onChange={handleChange} />
}
```

#### Key Integration Points

1. **Document Creation** (`Sidebar.tsx:18-34`)
   ```typescript
   const handleCreateDocument = () => {
     const id = `doc-${Date.now()}`
     const doc = sync.document<{ content: string }>(id)
     doc.set({ content: '# New Document\n\nStart typing...' })
     addDocument({ id, title: 'Untitled.md', ... })
   }
   ```

2. **Real-time Sync** (`Editor.tsx:46-54`)
   ```typescript
   EditorView.updateListener.of((update) => {
     if (update.docChanged) {
       setDoc({ content: update.state.doc.toString() })
     }
   })
   ```

3. **Connection Monitoring** (`App.tsx:25-31`)
   ```typescript
   useEffect(() => {
     const unsubscribe = sync.onStatusChange((status) => {
       setConnectionStatus(status)
     })
     return unsubscribe
   }, [])
   ```

## Configuration

### Local-Only Mode (Default)

By default, the editor runs in local-only mode with IndexedDB persistence:

```typescript
const sync = new SyncKit({
  storage: 'indexeddb',
})
```

### Server Sync Mode

To enable real-time collaboration across devices, uncomment the server URL:

```typescript
const sync = new SyncKit({
  storage: 'indexeddb',
  url: 'ws://localhost:8080', // SyncKit sync server
})
```

Then start the sync server:

```bash
# In the root SyncKit directory
cd server/node
npm install
npm start
```

### Storage Options

SyncKit supports multiple storage backends:

```typescript
// IndexedDB (default, recommended for web)
const sync = new SyncKit({ storage: 'indexeddb' })

// Memory (for testing, data lost on refresh)
const sync = new SyncKit({ storage: 'memory' })

// OPFS (Origin Private File System, Chrome 86+)
const sync = new SyncKit({ storage: 'opfs' })
```

## How It Works

### Offline-First Architecture

1. **Local Database as Source of Truth**
   - All edits are immediately written to IndexedDB
   - UI updates optimistically (no loading spinners)
   - App works identically online and offline

2. **Background Sync**
   - When online, SyncKit syncs changes in the background
   - Delta sync minimizes bandwidth usage
   - Binary Protobuf protocol for efficiency

3. **Conflict Resolution**
   - Uses Last-Write-Wins (LWW) strategy
   - Each change tagged with timestamp + client ID
   - Deterministic resolution ensures all clients converge

### Document Lifecycle

```
User creates document
       ↓
SyncKit creates CRDT document object
       ↓
Document saved to IndexedDB
       ↓
User makes edits → Local state updated → IndexedDB updated
       ↓
(If online) Background sync to server
       ↓
Server broadcasts to other clients
       ↓
Other clients merge changes conflict-free
```

## Bundle Analysis

### Why SyncKit?

This collaborative editor needs **real-time text editing** with multiple users typing simultaneously. SyncKit provides:
- ✅ Text CRDT (character-level collaboration)
- ✅ Conflict-free convergence (no lost edits)
- ✅ Offline-first architecture
- ✅ Real-time collaboration
- ✅ All features in 49 KB

**Full-featured collaborative editing** in a lightweight package.

### Production Bundle Size

```
Component                    Uncompressed    Gzipped
────────────────────────────────────────────────────
CodeMirror 6                     410 KB      124 KB
React 18 + ReactDOM              142 KB       45 KB
SyncKit (WASM + SDK)              97 KB       49 KB
Zustand                            9 KB        3 KB
Application Code                  22 KB        8 KB
────────────────────────────────────────────────────
Total                           ~330 KB     ~119 KB
```

### Size-Critical Apps?

**Need smaller bundle?** Use SyncKit Lite (44 KB):
```typescript
import { SyncKit } from '@synckit/sdk/lite'  // Local-only, 44 KB
```

**Trade-off:** No server sync or Text CRDT. For collaborative editors, the default variant (49 KB) is essential.

### Why These Choices?

- **CodeMirror 6** (124KB) vs Monaco (2MB+): 94% smaller, same functionality
- **Zustand** (3KB) vs Redux (20KB+): 85% smaller, simpler API
- **SyncKit** (49KB): Full CRDT collaboration, 1.3x smaller than Yjs (65 KB)

## Extending This Example

### Adding New Languages

```typescript
import { python } from '@codemirror/lang-python'

const getLanguageExtension = () => {
  switch (language) {
    case 'python':
      return python()
    // ...
  }
}
```

### Custom Themes

```typescript
EditorView.theme({
  '&': { backgroundColor: '#1e1e1e' }, // Dark background
  '.cm-content': { color: '#d4d4d4' }, // Light text
  '.cm-gutters': { backgroundColor: '#252526' },
  // ... more theme rules
})
```

### Collaborative Cursors

```typescript
// Track cursor positions in SyncKit
const [presence, setPresence] = usePresence(sync, documentId)

const handleCursorMove = (pos: number) => {
  setPresence({ cursor: pos, color: currentUser.color })
}

// Render remote cursors as decorations
const remoteCursors = EditorView.decorations.of(
  Array.from(presence.values()).map(p =>
    Decoration.widget({ widget: new CursorWidget(p) }).range(p.cursor)
  )
)
```

### Document Export

```typescript
const handleExport = async () => {
  const doc = sync.document<{ content: string }>(documentId)
  const blob = new Blob([doc.get().content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${activeDocument.title}`
  a.click()
}
```

## Production Deployment

### Vite Build Optimization

The included `vite.config.ts` already optimizes for production:

```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'codemirror': ['codemirror', '@codemirror/commands', '@codemirror/lang-javascript', '@codemirror/lang-markdown'],
          'vendor': ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
})
```

This creates separate chunks for:
- **codemirror.js**: CodeMirror bundle (cached separately)
- **vendor.js**: React + Zustand (rarely changes)
- **index.js**: Application code (changes frequently)

### Hosting Recommendations

**Static Hosting** (for local-only mode):
- Vercel, Netlify, GitHub Pages
- No server required
- Zero configuration

**With Sync Server**:
- Frontend: Any static host
- Backend: Deploy SyncKit server to Railway, Fly.io, or VPS
- Use wss:// (WebSocket over TLS) in production

### Environment Variables

```bash
# .env.production
VITE_SYNCKIT_SERVER=wss://sync.yourdomain.com
```

```typescript
const sync = new SyncKit({
  storage: 'indexeddb',
  url: import.meta.env.VITE_SYNCKIT_SERVER,
})
```

## Troubleshooting

### Editor Content Not Syncing

**Check connection status**: Look at the status indicator in the header
- Green dot = Connected and syncing
- Yellow dot = Connecting
- Red dot = Offline (local-only mode)

**Verify server configuration**: Ensure `url` is set in SyncKit initialization

### Document Not Persisting

**Check IndexedDB**: Open DevTools → Application → IndexedDB → synckit
- Should see databases for each document
- Try clearing and reloading if corrupted

**Check browser support**: IndexedDB required (all modern browsers)

### Large Documents Lagging

**Enable virtualization**: For documents >10,000 lines, consider adding:

```typescript
import { drawSelection } from '@codemirror/view'

const extensions = [
  basicSetup,
  drawSelection({ cursorBlinkRate: 1000 }),
  EditorView.theme({ '.cm-content': { minHeight: '100vh' } }),
]
```

## Learn More

- **SyncKit Documentation**: `../../docs/README.md`
- **Getting Started Guide**: `../../docs/guides/getting-started.md`
- **Offline-First Guide**: `../../docs/guides/offline-first.md`
- **API Reference**: `../../docs/api/sdk.md`

## License

This example is part of the SyncKit project and is licensed under the MIT License.
