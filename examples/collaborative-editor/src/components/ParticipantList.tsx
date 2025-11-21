import { useStore } from '../store'

export default function ParticipantList() {
  const { participants, currentUser } = useStore()

  // Convert Map to array and include current user
  const allParticipants = [
    currentUser,
    ...Array.from(participants.values()),
  ]

  // Filter out stale participants (not seen in last 30 seconds)
  const activeParticipants = allParticipants.filter(
    (p) => Date.now() - p.lastSeen < 30000
  )

  if (activeParticipants.length <= 1) {
    return null // Don't show if only current user
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="participant-list">
      <div className="participant-list-title">
        Active Users ({activeParticipants.length})
      </div>
      {activeParticipants.map((participant) => (
        <div key={participant.id} className="participant-item">
          <div
            className="participant-avatar"
            style={{ backgroundColor: participant.color }}
          >
            {getInitials(participant.name)}
          </div>
          <span className="participant-name">
            {participant.name}
            {participant.id === currentUser.id && ' (You)'}
          </span>
        </div>
      ))}
    </div>
  )
}
