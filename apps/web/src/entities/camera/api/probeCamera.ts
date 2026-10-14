import { request } from '@/shared/api'

export interface ProbeResult {
  cameraId: string
  frameId: string
  capturedAt: string
  url: string
}

/** Resolves a pasted URL or id and checks the camera returns an image (502 if not). */
export const probeCamera = (input: string) =>
  request<ProbeResult>(`/api/cameras/probe?input=${encodeURIComponent(input)}`)
