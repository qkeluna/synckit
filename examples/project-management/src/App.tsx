import { useEffect, useState } from 'react'
// Default variant (49 KB) - full-featured, perfect for production apps
import { SyncKit } from '@synckit/sdk'
import { useStore } from './store'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import KanbanBoard from './components/KanbanBoard'
import TaskModal from './components/TaskModal'
import TeamPresence from './components/TeamPresence'

// Initialize SyncKit
const sync = new SyncKit({
  storage: 'indexeddb',
  // url: 'ws://localhost:8080', // Uncomment to enable server sync
})

function App() {
  const { sidebarOpen, taskModalOpen } = useStore()
  const [syncReady, setSyncReady] = useState(false)

  // Initialize SyncKit
  useEffect(() => {
    sync.init().then(() => {
      setSyncReady(true)
    }).catch((error) => {
      console.error('Failed to initialize SyncKit:', error)
    })
  }, [])

  if (!syncReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-lg">Initializing...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && <Sidebar sync={sync} />}

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header sync={sync} />

        <main className="flex-1 overflow-hidden p-6">
          <div className="relative h-full">
            <KanbanBoard sync={sync} />
            <TeamPresence />
          </div>
        </main>
      </div>

      {taskModalOpen && <TaskModal sync={sync} />}
    </div>
  )
}

export default App
