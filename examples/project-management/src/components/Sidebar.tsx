import { useState } from 'react'
import { useStore } from '../store'
import type { SyncKit } from '@synckit-js/sdk'
import type { Project } from '../types'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card } from './ui/card'
import { Plus } from 'lucide-react'
import { generateColor } from '../lib/utils'

interface SidebarProps {
  sync: SyncKit
}

export default function Sidebar({ sync }: SidebarProps) {
  const { projects, activeProjectId, setActiveProject, addProject } = useStore()
  const [isCreating, setIsCreating] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      setIsCreating(false)
      return
    }

    const id = `project-${Date.now()}`
    const newProject: Project = {
      id,
      name: newProjectName,
      description: 'New project',
      color: generateColor(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      archived: false,
    }

    // Create project in SyncKit
    const doc = sync.document<Project>(id)
    await doc.init()
    await doc.update(newProject)

    addProject(newProject)
    setActiveProject(id)
    setNewProjectName('')
    setIsCreating(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateProject()
    } else if (e.key === 'Escape') {
      setIsCreating(false)
      setNewProjectName('')
    }
  }

  return (
    <aside className="w-64 border-r bg-muted/40">
      <div className="flex h-full flex-col">
        <div className="border-b p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">
            PROJECTS
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {projects
              .filter((p) => !p.archived)
              .map((project) => (
                <button
                  key={project.id}
                  onClick={() => setActiveProject(project.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent ${
                    project.id === activeProjectId
                      ? 'bg-accent font-medium'
                      : 'font-normal'
                  }`}
                >
                  <div
                    className="h-6 w-6 rounded-md flex-shrink-0"
                    style={{ backgroundColor: project.color }}
                  />
                  <span className="truncate text-sm">{project.name}</span>
                </button>
              ))}
          </div>

          {isCreating && (
            <Card className="mt-2 p-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-primary flex-shrink-0" />
                <Input
                  autoFocus
                  placeholder="Project name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleCreateProject}
                  className="h-8"
                />
              </div>
            </Card>
          )}
        </div>

        <div className="border-t p-2">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => setIsCreating(true)}
            disabled={isCreating}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </div>
      </div>
    </aside>
  )
}
