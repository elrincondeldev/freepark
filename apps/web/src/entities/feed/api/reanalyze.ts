import { request } from '@/shared/api'
import type { AnalysisMessage } from '../model/messages'

export interface ReanalyzeResult {
  cameraId: string
  /** true: queued on the camera's monitor, the result arrives over the WebSocket */
  queued: boolean
  fresh: boolean
  /** present when the API analysed the image immediately */
  analysis?: AnalysisMessage
}

/**
 * Re-run analysis of a camera's latest image. `fresh` asks the AI model again (one
 * prediction); otherwise only views/zones are re-evaluated with cached detections.
 */
export const reanalyzeCamera = (cameraId: string, fresh = false, replicateApiKey = '') =>
  request<ReanalyzeResult>(`/api/cameras/${cameraId}/reanalyze?fresh=${fresh}`, {
    method: 'POST',
    headers: replicateApiKey ? { 'Replicate-Api-Key': replicateApiKey } : undefined,
  })
