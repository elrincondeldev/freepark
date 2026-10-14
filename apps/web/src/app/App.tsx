import { MotionConfig } from 'framer-motion'
import { DashboardPage } from '@/pages/dashboard'
import { AppRuntime } from './AppRuntime'

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppRuntime />
      <DashboardPage />
    </MotionConfig>
  )
}
