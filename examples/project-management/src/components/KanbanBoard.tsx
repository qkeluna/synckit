import { useEffect, useState, useRef } from 'react'
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
import type { SyncKit } from '@synckit-js/sdk'
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
  const { tasks, activeProjectId, moveTask, openTaskModal } = useStore()
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  // Track subscribed task IDs to avoid duplicate subscriptions
  const subscribedTasksRef = useRef<Map<string, () => void>>(new Map())

  // Debounce timers for batching rapid subscription updates
  const updateTimersRef = useRef<Map<string, number>>(new Map())

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  // Helper function to subscribe to a task
  const subscribeToTask = async (taskId: string) => {
    // Skip if already subscribed
    if (subscribedTasksRef.current.has(taskId)) {
      console.log('[Subscribe] Already subscribed to:', taskId)
      return
    }

    console.log('[Subscribe] Setting up subscription for:', taskId)

    try {
      const doc = sync.document<Task>(taskId)
      await doc.init()

      const unsubscribe = doc.subscribe((updatedTask) => {
        console.log('[Subscription] Received update for task:', taskId, 'updatedTask:', updatedTask)
        if (!updatedTask) return

        // Debounce rapid updates - wait 16ms (1 frame) before applying
        // This batches multiple field updates (status, order, updatedAt) into one state update
        const existingTimer = updateTimersRef.current.get(taskId)
        if (existingTimer) {
          clearTimeout(existingTimer)
        }

        const timer = setTimeout(() => {
          const store = useStore.getState()
          const existingTask = store.tasks.find(t => t.id === taskId)

          if (existingTask) {
            // Ignore stale updates - only apply if the update is newer or same timestamp
            if (updatedTask.updatedAt && existingTask.updatedAt && updatedTask.updatedAt < existingTask.updatedAt) {
              console.log('[Subscription] ⏭️ Ignoring stale update:', taskId,
                'incoming:', updatedTask.updatedAt, 'current:', existingTask.updatedAt,
                'delta:', existingTask.updatedAt - updatedTask.updatedAt, 'ms')
              updateTimersRef.current.delete(taskId)
              return
            }

            // Task exists - update it
            console.log('[Subscription] ✅ Applying batched update for task:', taskId, 'from', existingTask.status, 'to', updatedTask.status)
            console.log('[Subscription] Full updatedTask object:', JSON.stringify(updatedTask, null, 2))
            store.updateTask(taskId, updatedTask)
          } else {
            // Task is new - add it
            console.log('[Subscription] Adding new task:', taskId)
            store.addTask(updatedTask as Task)
          }

          updateTimersRef.current.delete(taskId)
        }, 16) // 16ms = ~1 frame at 60fps, enough to batch field updates

        updateTimersRef.current.set(taskId, timer)
      })

      subscribedTasksRef.current.set(taskId, unsubscribe)
      console.log('[Subscribe] Successfully subscribed to:', taskId)
    } catch (error) {
      console.error(`Failed to subscribe to task ${taskId}:`, error)
    }
  }

  // Initial subscription to all existing tasks
  useEffect(() => {
    if (!activeProjectId) return

    const projectTasks = tasks.filter((t) => t.projectId === activeProjectId)

    // Subscribe to all existing tasks
    projectTasks.forEach((task) => {
      subscribeToTask(task.id)
    })

    // Cleanup only on unmount
    return () => {
      subscribedTasksRef.current.forEach((unsubscribe) => unsubscribe())
      subscribedTasksRef.current.clear()

      // Clear any pending timers
      updateTimersRef.current.forEach((timer) => clearTimeout(timer))
      updateTimersRef.current.clear()
    }
  }, [activeProjectId, sync])

  // Listen for new tasks from other tabs
  useEffect(() => {
    const handleNewTask = (event: CustomEvent) => {
      const { taskId, taskData } = event.detail
      console.log('[NewTask Event] Received new task event:', taskId, taskData)

      // Only subscribe if this task belongs to the active project
      if (taskData && taskData.projectId === activeProjectId) {
        console.log('[NewTask Event] Task belongs to active project, subscribing...')
        subscribeToTask(taskId)
      } else {
        console.log('[NewTask Event] Task does not belong to active project, skipping')
      }
    }

    window.addEventListener('synckit:newtask', handleNewTask as EventListener)
    console.log('[NewTask Event] Listener registered')

    return () => {
      window.removeEventListener('synckit:newtask', handleNewTask as EventListener)
    }
  }, [activeProjectId, sync])

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
      const newOrder = columnTasks.length
      const oldStatus = projectTasks.find(t => t.id === taskId)?.status

      console.log(`[DRAG] Starting drag for ${taskId}: ${oldStatus} -> ${targetColumn.id}`)
      moveTask(taskId, targetColumn.id, newOrder)
      console.log(`[DRAG] Local store updated for ${taskId}`)

      // Batch update all 3 fields at once to reduce local notifications
      const doc = sync.document<Task>(taskId)
      await doc.init()
      console.log(`[DRAG] Document initialized for ${taskId}`)

      const timestamp = Date.now()
      await doc.update({
        status: targetColumn.id,
        order: newOrder,
        updatedAt: timestamp,
      })
      console.log(`[DRAG] ✅ Batched sync complete for ${taskId}: status=${targetColumn.id}, order=${newOrder}`)
    } else {
      // Dropped over another task - find its column and reorder
      const overTask = projectTasks.find((t) => t.id === overId)
      if (overTask) {
        const oldStatus = projectTasks.find(t => t.id === taskId)?.status

        console.log(`[DRAG] Starting drag for ${taskId}: ${oldStatus} -> ${overTask.status}`)
        moveTask(taskId, overTask.status, overTask.order)
        console.log(`[DRAG] Local store updated for ${taskId}`)

        // Batch update all 3 fields at once to reduce local notifications
        const doc = sync.document<Task>(taskId)
        await doc.init()
        console.log(`[DRAG] Document initialized for ${taskId}`)

        const timestamp = Date.now()
        await doc.update({
          status: overTask.status,
          order: overTask.order,
          updatedAt: timestamp,
        })
        console.log(`[DRAG] ✅ Batched sync complete for ${taskId}: status=${overTask.status}, order=${overTask.order}`)
      }
    }

    setActiveTask(null)
  }

  const handleCreateTask = (_status: TaskStatus) => {
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
