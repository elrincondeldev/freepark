import { MotionConfig } from 'framer-motion'
import { DashboardPage } from '@/pages/dashboard'
import { LandingPage } from '@/pages/landing'
import { isAppPath } from '@/shared/config'
import { AppRuntime } from './AppRuntime'

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      {isAppPath(window.location.pathname) ? (
        <>
          <AppRuntime />
          <DashboardPage />
        </>
      ) : (
        <LandingPage />
      )}
    </MotionConfig>
  )
}
