import { useCameraStore, type WatchedCamera } from '@/entities/camera'
import { CloseIcon, IconButton } from '@/shared/ui'

export function RemoveCameraButton({ camera }: { camera: WatchedCamera }) {
  const removeCamera = useCameraStore((s) => s.removeCamera)
  return (
    <IconButton
      label={`Remove ${camera.label}`}
      onClick={() => removeCamera(camera.id)}
      className="opacity-60 hover:text-busy hover:opacity-100 focus:opacity-100"
    >
      <CloseIcon />
    </IconButton>
  )
}
