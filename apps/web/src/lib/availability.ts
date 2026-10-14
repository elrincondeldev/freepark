import type { AnalysisMessage } from './types'

export const ALERT_COOLDOWN_MS = 2 * 60_000

export interface AvailabilityMemory {
  /** availability from the last usable (status ok) analysis */
  total: number | null
  zones: Record<number, number>
  lastAlertAt: number | null
  lastAlertTotal: number
}

export interface AvailabilityEvent {
  cameraId: string
  total: number
  /** zones that gained their first free space, or all zones with space when the camera opened */
  zones: { zoneId: number; name: string; spaces: number }[]
  frameId: string
}

export const emptyMemory = (): AvailabilityMemory => ({
  total: null,
  zones: {},
  lastAlertAt: null,
  lastAlertTotal: 0,
})

/**
 * Decide whether an analysis means "a space just opened".
 * Fires when the camera goes from 0 to ≥1 free spaces, or a zone that had none gains one.
 * Ignores unknown views, low-quality frames and failed analyses. Repeat alerts within the
 * cooldown are suppressed unless the free count rises above the last alerted count.
 */
export function detectAvailability(
  memory: AvailabilityMemory,
  analysis: AnalysisMessage,
  now: number,
): { memory: AvailabilityMemory; event: AvailabilityEvent | null } {
  if (analysis.status !== 'ok' || analysis.totalAvailable === null) return { memory, event: null }
  const total = analysis.totalAvailable
  const zones = Object.fromEntries(analysis.zones.map((z) => [z.zoneId, z.spaces]))
  const next: AvailabilityMemory = { ...memory, total, zones }
  if (memory.total === null) return { memory: next, event: null } // first reading: no transition

  const cameraOpened = memory.total === 0 && total > 0
  const zonesOpened = analysis.zones.filter(
    (z) => z.spaces > 0 && (memory.zones[z.zoneId] ?? 0) === 0,
  )
  if (!cameraOpened && zonesOpened.length === 0) return { memory: next, event: null }

  const inCooldown = memory.lastAlertAt !== null && now - memory.lastAlertAt < ALERT_COOLDOWN_MS
  if (inCooldown && total <= memory.lastAlertTotal) return { memory: next, event: null }

  next.lastAlertAt = now
  next.lastAlertTotal = total
  const opened = zonesOpened.length ? zonesOpened : analysis.zones.filter((z) => z.spaces > 0)
  return {
    memory: next,
    event: {
      cameraId: analysis.cameraId,
      total,
      zones: opened.map(({ zoneId, name, spaces }) => ({ zoneId, name, spaces })),
      frameId: analysis.frameId,
    },
  }
}
