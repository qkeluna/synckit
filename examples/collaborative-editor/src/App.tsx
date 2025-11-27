import { useEffect, useState } from 'react'
// Default variant (45 KB ESM) - includes network sync + offline queue
import { SyncKit } from '@synckit-js/sdk'
import { SyncProvider } from '@synckit-js/sdk/react'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import DocumentTabs from './components/DocumentTabs'
import Editor from './components/Editor'
import ParticipantList from './components/ParticipantList'

// Initialize SyncKit
const sync = new SyncKit({
  storage: 'indexeddb',
  name: 'collaborative-editor',
})

function App() {
  const {
    activeDocumentId,
    documents,
    sidebarOpen,
  } = useStore()

  const [initialized, setInitialized] = useState(false)

  // Initialize SyncKit
  useEffect(() => {
    sync.init().then(() => {
      setInitialized(true)
    }).catch((error) => {
      console.error('Failed to initialize SyncKit:', error)
    })
  }, [])

  if (!initialized) {
    return <div className="app-loading">Initializing...</div>
  }

  const activeDocument = documents.find((d) => d.id === activeDocumentId)

  return (
    <SyncProvider synckit={sync}>
      <div className="app">
        {sidebarOpen && <Sidebar sync={sync} />}

        <div className="main-content">
          <Header />
          <DocumentTabs />

          <div className="editor-container">
            {activeDocument ? (
              <>
                <Editor
                  key={activeDocument.id}
                  documentId={activeDocument.id}
                  language={activeDocument.language}
                />
                <ParticipantList />
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-title">No document selected</div>
                <div className="empty-state-text">
                  Select a document from the sidebar or create a new one
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </SyncProvider>
  )
}

export default App
