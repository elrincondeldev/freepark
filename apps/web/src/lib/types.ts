// Mirrors the API contract in apps/api/README.md (design D2).

export type Point = [number, number]
export type Box = [number, number, number, number]

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

export interface SubscribedMessage {
  type: 'subscribed'
  cameras: string[]
}

export interface ErrorMessage {
  type: 'error'
  message: string
}

export type ServerMessage =
  FrameMessage | AnalysisMessage | CameraStatusMessage | SubscribedMessage | ErrorMessage

export interface SubscribeMessage {
  type: 'subscribe'
  cameras: string[]
}

export interface ProbeResult {
  cameraId: string
  frameId: string
  capturedAt: string
  url: string
}

export interface View {
  id: number
  cameraId: string
  name: string
  createdAt: string
  referenceUrl: string | null
  exemplarCount: number
  zoneCount: number
}

export interface Zone {
  id: number
  viewId: number
  name: string
  points: Point[]
  bandNear: number
  bandFar: number
  minGapCars: number | null
  updatedAt: string
}

export type ZoneInput = Omit<Zone, 'id' | 'viewId' | 'updatedAt'>
