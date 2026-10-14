import type { AnalysisMessage, FrameMessage } from '../lib/types'

export const frameMsg = (frameId: string, cameraId = '47'): FrameMessage => ({
  type: 'frame',
  cameraId,
  frameId,
  capturedAt: '2026-10-14T07:30:00+00:00',
  url: `/api/cameras/${cameraId}/frames/${frameId}.jpg`,
})

export const analysisMsg = (
  frameId: string,
  over: Partial<AnalysisMessage> = {},
  cameraId = '47',
): AnalysisMessage => ({
  type: 'analysis',
  cameraId,
  frameId,
  capturedAt: '',
  analysedAt: '',
  status: 'ok',
  viewId: 1,
  viewName: 'Avenue',
  viewConfidence: 0.9,
  vehicles: [
    { box: [0.6, 0.7, 0.7, 0.85], cls: 'car', conf: 0.8, zoneId: 5 },
    { box: [0.62, 0.5, 0.68, 0.6], cls: 'car', conf: 0.7, zoneId: 5 },
    { box: [0.3, 0.5, 0.36, 0.6], cls: 'car', conf: 0.6, zoneId: null },
  ],
  zones: [
    {
      zoneId: 5,
      name: 'Right curb',
      spaces: 1,
      occupied: [],
      available: [
        {
          polygon: [
            [0.6, 0.6],
            [0.65, 0.6],
            [0.64, 0.68],
            [0.59, 0.68],
          ],
          spaces: 1,
        },
      ],
    },
  ],
  totalAvailable: 1,
  ...over,
})
