import { create } from 'zustand'
import { SOURCE_INTERVAL_MS } from '@/shared/config'
import type { ConnectionState } from '@/shared/lib'
import type { AnalysisMessage, CameraStatusMessage, FrameMessage, ServerMessage } from './messages'

export interface CameraFeed {
  frame?: FrameMessage
  analysis?: AnalysisMessage
  online: boolean
  lastError?: string
  /** client clock (ms) when the latest frame arrived */
  lastFrameAt?: number
  /** recent gaps between source capture times (ms), to estimate the update cadence */
  gaps: number[]
  /** a re-analysis was requested and its result has not arrived yet */
  reanalysing?: boolean
}

interface FeedState {
  connection: ConnectionState
  cameras: Record<string, CameraFeed>
  setConnection: (c: ConnectionState) => void
  handle: (msg: ServerMessage, now?: number) => void
  forget: (cameraId: string) => void
  /** Mark a camera as being re-analysed until its next analysis (or a timeout). */
  markReanalysing: (cameraId: string) => void
  cancelReanalysing: (cameraId: string) => void
}

const MAX_GAPS = 6
const MIN_INTERVAL_MS = 30_000
const REANALYSE_TIMEOUT_MS = 45_000
const empty = (): CameraFeed => ({ online: true, gaps: [] })

export const useFeedStore = create<FeedState>()((set, get) => ({
  connection: 'connecting',
  cameras: {},
  setConnection: (connection) => set({ connection }),
  forget: (cameraId) =>
    set((s) => {
      const next = { ...s.cameras }
      delete next[cameraId]
      return { cameras: next }
    }),
  markReanalysing: (cameraId) => {
    set((s) => withFlag(s, cameraId, true))
    const marked = get().cameras[cameraId]?.analysis
    setTimeout(() => {
      // nothing arrived (camera unwatched, API restarted…): stop showing progress
      if (get().cameras[cameraId]?.analysis === marked) set((s) => withFlag(s, cameraId, false))
    }, REANALYSE_TIMEOUT_MS)
  },
  cancelReanalysing: (cameraId) => set((s) => withFlag(s, cameraId, false)),
  handle: (msg, now = Date.now()) =>
    set((s) => {
      if (msg.type !== 'frame' && msg.type !== 'analysis' && msg.type !== 'camera_status') return s
      const prev = s.cameras[msg.cameraId] ?? empty()
      const next =
        msg.type === 'frame'
          ? onFrame(prev, msg, now)
          : msg.type === 'analysis'
            ? { ...prev, analysis: msg, reanalysing: false }
            : onStatus(prev, msg)
      return next === prev ? s : { cameras: { ...s.cameras, [msg.cameraId]: next } }
    }),
}))

function withFlag(s: FeedState, cameraId: string, reanalysing: boolean): Partial<FeedState> {
  const prev = s.cameras[cameraId]
  if (!prev || !!prev.reanalysing === reanalysing) return s
  return { cameras: { ...s.cameras, [cameraId]: { ...prev, reanalysing } } }
}

function onFrame(prev: CameraFeed, msg: FrameMessage, now: number): CameraFeed {
  if (prev.frame?.frameId === msg.frameId) return prev
  // Use the source's capture times: receipt times are distorted by replays on (re)connect.
  const gap = prev.frame ? Date.parse(msg.capturedAt) - Date.parse(prev.frame.capturedAt) : NaN
  const gaps = Number.isFinite(gap) && gap > 0 ? [...prev.gaps, gap].slice(-MAX_GAPS) : prev.gaps
  return { ...prev, frame: msg, lastFrameAt: now, gaps, online: true }
}

function onStatus(prev: CameraFeed, msg: CameraStatusMessage): CameraFeed {
  return { ...prev, online: msg.online, lastError: msg.lastError }
}

/** Median gap between frames (at least 30 s), defaulting to the source's ~70 s cadence. */
export function typicalInterval(feed: CameraFeed | undefined): number {
  const gaps = [...(feed?.gaps ?? [])].sort((a, b) => a - b)
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : SOURCE_INTERVAL_MS
  return Math.max(median, MIN_INTERVAL_MS)
}

export function isStale(feed: CameraFeed | undefined, now: number): boolean {
  if (feed?.lastFrameAt === undefined) return false
  return now - feed.lastFrameAt > 3 * typicalInterval(feed)
}

export const useCameraFeed = (cameraId: string) => useFeedStore((s) => s.cameras[cameraId])
