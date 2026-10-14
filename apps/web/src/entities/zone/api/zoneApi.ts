import { jsonBody, request } from '@/shared/api'
import type { Zone, ZoneInput } from '../model/types'

export const zoneApi = {
  list: (viewId: number) => request<Zone[]>(`/api/views/${viewId}/zones`),
  create: (viewId: number, zone: ZoneInput) =>
    request<Zone>(`/api/views/${viewId}/zones`, { method: 'POST', body: jsonBody(zone) }),
  update: (zoneId: number, patch: Partial<ZoneInput>) =>
    request<Zone>(`/api/zones/${zoneId}`, { method: 'PATCH', body: jsonBody(patch) }),
  remove: (zoneId: number) => request<void>(`/api/zones/${zoneId}`, { method: 'DELETE' }),
}
