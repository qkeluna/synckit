/**
 * Zustand store for application state
 */

import { create } from 'zustand'
import type { AppState, Participant } from './types'

// Generate random color for participants
const generateColor = () => {
  const colors = [
    '#EF4444', // red
    '#F59E0B', // amber
    '#10B981', // green
    '#3B82F6', // blue
    '#8B5CF6', // purple
    '#EC4899', // pink
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

// Generate current user
const currentUser: Participant = {
  id: `user-${Math.random().toString(36).substr(2, 9)}`,
  name: `User ${Math.floor(Math.random() * 1000)}`,
  color: generateColor(),
  lastSeen: Date.now(),
}

export const useStore = create<AppState>((set) => ({
  // Initial state
  documents: [
    {
      id: 'welcome',
      title: 'Welcome.md',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      language: 'markdown',
    },
  ],
  openDocuments: ['welcome'],
  activeDocumentId: 'welcome',

  participants: new Map(),
  currentUser,

  connectionStatus: 'disconnected',
  sidebarOpen: true,

  // Document actions
  addDocument: (doc) =>
    set((state) => ({
      documents: [...state.documents, doc],
    })),

  removeDocument: (id) =>
    set((state) => ({
      documents: state.documents.filter((d) => d.id !== id),
      openDocuments: state.openDocuments.filter((docId) => docId !== id),
      activeDocumentId:
        state.activeDocumentId === id
          ? state.openDocuments[0] || null
          : state.activeDocumentId,
    })),

  openDocument: (id) =>
    set((state) => ({
      openDocuments: state.openDocuments.includes(id)
        ? state.openDocuments
        : [...state.openDocuments, id],
      activeDocumentId: id,
    })),

  closeDocument: (id) =>
    set((state) => {
      const newOpenDocs = state.openDocuments.filter((docId) => docId !== id)
      const newActiveId =
        state.activeDocumentId === id
          ? newOpenDocs[newOpenDocs.length - 1] || null
          : state.activeDocumentId

      return {
        openDocuments: newOpenDocs,
        activeDocumentId: newActiveId,
      }
    }),

  setActiveDocument: (id) =>
    set(() => ({
      activeDocumentId: id,
    })),

  updateDocumentTitle: (id, title) =>
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, title, updatedAt: Date.now() } : doc
      ),
    })),

  // Participant actions
  addParticipant: (participant) =>
    set((state) => {
      const newParticipants = new Map(state.participants)
      newParticipants.set(participant.id, participant)
      return { participants: newParticipants }
    }),

  removeParticipant: (id) =>
    set((state) => {
      const newParticipants = new Map(state.participants)
      newParticipants.delete(id)
      return { participants: newParticipants }
    }),

  updateParticipantCursor: (id, cursor) =>
    set((state) => {
      const participant = state.participants.get(id)
      if (!participant) return state

      const newParticipants = new Map(state.participants)
      newParticipants.set(id, { ...participant, cursor, lastSeen: Date.now() })
      return { participants: newParticipants }
    }),

  // Connection actions
  setConnectionStatus: (status) =>
    set(() => ({
      connectionStatus: status,
    })),

  // UI actions
  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen,
    })),
}))
