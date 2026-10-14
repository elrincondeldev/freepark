import { useEffect, useState } from 'react'
import { viewApi, type View } from '@/entities/view'
import { ZoneEditor } from '@/features/edit-zones'

/** Loads the view (for its reference image) before showing the zone editor. */
export function ZoneEditorPanel({
  cameraId,
  viewId,
  onDirtyChange,
}: {
  cameraId: string
  viewId: number
  onDirtyChange: (dirty: boolean) => void
}) {
  const [view, setView] = useState<View | null>(null)
  useEffect(() => {
    viewApi.list(cameraId).then((views) => setView(views.find((v) => v.id === viewId) ?? null))
  }, [cameraId, viewId])
  if (!view) return <p className="text-sm text-muted">Loading…</p>
  return <ZoneEditor view={view} onDirtyChange={onDirtyChange} />
}
