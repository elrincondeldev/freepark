import { jsonBody, request } from '@/shared/api'
import type { WatchedCamera } from '../model/types'

export interface ProbeResult {
  cameraId: string
  frameId: string
  capturedAt: string
  url: string
  sourceUrl?: string
}

/** Resolves a pasted URL or id and checks the camera returns an image (502 if not). */
export const probeCamera = (input: string) =>
  request<ProbeResult>(`/api/cameras/probe?input=${encodeURIComponent(input)}`)

/** Restore user camera URLs into the API's temporary session before live monitoring starts. */
export async function registerCameraSources(cameras: WatchedCamera[]): Promise<void> {
  const sources = Object.fromEntries(
    cameras.filter((camera) => camera.sourceUrl).map((camera) => [camera.id, camera.sourceUrl]),
  )
  if (!Object.keys(sources).length) return
  await request('/api/cameras/sources', { method: 'POST', body: jsonBody({ sources }) })
}
