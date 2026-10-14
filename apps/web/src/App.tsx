import { MotionConfig } from 'framer-motion'
import { Dashboard } from './components/Dashboard'
import { EmptyState } from './components/EmptyState'
import { FocusLayer } from './components/FocusView'
import { Header } from './components/Header'
import { Toasts } from './components/Toasts'
import { useAvailabilityAlerts } from './hooks/useAvailabilityAlerts'
import { useLiveConnection } from './hooks/useLiveConnection'
import { useCameraStore } from './store/cameras'

export default function App() {
  useLiveConnection()
  useAvailabilityAlerts()
  const hasCameras = useCameraStore((s) => s.cameras.length > 0)
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen">
        <Header />
        {hasCameras ? <Dashboard /> : <EmptyState />}
        <FocusLayer />
        <Toasts />
      </div>
    </MotionConfig>
  )
}
