import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { View } from '../lib/types'
import { useUiStore } from '../store/ui'

export function ViewManager({
  cameraId,
  frameId,
  currentViewId,
  unknownView,
  onClose,
}: {
  cameraId: string
  frameId: string | null
  currentViewId: number | null
  unknownView: boolean
  onClose: () => void
}) {
  const [views, setViews] = useState<View[] | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const openEditor = useUiStore((s) => s.openEditor)

  const load = useCallback(async () => {
    try {
      setViews(await api.listViews(cameraId))
    } catch {
      setError('Could not load views.')
    }
  }, [cameraId])

  useEffect(() => {
    load()
  }, [load])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function saveCurrent() {
    if (!frameId) return
    setBusy(true)
    setError(null)
    try {
      const view = await api.createView(
        cameraId,
        frameId,
        name.trim() || `View ${(views?.length ?? 0) + 1}`,
      )
      setName('')
      openEditor({ cameraId, mode: 'zones', viewId: view.id })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the view.')
    } finally {
      setBusy(false)
    }
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

      <form
        onSubmit={(e) => {
          e.preventDefault()
          saveCurrent()
        }}
        className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center ${
          unknownView ? 'border-warn/50 bg-warn/10' : 'border-line'
        }`}
      >
        <span className="text-sm font-medium sm:mr-auto">
          {unknownView ? 'The camera is showing a new view' : 'Save what the camera shows now'}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name, e.g. Towards the port"
          aria-label="New view name"
          maxLength={80}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={!frameId || busy}
          className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-bg disabled:opacity-40"
        >
          Save this view
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-busy">
          {error}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AnimatePresence>
          {views?.map((v) => (
            <motion.li
              key={v.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`overflow-hidden rounded-xl border bg-surface ${
                v.id === currentViewId ? 'border-free' : 'border-line'
              }`}
            >
              <div className="relative aspect-video bg-surface-2">
                {v.referenceUrl && (
                  <img
                    src={v.referenceUrl}
                    alt={`Reference of ${v.name}`}
                    className="h-full w-full object-cover"
                  />
                )}
                {v.id === currentViewId && (
                  <span className="absolute left-2 top-2 rounded-full bg-free px-2 py-0.5 text-[11px] font-medium text-white">
                    Showing now
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2 p-3">
                <input
                  defaultValue={v.name}
                  aria-label={`Rename ${v.name}`}
                  onBlur={(e) => {
                    const next = e.target.value.trim()
                    if (next && next !== v.name) run(() => api.renameView(v.id, next))
                  }}
                  className="rounded-md bg-transparent px-1 text-sm font-medium hover:bg-surface-2 focus:bg-surface-2"
                />
                <p className="px-1 text-xs text-muted">
                  {v.zoneCount} zone{v.zoneCount === 1 ? '' : 's'}
                </p>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => openEditor({ cameraId, mode: 'zones', viewId: v.id })}
                    className="rounded-full bg-ink px-3 py-1 font-medium text-bg"
                  >
                    Edit zones
                  </button>
                  <button
                    type="button"
                    disabled={!frameId || busy}
                    onClick={() => run(() => api.recaptureReference(v.id, frameId!))}
                    title="Use the current image as this view's reference"
                    className="rounded-full border border-line px-3 py-1 disabled:opacity-40"
                  >
                    Re-capture
                  </button>
                  {confirmDelete === v.id ? (
                    <button
                      type="button"
                      onClick={() =>
                        run(() => api.deleteView(v.id)).then(() => setConfirmDelete(null))
                      }
                      className="rounded-full bg-busy px-3 py-1 font-medium text-white"
                    >
                      Delete view + zones?
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(v.id)}
                      className="rounded-full px-3 py-1 text-busy hover:bg-busy/10"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {views?.length === 0 && <p className="text-sm text-muted">No views saved yet.</p>}
    </div>
  )
}
