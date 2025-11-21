export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string | null
  projectId: string
  createdAt: number
  updatedAt: number
  dueDate: number | null
  tags: string[]
  order: number
}

export interface Project {
  id: string
  name: string
  description: string
  color: string
  createdAt: number
  updatedAt: number
  archived: boolean
}

export interface TeamMember {
  id: string
  name: string
  email: string
  avatar: string
  color: string
  lastSeen: number
}

export interface AppState {
  // Data
  projects: Project[]
  tasks: Task[]
  teamMembers: Map<string, TeamMember>
  currentUser: TeamMember

  // UI State
  activeProjectId: string | null
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
  sidebarOpen: boolean
  taskModalOpen: boolean
  selectedTaskId: string | null

  // Project Actions
  addProject: (project: Project) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  deleteProject: (id: string) => void
  setActiveProject: (id: string | null) => void

  // Task Actions
  addTask: (task: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  deleteTask: (id: string) => void
  moveTask: (id: string, status: TaskStatus, newOrder: number) => void

  // Team Actions
  addTeamMember: (member: TeamMember) => void
  removeTeamMember: (id: string) => void
  updateTeamMemberPresence: (id: string, lastSeen: number) => void

  // UI Actions
  setConnectionStatus: (status: AppState['connectionStatus']) => void
  toggleSidebar: () => void
  openTaskModal: (taskId: string | null) => void
  closeTaskModal: () => void
}
