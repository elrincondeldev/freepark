import type { WatchedCamera } from '@/entities/camera'
import { BellIcon, BellOffIcon, IconButton } from '@/shared/ui'
import { toggleAlerts } from '../model/toggleAlerts'

/** Compact bell toggle for camera cards. */
export function AlertsButton({ camera }: { camera: WatchedCamera }) {
  return (
    <IconButton
      label={camera.notify ? 'Turn off alerts' : 'Alert me when a space opens'}
      title={camera.notify ? 'Alerts on' : 'Alerts off'}
      aria-pressed={camera.notify}
      active={camera.notify}
      onClick={() => toggleAlerts(camera.id)}
    >
      {camera.notify ? <BellIcon /> : <BellOffIcon />}
    </IconButton>
  )
}
