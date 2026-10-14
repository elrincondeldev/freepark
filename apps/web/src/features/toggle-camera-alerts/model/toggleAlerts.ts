import { useCameraStore } from '@/entities/camera'
import { requestNotificationPermission } from '@/shared/lib'

/** Toggle a camera's alerts; turning them on (a user gesture) asks for browser permission. */
export function toggleAlerts(cameraId: string): void {
  const store = useCameraStore.getState()
  const camera = store.cameras.find((c) => c.id === cameraId)
  store.toggleNotify(cameraId)
  if (camera && !camera.notify) void requestNotificationPermission()
}
