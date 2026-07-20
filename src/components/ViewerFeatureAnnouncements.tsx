import { useMemo } from 'react'
import { getOrCreateCountdownDeadline, useCountdown } from '../hooks/useCountdown'
import './ViewerFeatureAnnouncements.css'

const COMING_SOON_STORAGE_KEY = 'viewer-coming-soon-deadline-48h-v1'
const COMING_SOON_HOURS = 48

export default function ViewerFeatureAnnouncements() {
  const comingSoonDeadline = useMemo(
    () => getOrCreateCountdownDeadline(COMING_SOON_STORAGE_KEY, COMING_SOON_HOURS),
    []
  )
  const { label: countdownLabel, isPending: comingSoonActive } = useCountdown(comingSoonDeadline)

  return (
    <div className="viewer-feature-announcements" aria-label="Upcoming features">
      <article className="vfa-coming-soon" aria-label="Coming soon countdown">
        <div className="vfa-coming-soon-blur" aria-hidden="true" />
        <div className="vfa-coming-soon-overlay">
          <span className="vfa-coming-soon-label">Coming Soon</span>
          <span className="vfa-coming-soon-countdown">
            {comingSoonActive ? countdownLabel : '00:00:00'}
          </span>
          <p className="vfa-coming-soon-note">More 3D Viewer features arriving soon</p>
        </div>
      </article>
    </div>
  )
}
