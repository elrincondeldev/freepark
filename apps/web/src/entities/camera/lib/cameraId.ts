/** Client-side mirror of the API's camera input parsing (apps/api/app/camera_ids.py). */
const ID_RE = /^\d{1,3}$/
const CUSTOM_ID_RE = /^c_[0-9a-f]{24}$/

export function normalizeCameraId(raw: string): string | null {
  const v = raw.trim()
  if (CUSTOM_ID_RE.test(v)) return v
  return ID_RE.test(v) ? v.padStart(2, '0') : null
}

export function parseCameraInput(raw: string): string | null {
  const v = raw.trim()
  const direct = ID_RE.test(v) ? normalizeCameraId(v) : null
  if (direct) return direct
  try {
    const url = new URL(v.includes('://') ? v : `https://${v}`)
    if (url.hostname !== 'camaras.vigo.org' || !url.pathname.endsWith('/cam.php')) return null
    const id = url.searchParams.get('id')
    return id ? normalizeCameraId(id) : null
  } catch {
    return null
  }
}
