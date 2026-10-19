import {
  parseCameraInput,
  probeCamera,
  useCameraSelection,
  useCameraStore,
  type ProbeResult,
} from '@/entities/camera'
import { ApiError } from '@/shared/api'

export const FORMAT_HINT = 'Paste a public JPEG image URL, or a Vigo camera number like 04.'

export type AddOutcome =
  { kind: 'added'; probe: ProbeResult; label: string } | { kind: 'duplicate'; cameraId: string }

/**
 * Check a camera source (Vigo id or public JPEG URL) and add it to the watchlist.
 * An already watched camera is highlighted instead of added twice. Throws ApiError.
 */
export async function addCameraFromSource(input: string, name?: string): Promise<AddOutcome> {
  const { cameras, addCamera } = useCameraStore.getState()
  const known = parseCameraInput(input)
  if (known && cameras.some((c) => c.id === known)) return duplicate(known)
  const probe = await probeCamera(input.trim())
  if (useCameraStore.getState().cameras.some((c) => c.id === probe.cameraId)) {
    return duplicate(probe.cameraId)
  }
  const label =
    name?.trim() ||
    (probe.sourceUrl
      ? new URL(probe.sourceUrl).hostname.replace(/^www\./, '')
      : `Camera ${probe.cameraId}`)
  addCamera(probe.cameraId, label, probe.sourceUrl)
  return { kind: 'added', probe, label }
}

function duplicate(cameraId: string): AddOutcome {
  useCameraSelection.getState().highlight(cameraId)
  return { kind: 'duplicate', cameraId }
}

/** User-facing explanation of a failed add. */
export function addErrorMessage(err: unknown, input: string): string {
  const id = parseCameraInput(input)
  if (err instanceof ApiError && err.status === 502) {
    return id
      ? `FreePark couldn't get an image from camera ${id}. Its server may be offline, or may not accept connections from FreePark right now.`
      : "FreePark couldn't get a JPEG image from this link. Check that it's a direct, public image URL; some camera servers also refuse outside connections."
  }
  if (err instanceof ApiError && err.status === 400) return `Invalid camera source. ${FORMAT_HINT}`
  return 'Could not check the camera right now. Is the API running?'
}
