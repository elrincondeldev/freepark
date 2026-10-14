import type { WatchedCamera } from '@/entities/camera'
import { notificationPermission } from '@/shared/lib'
import { BellIcon, BellOffIcon, Switch } from '@/shared/ui'
import { toggleAlerts } from '../model/toggleAlerts'

/** Labelled alerts switch, explaining when the browser blocks notifications. */
export function AlertsSwitch({ camera }: { camera: WatchedCamera }) {
  return (
    <>
      <Switch
        checked={camera.notify}
        onChange={() => toggleAlerts(camera.id)}
        label="Alert me when a space opens"
        icon={camera.notify ? <BellIcon /> : <BellOffIcon />}
      />
      {camera.notify && notificationPermission() === 'denied' && (
        <p className="px-1 text-xs text-muted" role="note">
          Browser notifications are blocked for this site, so alerts only appear while the app is
          open. Allow notifications in your browser's site settings to get them in the background.
        </p>
      )}
    </>
  )
}
