import { jsonBody, request } from '@/shared/api'
import type { View } from '../model/types'

export const viewApi = {
  list: (cameraId: string) => request<View[]>(`/api/cameras/${cameraId}/views`),
  create: (cameraId: string, frameId: string, name: string) =>
    request<View>(`/api/cameras/${cameraId}/views`, {
      method: 'POST',
      body: jsonBody({ frameId, name }),
    }),
  rename: (viewId: number, name: string) =>
    request<View>(`/api/views/${viewId}`, { method: 'PATCH', body: jsonBody({ name }) }),
  remove: (viewId: number) => request<void>(`/api/views/${viewId}`, { method: 'DELETE' }),
  recaptureReference: (viewId: number, frameId: string) =>
    request<View & { zonesRealigned: boolean }>(`/api/views/${viewId}/reference`, {
      method: 'POST',
      body: jsonBody({ frameId }),
    }),
}
