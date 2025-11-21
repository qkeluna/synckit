import { useStore } from '../store'
import type { SyncKit } from '@synckit/sdk'
import { Button } from './ui/button'
import { Menu, Plus } from 'lucide-react'

interface HeaderProps {
  sync: SyncKit
}

export default function Header({ sync }: HeaderProps) {
  const {
    projects,
    activeProjectId,
    toggleSidebar,
    connectionStatus,
    openTaskModal,
  } = useStore()

  const activeProject = projects.find((p) => p.id === activeProjectId)

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected'
      case 'connecting':
        return 'Connecting...'
      case 'reconnecting':
        return 'Reconnecting...'
      case 'disconnected':
        return 'Offline'
      default:
        return 'Offline'
    }
  }

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-green-500'
      case 'connecting':
      case 'reconnecting':
        return 'bg-yellow-500 animate-pulse'
      case 'disconnected':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={toggleSidebar}>
          <Menu className="h-5 w-5" />
        </Button>

        {activeProject && (
          <div className="flex items-center gap-3">
            <div
              className="h-8 w-8 rounded-md"
              style={{ backgroundColor: activeProject.color }}
            />
            <div>
              <h1 className="text-lg font-semibold">{activeProject.name}</h1>
              <p className="text-xs text-muted-foreground">
                {activeProject.description}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
          <span>{getStatusText()}</span>
        </div>

        <Button onClick={() => openTaskModal(null)}>
          <Plus className="mr-2 h-4 w-4" />
          New Task
        </Button>
      </div>
    </header>
  )
}
