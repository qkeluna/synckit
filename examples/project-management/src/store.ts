/**
 * Zustand store for application state
 */

import { create } from 'zustand'
import type { AppState, Project, Task, TaskStatus, TeamMember } from './types'
import { generateColor } from './lib/utils'

// Generate current user
const currentUser: TeamMember = {
  id: `user-${Math.random().toString(36).substr(2, 9)}`,
  name: `User ${Math.floor(Math.random() * 1000)}`,
  email: `user${Math.floor(Math.random() * 1000)}@example.com`,
  avatar: '',
  color: generateColor(),
  lastSeen: Date.now(),
}

// Sample initial project
const defaultProject: Project = {
  id: 'project-default',
  name: 'SyncKit Development',
  description: 'Building the next-generation offline-first sync engine',
  color: '#3B82F6',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  archived: false,
}

// Sample initial tasks
const sampleTasks: Task[] = [
  {
    id: 'task-1',
    title: 'Design API architecture',
    description: 'Create comprehensive API design for SyncKit SDK',
    status: 'done',
    priority: 'high',
    assigneeId: currentUser.id,
    projectId: 'project-default',
    createdAt: Date.now() - 86400000 * 7,
    updatedAt: Date.now() - 86400000 * 5,
    dueDate: null,
    tags: ['architecture', 'api'],
    order: 0,
  },
  {
    id: 'task-2',
    title: 'Implement CRDT core',
    description: 'Build Last-Write-Wins and Text CRDT implementations',
    status: 'done',
    priority: 'urgent',
    assigneeId: currentUser.id,
    projectId: 'project-default',
    createdAt: Date.now() - 86400000 * 6,
    updatedAt: Date.now() - 86400000 * 3,
    dueDate: null,
    tags: ['core', 'crdt'],
    order: 1,
  },
  {
    id: 'task-3',
    title: 'Write comprehensive tests',
    description: 'Property-based tests and chaos engineering suite',
    status: 'in-progress',
    priority: 'high',
    assigneeId: currentUser.id,
    projectId: 'project-default',
    createdAt: Date.now() - 86400000 * 4,
    updatedAt: Date.now() - 3600000,
    dueDate: Date.now() + 86400000 * 2,
    tags: ['testing', 'quality'],
    order: 0,
  },
  {
    id: 'task-4',
    title: 'Build example applications',
    description: 'Create collaborative editor and project management examples',
    status: 'review',
    priority: 'medium',
    assigneeId: currentUser.id,
    projectId: 'project-default',
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 7200000,
    dueDate: Date.now() + 86400000 * 5,
    tags: ['examples', 'documentation'],
    order: 0,
  },
  {
    id: 'task-5',
    title: 'Performance optimization',
    description: 'Optimize bundle size and runtime performance',
    status: 'todo',
    priority: 'high',
    assigneeId: null,
    projectId: 'project-default',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    dueDate: Date.now() + 86400000 * 10,
    tags: ['performance'],
    order: 0,
  },
  {
    id: 'task-6',
    title: 'Documentation polish',
    description: 'Review and enhance all user guides and API docs',
    status: 'todo',
    priority: 'medium',
    assigneeId: null,
    projectId: 'project-default',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3600000,
    dueDate: null,
    tags: ['documentation'],
    order: 1,
  },
]

export const useStore = create<AppState>((set) => ({
  // Initial state
  projects: [defaultProject],
  tasks: sampleTasks,
  teamMembers: new Map(),
  currentUser,

  activeProjectId: 'project-default',
  connectionStatus: 'disconnected',
  sidebarOpen: true,
  taskModalOpen: false,
  selectedTaskId: null,

  // Project actions
  addProject: (project) =>
    set((state) => ({
      projects: [...state.projects, project],
    })),

  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
      ),
    })),

  deleteProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      tasks: state.tasks.filter((t) => t.projectId !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
    })),

  setActiveProject: (id) =>
    set(() => ({
      activeProjectId: id,
    })),

  // Task actions
  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks, task],
    })),

  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
      ),
    })),

  deleteTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
    })),

  moveTask: (id, status, newOrder) =>
    set((state) => {
      const task = state.tasks.find((t) => t.id === id)
      if (!task) return state

      // Update all task orders in the new column
      const tasksInColumn = state.tasks
        .filter((t) => t.status === status && t.id !== id)
        .sort((a, b) => a.order - b.order)

      const updatedTasks = state.tasks.map((t) => {
        if (t.id === id) {
          return { ...t, status, order: newOrder, updatedAt: Date.now() }
        }
        if (t.status === status) {
          const currentIndex = tasksInColumn.findIndex((tc) => tc.id === t.id)
          if (currentIndex >= newOrder) {
            return { ...t, order: currentIndex + 1 }
          }
        }
        return t
      })

      return { tasks: updatedTasks }
    }),

  // Team actions
  addTeamMember: (member) =>
    set((state) => {
      const newMembers = new Map(state.teamMembers)
      newMembers.set(member.id, member)
      return { teamMembers: newMembers }
    }),

  removeTeamMember: (id) =>
    set((state) => {
      const newMembers = new Map(state.teamMembers)
      newMembers.delete(id)
      return { teamMembers: newMembers }
    }),

  updateTeamMemberPresence: (id, lastSeen) =>
    set((state) => {
      const member = state.teamMembers.get(id)
      if (!member) return state

      const newMembers = new Map(state.teamMembers)
      newMembers.set(id, { ...member, lastSeen })
      return { teamMembers: newMembers }
    }),

  // UI actions
  setConnectionStatus: (status) =>
    set(() => ({
      connectionStatus: status,
    })),

  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen,
    })),

  openTaskModal: (taskId) =>
    set(() => ({
      taskModalOpen: true,
      selectedTaskId: taskId,
    })),

  closeTaskModal: () =>
    set(() => ({
      taskModalOpen: false,
      selectedTaskId: null,
    })),
}))
