import { useStore } from '../store'
import { getInitials } from '../lib/utils'

export default function TeamPresence() {
  const { teamMembers, currentUser } = useStore()

  const allMembers = [currentUser, ...Array.from(teamMembers.values())]

  // Filter out stale members (not seen in last 30 seconds)
  const activeMembers = allMembers.filter(
    (m) => Date.now() - m.lastSeen < 30000
  )

  if (activeMembers.length <= 1) {
    return null
  }

  return (
    <div className="absolute right-0 top-0 rounded-lg border bg-card p-4 shadow-lg">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Team ({activeMembers.length})
      </div>
      <div className="space-y-2">
        {activeMembers.map((member) => (
          <div key={member.id} className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: member.color }}
            >
              {getInitials(member.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {member.name}
                {member.id === currentUser.id && ' (You)'}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {member.email}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
