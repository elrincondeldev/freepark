import type { AvailabilityEvent } from '../model/detectAvailability'

/** "2 free spaces — Home street" / "Right curb: 1 free · Left curb: 1 free" */
export function describeAvailability(event: AvailabilityEvent, cameraLabel: string) {
  const title = `${event.total} free space${event.total === 1 ? '' : 's'} — ${cameraLabel}`
  const body = event.zones.map((z) => `${z.name}: ${z.spaces} free`).join(' · ')
  return { title, body }
}
