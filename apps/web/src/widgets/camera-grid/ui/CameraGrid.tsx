import { AnimatePresence, LayoutGroup } from 'framer-motion'
import { useCameraStore } from '@/entities/camera'
import { CameraCard } from './CameraCard'

export function CameraGrid() {
  const cameras = useCameraStore((s) => s.cameras)
  return (
    <LayoutGroup>
      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-6 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {cameras.map((camera) => (
            <CameraCard key={camera.id} camera={camera} />
          ))}
        </AnimatePresence>
      </main>
    </LayoutGroup>
  )
}
