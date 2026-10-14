import { useEffect } from 'react'
import { useCameraSelection, useCameraStore } from '@/entities/camera'
import { useFeedStore } from '@/entities/feed'
import { playChime, showBackgroundNotification } from '@/shared/lib'
import { toast } from '@/shared/ui'
import { describeAvailability } from '../lib/describe'
import {
  detectAvailability,
  emptyMemory,
  type AvailabilityEvent,
  type AvailabilityMemory,
} from './detectAvailability'

function deliver(event: AvailabilityEvent) {
  const { cameras, settings } = useCameraStore.getState()
  const camera = cameras.find((c) => c.id === event.cameraId)
  if (!camera?.notify) return
  const { title, body } = describeAvailability(event, camera.label)
  const open = () => useCameraSelection.getState().focus(camera.id)
  toast({ title, body, onSelect: open })
  showBackgroundNotification(title, body, open)
  if (settings.sound) playChime()
}

/**
 * Watches every camera's analyses and alerts (toast, background notification, optional
 * chime) when a space opens on a camera with alerts enabled. Mount once at the app root.
 */
export function useAvailabilityAlerts() {
  useEffect(() => {
    const memory = new Map<string, AvailabilityMemory>()
    return useFeedStore.subscribe((state, prev) => {
      for (const [cameraId, feed] of Object.entries(state.cameras)) {
        const analysis = feed.analysis
        if (!analysis || analysis === prev.cameras[cameraId]?.analysis) continue
        const result = detectAvailability(
          memory.get(cameraId) ?? emptyMemory(),
          analysis,
          Date.now(),
        )
        memory.set(cameraId, result.memory)
        if (result.event) deliver(result.event)
      }
    })
  }, [])
}
