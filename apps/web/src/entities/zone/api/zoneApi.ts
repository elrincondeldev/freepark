import { jsonBody, request, saveBrowserState } from '@/shared/api'
import type { Zone, ZoneInput } from '../model/types'

async function saved<T>(result: Promise<T>): Promise<T> {
  const value = await result
  await saveBrowserState()
  return value
}

export const zoneApi = {
  list: (viewId: number) => request<Zone[]>(`/api/views/${viewId}/zones`),
  create: (viewId: number, zone: ZoneInput) =>
    saved(request<Zone>(`/api/views/${viewId}/zones`, { method: 'POST', body: jsonBody(zone) })),
  update: (zoneId: number, patch: Partial<ZoneInput>) =>
    saved(request<Zone>(`/api/zones/${zoneId}`, { method: 'PATCH', body: jsonBody(patch) })),
  remove: (zoneId: number) => saved(request<void>(`/api/zones/${zoneId}`, { method: 'DELETE' })),
}
