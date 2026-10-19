import { jsonBody, request, saveBrowserState } from '@/shared/api'
import type { View } from '../model/types'

async function saved<T>(result: Promise<T>): Promise<T> {
  const value = await result
  await saveBrowserState()
  return value
}

export const viewApi = {
  list: (cameraId: string) => request<View[]>(`/api/cameras/${cameraId}/views`),
  create: (cameraId: string, frameId: string, name: string) =>
    saved(
      request<View>(`/api/cameras/${cameraId}/views`, {
        method: 'POST',
        body: jsonBody({ frameId, name }),
      }),
    ),
  rename: (viewId: number, name: string) =>
    saved(request<View>(`/api/views/${viewId}`, { method: 'PATCH', body: jsonBody({ name }) })),
  remove: (viewId: number) => saved(request<void>(`/api/views/${viewId}`, { method: 'DELETE' })),
  recaptureReference: (viewId: number, frameId: string) =>
    saved(
      request<View & { zonesRealigned: boolean }>(`/api/views/${viewId}/reference`, {
        method: 'POST',
        body: jsonBody({ frameId }),
      }),
    ),
}
