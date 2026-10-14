import { AnimatePresence } from 'framer-motion'
import { useFeedStore } from '@/entities/feed'
import { viewApi } from '@/entities/view'
import { toast } from '@/shared/ui'
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
}

export function ViewManager({
  cameraId,
  frameId,
  currentViewId,
  unknownView,
  onEditZones,
}: ViewManagerProps) {
  const { views, error, busy, run } = useViews(cameraId)
  const markReanalysing = useFeedStore((s) => s.markReanalysing)

  /** Views changed: the API re-analyses the latest image; show progress meanwhile. */
  const changed = <T,>(result: T | undefined) => {
    if (result !== undefined) markReanalysing(cameraId)
    return result
  }

  async function save(name: string) {
    if (!frameId) return
    const view = changed(
      await run(() =>
        viewApi.create(cameraId, frameId, name || `View ${(views?.length ?? 0) + 1}`),
      ),
    )
    if (view) onEditZones(view.id) // straight into drawing its zones
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-semibold">Camera views</h3>
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
              onRecapture={async () => {
                if (!frameId) return
                const result = changed(await run(() => viewApi.recaptureReference(v.id, frameId)))
                if (result)
                  toast({
                    title: `“${v.name}” reference updated`,
                    body: result.zonesRealigned
                      ? 'Its zones were moved to match the new image.'
                      : 'Check its zones: the new image looks different.',
                  })
              }}
              onDelete={async () => changed(await run(() => viewApi.remove(v.id)))}
            />
          ))}
        </AnimatePresence>
      </ul>
      {views?.length === 0 && <p className="text-sm text-muted">No views saved yet.</p>}
    </div>
  )
}
