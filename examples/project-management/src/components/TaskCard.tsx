import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '../types'
import { useStore } from '../store'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { MoreVertical, Calendar, User } from 'lucide-react'
import { getPriorityColor, getInitials, formatRelativeTime } from '../lib/utils'

interface TaskCardProps {
  task: Task
}

export default function TaskCard({ task }: TaskCardProps) {
  const { openTaskModal, currentUser, teamMembers } = useStore()

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const assignee = task.assigneeId
    ? task.assigneeId === currentUser.id
      ? currentUser
      : teamMembers.get(task.assigneeId)
    : null

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="cursor-grab active:cursor-grabbing mb-2 p-3 hover:shadow-md transition-shadow"
      {...attributes}
      {...listeners}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="flex-1 text-sm font-medium cursor-pointer hover:text-primary"
            onClick={() => openTaskModal(task.id)}
          >
            {task.title}
          </h3>
          <Button variant="ghost" size="icon" className="h-6 w-6 -mt-1 -mr-1">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>

        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}

        <div className="flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            {task.dueDate && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>{formatRelativeTime(task.dueDate)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className={getPriorityColor(task.priority)}>
              {task.priority}
            </Badge>

            {assignee && (
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: assignee.color }}
                title={assignee.name}
              >
                {getInitials(assignee.name)}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
