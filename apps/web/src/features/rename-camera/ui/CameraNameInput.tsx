import { useCameraStore, type WatchedCamera } from '@/entities/camera'

/** Inline-editable camera title; saves on blur or Enter. */
export function CameraNameInput({ camera }: { camera: WatchedCamera }) {
  const renameCamera = useCameraStore((s) => s.renameCamera)
  return (
    <input
      defaultValue={camera.label}
      aria-label="Camera name"
      maxLength={60}
      onBlur={(e) => renameCamera(camera.id, e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="min-w-0 flex-1 rounded-lg bg-transparent px-1 text-xl font-semibold tracking-tight hover:bg-surface-2 focus:bg-surface-2"
    />
  )
}
