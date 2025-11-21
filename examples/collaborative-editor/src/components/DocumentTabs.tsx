import { useStore } from '../store'

export default function DocumentTabs() {
  const {
    documents,
    openDocuments,
    activeDocumentId,
    setActiveDocument,
    closeDocument,
  } = useStore()

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()

    if (openDocuments.length === 1) {
      alert('Cannot close the last open document')
      return
    }

    closeDocument(id)
  }

  // Only show documents that are in openDocuments
  const visibleDocuments = documents.filter((doc) =>
    openDocuments.includes(doc.id)
  )

  return (
    <div className="document-tabs">
      {visibleDocuments.map((doc) => (
        <div
          key={doc.id}
          className={`document-tab ${doc.id === activeDocumentId ? 'active' : ''}`}
          onClick={() => setActiveDocument(doc.id)}
        >
          <span className="tab-name">{doc.title}</span>
          {openDocuments.length > 1 && (
            <button
              className="tab-close"
              onClick={(e) => handleCloseTab(doc.id, e)}
              title="Close tab"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
