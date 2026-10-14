import type { ProbeResult, View, Zone, ZoneInput } from './types'

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  })
  if (!resp.ok) {
    let message = resp.statusText
    try {
      const body = await resp.json()
      if (typeof body?.detail === 'string') message = body.detail
      else if (Array.isArray(body?.detail)) message = body.detail[0]?.msg ?? message
    } catch {
      /* not JSON */
    }
    throw new ApiError(resp.status, message)
  }
  return resp.status === 204 ? (undefined as T) : ((await resp.json()) as T)
}

const json = (body: unknown) => JSON.stringify(body)

export const api = {
  probe: (input: string) =>
    request<ProbeResult>(`/api/cameras/probe?input=${encodeURIComponent(input)}`),
  listViews: (cameraId: string) => request<View[]>(`/api/cameras/${cameraId}/views`),
  createView: (cameraId: string, frameId: string, name: string) =>
    request<View>(`/api/cameras/${cameraId}/views`, {
      method: 'POST',
      body: json({ frameId, name }),
    }),
  renameView: (viewId: number, name: string) =>
    request<View>(`/api/views/${viewId}`, { method: 'PATCH', body: json({ name }) }),
  deleteView: (viewId: number) => request<void>(`/api/views/${viewId}`, { method: 'DELETE' }),
  recaptureReference: (viewId: number, frameId: string) =>
    request<View & { zonesRealigned: boolean }>(`/api/views/${viewId}/reference`, {
      method: 'POST',
      body: json({ frameId }),
    }),
  listZones: (viewId: number) => request<Zone[]>(`/api/views/${viewId}/zones`),
  createZone: (viewId: number, zone: ZoneInput) =>
    request<Zone>(`/api/views/${viewId}/zones`, { method: 'POST', body: json(zone) }),
  updateZone: (zoneId: number, patch: Partial<ZoneInput>) =>
    request<Zone>(`/api/zones/${zoneId}`, { method: 'PATCH', body: json(patch) }),
  deleteZone: (zoneId: number) => request<void>(`/api/zones/${zoneId}`, { method: 'DELETE' }),
}
