import { useAvailabilityAlerts } from '@/features/availability-alerts'
import { useLiveUpdates } from '@/features/live-updates'

/** App-wide background processes: the live socket and availability alerts. */
export function AppRuntime() {
  useLiveUpdates()
  useAvailabilityAlerts()
  return null
}
