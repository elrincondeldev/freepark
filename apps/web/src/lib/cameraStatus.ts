import { isStale, type CameraLive } from '../store/live'

export type DisplayStatus =
  | 'connecting'
  | 'offline'
  | 'stale'
  | 'analysing'
  | 'live'
  | 'no_zones'
  | 'unknown_view'
  | 'low_quality'
  | 'analysis_unavailable'
  | 'analysis_disabled'

export function displayStatus(live: CameraLive | undefined, now: number): DisplayStatus {
  if (!live?.frame) return live && !live.online ? 'offline' : 'connecting'
  if (!live.online) return 'offline'
  if (isStale(live, now)) return 'stale'
  const a = live.analysis
  if (!a || a.frameId !== live.frame.frameId) return 'analysing'
  switch (a.status) {
    case 'ok':
      return a.totalAvailable === null ? 'no_zones' : 'live'
    default:
      return a.status
  }
}

export const STATUS_META: Record<
  DisplayStatus,
  { label: string; tone: 'free' | 'warn' | 'busy' | 'muted' | 'accent' }
> = {
  connecting: { label: 'Connecting', tone: 'muted' },
  offline: { label: 'Offline', tone: 'busy' },
  stale: { label: 'Stale image', tone: 'warn' },
  analysing: { label: 'Analysing', tone: 'accent' },
  live: { label: 'Live', tone: 'free' },
  no_zones: { label: 'No zones yet', tone: 'muted' },
  unknown_view: { label: 'Unknown view', tone: 'warn' },
  low_quality: { label: 'Low quality', tone: 'warn' },
  analysis_unavailable: { label: 'AI unavailable', tone: 'warn' },
  analysis_disabled: { label: 'AI disabled', tone: 'muted' },
}
