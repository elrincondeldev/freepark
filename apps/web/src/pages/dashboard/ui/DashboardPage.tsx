import { useCameraStore } from '@/entities/camera'
import { Toaster } from '@/shared/ui'
import { AppHeader } from '@/widgets/app-header'
import { CameraFocusLayer } from '@/widgets/camera-focus'
import { CameraGrid } from '@/widgets/camera-grid'
import { EmptyState } from './EmptyState'

export function DashboardPage() {
  const hasCameras = useCameraStore((s) => s.cameras.length > 0)
  return (
    <div className="min-h-screen">
      <AppHeader />
      {hasCameras ? <CameraGrid /> : <EmptyState />}
      <CameraFocusLayer />
      <Toaster />
    </div>
  )
}
