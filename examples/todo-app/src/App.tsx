import React, { useEffect, useState } from 'react'
import { SyncKit, SyncProvider } from '@synckit-js/sdk'
import TodoApp from './components/TodoApp'
import TestButton from './components/TestButton'

export default function App() {
  const [synckit, setSynckit] = useState<SyncKit | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const initSyncKit = async () => {
      try {
        const sync = new SyncKit({
          storage: 'indexeddb',
          name: 'todo-app'
        })
        
        await sync.init()
        setSynckit(sync)
      } catch (err) {
        console.error('Failed to initialize SyncKit:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    }

    initSyncKit()
  }, [])

  if (error) {
    return (
      <div style={{ padding: '2rem', color: 'red' }}>
        <h2>Error initializing SyncKit</h2>
        <p>{error}</p>
      </div>
    )
  }

  if (!synckit) {
    return (
      <div style={{ padding: '2rem' }}>
        <h2>Loading SyncKit...</h2>
      </div>
    )
  }

  return (
    <SyncProvider synckit={synckit}>
      <TodoApp />
      {import.meta.env.DEV && <TestButton />}
    </SyncProvider>
  )
}
