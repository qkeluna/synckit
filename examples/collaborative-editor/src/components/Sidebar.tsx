import { useState } from 'react'
import { useStore } from '../store'
import type { SyncKit } from '@synckit-js/sdk'
import type { DocumentMetadata } from '../types'

interface SidebarProps {
  sync: SyncKit
}

export default function Sidebar({ sync }: SidebarProps) {
  const {
    documents,
    activeDocumentId,
    openDocument,
    removeDocument,
    addDocument,
    updateDocumentTitle,
  } = useStore()

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const handleCreateDocument = async () => {
    const id = `doc-${Date.now()}`
    const newDoc: DocumentMetadata = {
      id,
      title: 'Untitled.md',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      language: 'markdown',
    }

    // Create document in SyncKit
    const doc = sync.document<{ content: string }>(id)
    await doc.init() // Wait for document to initialize
    await doc.update({ content: '# New Document\n\nStart typing...' })

    addDocument(newDoc)
    openDocument(id)
  }

  const handleDeleteDocument = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (documents.length === 1) {
      alert('Cannot delete the last document')
      return
    }

    if (confirm('Are you sure you want to delete this document?')) {
      // Delete from SyncKit
      await sync.deleteDocument(id)
      removeDocument(id)
    }
  }

  const handleStartRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingId(id)
    // Remove .md extension for editing, user only edits the filename
    const nameWithoutExtension = currentTitle.replace(/\.md$/i, '')
    setRenameValue(nameWithoutExtension)
  }

  const handleSaveRename = async () => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null)
      return
    }

    // Auto-append .md extension (this is a markdown-only editor)
    const titleWithExtension = renameValue.trim().endsWith('.md')
      ? renameValue.trim()
      : `${renameValue.trim()}.md`

    // Update the document title in the store
    updateDocumentTitle(renamingId, titleWithExtension)

    setRenamingId(null)
    setRenameValue('')
  }

  const handleCancelRename = () => {
    setRenamingId(null)
    setRenameValue('')
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename()
    } else if (e.key === 'Escape') {
      handleCancelRename()
    }
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">Documents</div>
      </div>

      <div className="sidebar-content">
        <ul className="document-list">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className={`document-item ${doc.id === activeDocumentId ? 'active' : ''}`}
              onClick={() => openDocument(doc.id)}
            >
              {renamingId === doc.id ? (
                <input
                  type="text"
                  className="document-name-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={handleSaveRename}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  placeholder="filename"
                  title="Editing filename (extension .md will be added automatically)"
                />
              ) : (
                <span
                  className="document-name"
                  onDoubleClick={(e) => handleStartRename(doc.id, doc.title, e)}
                  title="Double-click to rename"
                >
                  {doc.title}
                </span>
              )}
              {documents.length > 1 && (
                <button
                  className="tab-close"
                  onClick={(e) => handleDeleteDocument(doc.id, e)}
                  title="Delete document"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>

        <button className="new-document-btn" onClick={handleCreateDocument}>
          + New Document
        </button>
      </div>
    </div>
  )
}
