import { useEffect, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { SyncKit } from '@synckit/sdk'
import type { Task, TaskStatus } from '../types'
import { useStore } from '../store'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Plus } from 'lucide-react'
import TaskCard from './TaskCard'

interface KanbanBoardProps {
  sync: SyncKit
}

const columns: { id: TaskStatus; title: string; color: string }[] = [
  { id: 'todo', title: 'To Do', color: 'border-t-gray-500' },
  { id: 'in-progress', title: 'In Progress', color: 'border-t-blue-500' },
  { id: 'review', title: 'Review', color: 'border-t-yellow-500' },
  { id: 'done', title: 'Done', color: 'border-t-green-500' },
]

// Droppable column wrapper component
function DroppableColumn({ children, id }: { children: React.ReactNode; id: string }) {
  const { setNodeRef } = useDroppable({ id })
  return <div ref={setNodeRef} className="flex h-full flex-col">{children}</div>
}

export default function KanbanBoard({ sync }: KanbanBoardProps) {
  const { tasks, activeProjectId, moveTask, updateTask, openTaskModal } = useStore()
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  // Sync tasks with SyncKit
  useEffect(() => {
    if (!activeProjectId) return

    // Subscribe to task updates
    const unsubscribes: (() => void)[] = []

    const initDocs = async () => {
      const projectTasks = tasks.filter((t) => t.projectId === activeProjectId)

      for (const task of projectTasks) {
        const doc = sync.document<Task>(task.id)
        await doc.init() // Ensure document is initialized

        const unsubscribe = doc.subscribe((updatedTask) => {
          if (updatedTask) {
            updateTask(task.id, updatedTask)
          }
        })

        unsubscribes.push(unsubscribe)
      }
    }

    initDocs()

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe())
    }
  }, [activeProjectId, sync]) // Remove 'tasks' and 'updateTask' to prevent infinite loop

  const projectTasks = tasks.filter((t) => t.projectId === activeProjectId)

  const handleDragStart = (event: DragStartEvent) => {
    const task = projectTasks.find((t) => t.id === event.active.id)
    setActiveTask(task || null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over) {
      setActiveTask(null)
      return
    }

    const taskId = active.id as string
    const overId = over.id as string

    // Check if dropped over a column
    const targetColumn = columns.find((col) => col.id === overId)
    if (targetColumn) {
      const columnTasks = projectTasks.filter((t) => t.status === targetColumn.id)
      moveTask(taskId, targetColumn.id, columnTasks.length)

      // Update in SyncKit
      const doc = sync.document<Task>(taskId)
      await doc.init()
      const task = projectTasks.find((t) => t.id === taskId)
      if (task) {
        await doc.update({ ...task, status: targetColumn.id, updatedAt: Date.now() })
      }
    } else {
      // Dropped over another task - find its column and reorder
      const overTask = projectTasks.find((t) => t.id === overId)
      if (overTask) {
        moveTask(taskId, overTask.status, overTask.order)

        // Update in SyncKit
        const doc = sync.document<Task>(taskId)
        await doc.init()
        const task = projectTasks.find((t) => t.id === taskId)
        if (task) {
          await doc.update({ ...task, status: overTask.status, updatedAt: Date.now() })
        }
      }
    }

    setActiveTask(null)
  }

  const handleCreateTask = (status: TaskStatus) => {
    openTaskModal(null)
    // The modal will handle task creation with the current status
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid h-full grid-cols-4 gap-4 overflow-x-auto pb-4">
        {columns.map((column) => {
          const columnTasks = projectTasks
            .filter((t) => t.status === column.id)
            .sort((a, b) => a.order - b.order)

          return (
            <DroppableColumn key={column.id} id={column.id}>
              <Card className={`flex h-full flex-col border-t-4 ${column.color}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">
                      {column.title}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ({columnTasks.length})
                      </span>
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleCreateTask(column.id)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto pt-0">
                  <SortableContext
                    items={columnTasks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {columnTasks.map((task) => (
                      <TaskCard key={task.id} task={task} />
                    ))}
                  </SortableContext>

                  {/* Drop zone for empty columns */}
                  {columnTasks.length === 0 && (
                    <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 text-sm text-muted-foreground">
                      Drop tasks here
                    </div>
                  )}
                </CardContent>
              </Card>
            </DroppableColumn>
          )
        })}
      </div>

      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
