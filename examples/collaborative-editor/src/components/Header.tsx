import { useStore } from '../store'

export default function Header() {
  const {
    activeDocumentId,
    documents,
    updateDocumentTitle,
    toggleSidebar,
    connectionStatus,
  } = useStore()

  const activeDocument = documents.find((d) => d.id === activeDocumentId)

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeDocumentId) return
    updateDocumentTitle(activeDocumentId, e.target.value)
  }

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected'
      case 'connecting':
        return 'Connecting...'
      case 'reconnecting':
        return 'Reconnecting...'
      case 'disconnected':
        return 'Offline'
      default:
        return 'Offline'
    }
  }

  return (
    <div className="header">
      <div className="header-left">
        <button
          className="menu-btn"
          onClick={toggleSidebar}
          title="Toggle sidebar"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        {activeDocument && (
          <input
            type="text"
            className="document-title-input"
            value={activeDocument.title}
            onChange={handleTitleChange}
            placeholder="Untitled"
          />
        )}
      </div>

      <div className="header-right">
        <div className="connection-status">
          <span
            className={`status-dot ${connectionStatus === 'connected' ? 'connected' : connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? 'connecting' : 'disconnected'}`}
          ></span>
          <span>{getStatusText()}</span>
        </div>
      </div>
    </div>
  )
}
