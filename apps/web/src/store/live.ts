import { create } from 'zustand'
import {
  detectAvailability,
  emptyMemory,
  type AvailabilityEvent,
  type AvailabilityMemory,
} from '../lib/availability'
import type { ConnectionState } from '../lib/ws'
import type {
  AnalysisMessage,
  CameraStatusMessage,
  FrameMessage,
  ServerMessage,
} from '../lib/types'

export interface CameraLive {
  frame?: FrameMessage
  analysis?: AnalysisMessage
  online: boolean
  lastError?: string
  /** client clock (ms) when the latest frame arrived */
  lastFrameAt?: number
  /** recent gaps between source capture times (ms), to estimate the update cadence */
  gaps: number[]
  availability: AvailabilityMemory
}

interface LiveState {
  connection: ConnectionState
  cameras: Record<string, CameraLive>
  setConnection: (c: ConnectionState) => void
  handle: (msg: ServerMessage, now?: number) => void
  forget: (cameraId: string) => void
}

const empty = (): CameraLive => ({ online: true, gaps: [], availability: emptyMemory() })

type Listener = (event: AvailabilityEvent) => void
const listeners = new Set<Listener>()

/** Subscribe to "a space just opened" events; returns an unsubscribe function. */
export function onAvailability(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const MAX_GAPS = 6

export const useLiveStore = create<LiveState>()((set) => ({
  connection: 'connecting',
  cameras: {},
  setConnection: (connection) => set({ connection }),
  forget: (cameraId) =>
    set((s) => {
      const next = { ...s.cameras }
      delete next[cameraId]
      return { cameras: next }
    }),
  handle: (msg, now = Date.now()) =>
    set((s) => {
      if (msg.type !== 'frame' && msg.type !== 'analysis' && msg.type !== 'camera_status') return s
      const prev = s.cameras[msg.cameraId] ?? empty()
      let next: CameraLive = prev
      if (msg.type === 'frame') next = onFrame(prev, msg, now)
      else if (msg.type === 'analysis') {
        const { memory, event } = detectAvailability(prev.availability, msg, now)
        next = { ...prev, analysis: msg, availability: memory }
        if (event) queueMicrotask(() => listeners.forEach((l) => l(event)))
      } else next = onStatus(prev, msg)
      return { cameras: { ...s.cameras, [msg.cameraId]: next } }
    }),
}))

function onFrame(prev: CameraLive, msg: FrameMessage, now: number): CameraLive {
  if (prev.frame?.frameId === msg.frameId) return prev
  // Use the source's capture times: receipt times are distorted by replays on (re)connect.
  const gap = prev.frame ? Date.parse(msg.capturedAt) - Date.parse(prev.frame.capturedAt) : NaN
  const gaps = Number.isFinite(gap) && gap > 0 ? [...prev.gaps, gap].slice(-MAX_GAPS) : prev.gaps
  return { ...prev, frame: msg, lastFrameAt: now, gaps, online: true }
}

function onStatus(prev: CameraLive, msg: CameraStatusMessage): CameraLive {
  return { ...prev, online: msg.online, lastError: msg.lastError }
}

const DEFAULT_INTERVAL = 70_000 // the Vigo source updates roughly every 70 s
const MIN_INTERVAL = 30_000

/** Median gap between frames (at least 30 s), defaulting to the source's ~70 s cadence. */
export function typicalInterval(live: CameraLive | undefined): number {
  const gaps = [...(live?.gaps ?? [])].sort((a, b) => a - b)
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : DEFAULT_INTERVAL
  return Math.max(median, MIN_INTERVAL)
}

export function isStale(live: CameraLive | undefined, now: number): boolean {
  if (live?.lastFrameAt === undefined) return false
  return now - live.lastFrameAt > 3 * typicalInterval(live)
}
