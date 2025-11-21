/**
 * TypeScript types for Collaborative Editor
 */

export interface Document {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
  language: 'markdown' | 'javascript' | 'typescript' | 'plaintext'
}

export interface DocumentMetadata {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  language: Document['language']
}

export interface Participant {
  id: string
  name: string
  color: string
  cursor?: {
    line: number
    column: number
  }
  lastSeen: number
}

export interface AppState {
  // Documents
  documents: DocumentMetadata[]
  openDocuments: string[]
  activeDocumentId: string | null

  // Participants
  participants: Map<string, Participant>
  currentUser: Participant

  // Connection
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

  // UI State
  sidebarOpen: boolean

  // Actions
  addDocument: (doc: DocumentMetadata) => void
  removeDocument: (id: string) => void
  openDocument: (id: string) => void
  closeDocument: (id: string) => void
  setActiveDocument: (id: string) => void
  updateDocumentTitle: (id: string, title: string) => void

  addParticipant: (participant: Participant) => void
  removeParticipant: (id: string) => void
  updateParticipantCursor: (id: string, cursor: Participant['cursor']) => void

  setConnectionStatus: (status: AppState['connectionStatus']) => void
  toggleSidebar: () => void
}

export interface EditorProps {
  documentId: string
  language: Document['language']
  onContentChange?: (content: string) => void
}

export type ConnectionStatus = AppState['connectionStatus']
export type Language = Document['language']
