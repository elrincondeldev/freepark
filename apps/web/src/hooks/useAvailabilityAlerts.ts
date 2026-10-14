import { useEffect } from 'react'
import type { AvailabilityEvent } from '../lib/availability'
import { playChime, showBrowserNotification } from '../lib/notify'
import { useCameraStore } from '../store/cameras'
import { onAvailability } from '../store/live'
import { useToastStore } from '../store/toasts'
import { useUiStore } from '../store/ui'

export function describe(event: AvailabilityEvent, label: string) {
  const title = `${event.total} free space${event.total === 1 ? '' : 's'} — ${label}`
  const body = event.zones.map((z) => `${z.name}: ${z.spaces} free`).join(' · ')
  return { title, body }
}

/** Turns availability events into toasts, native notifications and an optional chime. */
export function useAvailabilityAlerts() {
  useEffect(
    () =>
      onAvailability((event) => {
        const { cameras, settings } = useCameraStore.getState()
        const camera = cameras.find((c) => c.id === event.cameraId)
        if (!camera?.notify) return
        const { title, body } = describe(event, camera.label)
        useToastStore.getState().push({ cameraId: camera.id, title, body })
        showBrowserNotification(title, body, () => useUiStore.getState().focus(camera.id))
        if (settings.sound) playChime()
      }),
    [],
  )
}
