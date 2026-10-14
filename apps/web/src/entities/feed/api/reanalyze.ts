import { request } from '@/shared/api'

/**
 * Re-run analysis of a watched camera's latest frame. `fresh` asks the AI model again
 * (one prediction); otherwise only views/zones are re-evaluated with cached detections.
 */
export const reanalyzeCamera = (cameraId: string, fresh = false) =>
  request<{ queued: boolean }>(`/api/cameras/${cameraId}/reanalyze?fresh=${fresh}`, {
    method: 'POST',
  })
