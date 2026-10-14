// Live feed contract with the API (see apps/api/README.md, design D2).
import type { Box, Point } from '@/shared/lib'

export type AnalysisStatus =
  'ok' | 'unknown_view' | 'low_quality' | 'analysis_unavailable' | 'analysis_disabled'

export interface FrameMessage {
  type: 'frame'
  cameraId: string
  frameId: string
  capturedAt: string
  url: string
}

export interface Vehicle {
  box: Box
  cls: string
  conf: number
  zoneId: number | null
}

export interface ZoneAvailability {
  zoneId: number
  name: string
  spaces: number
  occupied: { polygon: Point[] }[]
  available: { polygon: Point[]; spaces: number }[]
}

export interface AnalysisMessage {
  type: 'analysis'
  cameraId: string
  frameId: string
  capturedAt: string
  analysedAt: string
  status: AnalysisStatus
  viewId: number | null
  viewName: string | null
  viewConfidence: number | null
  vehicles: Vehicle[]
  zones: ZoneAvailability[]
  totalAvailable: number | null
  reason?: string
  qualityReason?: string
}

export interface CameraStatusMessage {
  type: 'camera_status'
  cameraId: string
  online: boolean
  lastError?: string
}

export type ServerMessage =
  | FrameMessage
  | AnalysisMessage
  | CameraStatusMessage
  | { type: 'subscribed'; cameras: string[] }
  | { type: 'error'; message: string }

export const subscribeMessage = (cameras: string[]) => ({ type: 'subscribe', cameras })
