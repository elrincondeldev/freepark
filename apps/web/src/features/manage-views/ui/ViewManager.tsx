import { AnimatePresence } from 'framer-motion'
import { viewApi } from '@/entities/view'
import { useViews } from '../model/useViews'
import { SaveViewForm } from './SaveViewForm'
import { ViewCard } from './ViewCard'

export interface ViewManagerProps {
  cameraId: string
  /** frame currently shown, used to save or re-capture a view */
  frameId: string | null
  currentViewId: number | null
  unknownView: boolean
  onEditZones: (viewId: number) => void
  onClose: () => void
}

export function ViewManager({
  cameraId,
  frameId,
  currentViewId,
  unknownView,
  onEditZones,
  onClose,
}: ViewManagerProps) {
  const { views, error, busy, run } = useViews(cameraId)

  async function save(name: string) {
    if (!frameId) return
    const view = await run(() =>
      viewApi.create(cameraId, frameId, name || `View ${(views?.length ?? 0) + 1}`),
    )
    if (view) onEditZones(view.id) // straight into drawing its zones
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Camera views</h3>
        <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
          Done
        </button>
      </div>
      <p className="text-sm text-muted">
        Cameras turn between a few fixed directions. Save each direction you care about once and
        draw its curb zones; we recognise it automatically every time the camera points there again.
      </p>

      <SaveViewForm unknownView={unknownView} disabled={!frameId || busy} onSave={save} />

      {error && (
        <p role="alert" className="text-sm text-busy">
          {error}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AnimatePresence>
          {views?.map((v) => (
            <ViewCard
              key={v.id}
              view={v}
              isCurrent={v.id === currentViewId}
              canRecapture={!!frameId && !busy}
              onRename={(name) => run(() => viewApi.rename(v.id, name))}
              onEditZones={() => onEditZones(v.id)}
              onRecapture={() => frameId && run(() => viewApi.recaptureReference(v.id, frameId))}
              onDelete={() => run(() => viewApi.remove(v.id))}
            />
          ))}
        </AnimatePresence>
      </ul>
      {views?.length === 0 && <p className="text-sm text-muted">No views saved yet.</p>}
    </div>
  )
}
