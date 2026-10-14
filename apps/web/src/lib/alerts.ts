import { useCameraStore } from '../store/cameras'
import { requestNotificationPermission } from './notify'

/** Toggle a camera's alerts; turning them on (a user gesture) asks for browser permission. */
export function toggleAlerts(cameraId: string): void {
  const store = useCameraStore.getState()
  const camera = store.cameras.find((c) => c.id === cameraId)
  store.toggleNotify(cameraId)
  if (camera && !camera.notify) void requestNotificationPermission()
}
