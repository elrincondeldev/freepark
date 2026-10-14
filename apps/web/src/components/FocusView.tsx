import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { toggleAlerts } from '../lib/alerts'
import { displayStatus } from '../lib/cameraStatus'
import { notificationPermission } from '../lib/notify'
import type { View } from '../lib/types'
import { api } from '../lib/api'
import { useDisplayedAnalysis } from '../hooks/useDisplayedAnalysis'
import { formatAgo, useNow } from '../hooks/useNow'
import { useCameraStore } from '../store/cameras'
import { useUiStore } from '../store/ui'
import { AnimatedCount } from './AnimatedCount'
import { FreeChip } from './CameraCard'
import { CameraImage } from './CameraImage'
import { BellIcon, BellOffIcon, CloseIcon } from './icons'
import { Overlay } from './Overlay'
import { StatusBadge } from './StatusBadge'
import { ViewManager } from './ViewManager'
import { ZoneEditor } from './ZoneEditor'

export function FocusLayer() {
  const focusId = useUiStore((s) => s.focusId)
  const camera = useCameraStore((s) => s.cameras.find((c) => c.id === focusId))
  return (
    <AnimatePresence>
      {camera && <FocusView key={camera.id} cameraId={camera.id} />}
    </AnimatePresence>
  )
}

function FocusView({ cameraId }: { cameraId: string }) {
  const camera = useCameraStore((s) => s.cameras.find((c) => c.id === cameraId))!
  const renameCamera = useCameraStore((s) => s.renameCamera)
  const focus = useUiStore((s) => s.focus)
  const editor = useUiStore((s) => s.editor)
  const openEditor = useUiStore((s) => s.openEditor)
  const now = useNow()
  const { live, current, previous, displayedId, onDisplayed } = useDisplayedAnalysis(cameraId)
  const status = displayStatus(live, now)
  const [showOthers, setShowOthers] = useState(true)
  const shown = current ?? previous

  useEffect(() => {
    const onKey = (e: KeyboardEvent) =>
      e.key === 'Escape' && (editor ? openEditor(null) : focus(null))
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor, focus, openEditor])

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => focus(null)}
    >
      <motion.section
        layoutId={`card-${cameraId}`}
        role="dialog"
        aria-modal="true"
        aria-label={camera.label}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-t-3xl border border-line bg-surface p-4 shadow-2xl sm:rounded-3xl sm:p-6"
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      >
        <header className="mb-4 flex items-center gap-3">
          <input
            defaultValue={camera.label}
            aria-label="Camera name"
            onBlur={(e) => renameCamera(cameraId, e.target.value)}
            className="min-w-0 flex-1 rounded-lg bg-transparent px-1 text-xl font-semibold tracking-tight hover:bg-surface-2 focus:bg-surface-2"
          />
          <StatusBadge status={status} />
          <button
            type="button"
            onClick={() => focus(null)}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-2"
          >
            <CloseIcon />
          </button>
        </header>

        {editor?.cameraId === cameraId && editor.mode === 'zones' ? (
          <ZoneEditorLoader
            cameraId={cameraId}
            viewId={editor.viewId}
            onClose={() => openEditor(null)}
          />
        ) : editor?.cameraId === cameraId && editor.mode === 'views' ? (
          <ViewManager
            cameraId={cameraId}
            frameId={displayedId ?? live?.frame?.frameId ?? null}
            currentViewId={current?.viewId ?? null}
            unknownView={status === 'unknown_view'}
            onClose={() => openEditor(null)}
          />
        ) : (
          <div className="flex flex-col gap-5 lg:flex-row">
            <div className="relative aspect-video min-w-0 flex-1 overflow-hidden rounded-2xl bg-surface-2">
              <CameraImage
                frame={live?.frame}
                alt={`Camera ${cameraId}`}
                onDisplayed={onDisplayed}
              />
              <Overlay analysis={shown} faded={!current} showOthers={showOthers} />
              <div className="absolute right-3 top-3">
                <FreeChip total={current?.totalAvailable ?? null} large />
              </div>
            </div>

            <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-80">
              <div className="text-sm text-muted">
                {live?.lastFrameAt
                  ? `Image updated ${formatAgo(now - live.lastFrameAt)}`
                  : 'Waiting for image…'}
                {current?.viewName && (
                  <>
                    {' · '}
                    <span className="text-ink">{current.viewName}</span>
                    {current.viewConfidence !== null && (
                      <span> ({Math.round(current.viewConfidence * 100)}% match)</span>
                    )}
                  </>
                )}
              </div>

              {status === 'unknown_view' && (
                <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
                  <p className="font-medium text-warn">The camera is pointing somewhere new.</p>
                  <p className="mt-1 text-muted">
                    Save this view and draw its curb zones to see free spaces here.
                  </p>
                  <button
                    type="button"
                    onClick={() => openEditor({ cameraId, mode: 'views' })}
                    className="mt-2 rounded-full bg-warn px-3 py-1 text-xs font-semibold text-black"
                  >
                    Save this view
                  </button>
                </div>
              )}

              <ZoneBreakdown zones={current?.zones ?? []} />

              <div className="flex flex-col gap-2 text-sm">
                <Toggle
                  checked={camera.notify}
                  onChange={() => toggleAlerts(cameraId)}
                  label="Alert me when a space opens"
                  icon={camera.notify ? <BellIcon /> : <BellOffIcon />}
                />
                {camera.notify && notificationPermission() === 'denied' && (
                  <p className="px-1 text-xs text-muted" role="note">
                    Browser notifications are blocked for this site, so alerts only appear while the
                    app is open. Allow notifications in your browser's site settings to get them in
                    the background.
                  </p>
                )}
                <Toggle
                  checked={showOthers}
                  onChange={() => setShowOthers(!showOthers)}
                  label="Show other vehicles"
                />
              </div>

              <div className="mt-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openEditor({ cameraId, mode: 'views' })}
                  className="rounded-full border border-line px-4 py-2 text-sm hover:bg-surface-2"
                >
                  Manage views
                </button>
                {current?.viewId != null && (
                  <button
                    type="button"
                    onClick={() => openEditor({ cameraId, mode: 'zones', viewId: current.viewId! })}
                    className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
                  >
                    Edit zones
                  </button>
                )}
              </div>
            </aside>
          </div>
        )}
      </motion.section>
    </motion.div>
  )
}

function ZoneBreakdown({ zones }: { zones: { zoneId: number; name: string; spaces: number }[] }) {
  if (zones.length === 0) return null
  return (
    <ul
      className="flex flex-col divide-y divide-line rounded-xl border border-line"
      aria-label="Zones"
    >
      {zones.map((z, i) => (
        <motion.li
          key={z.zoneId}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex items-center justify-between px-3 py-2 text-sm"
        >
          <span className="truncate">{z.name}</span>
          <span
            className={`flex items-baseline gap-1 font-semibold ${z.spaces > 0 ? 'text-free' : 'text-muted'}`}
          >
            <AnimatedCount value={z.spaces} />
            <span className="text-xs font-normal">free</span>
          </span>
        </motion.li>
      ))}
    </ul>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  icon,
}: {
  checked: boolean
  onChange: () => void
  label: string
  icon?: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-surface-2"
    >
      <span
        className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-free' : 'bg-line'}`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow ${checked ? 'right-0.5' : 'left-0.5'}`}
        />
      </span>
      {icon && <span className="text-muted">{icon}</span>}
      {label}
    </button>
  )
}

function ZoneEditorLoader({
  cameraId,
  viewId,
  onClose,
}: {
  cameraId: string
  viewId: number
  onClose: () => void
}) {
  const [view, setView] = useState<View | null>(null)
  useEffect(() => {
    api.listViews(cameraId).then((vs) => setView(vs.find((v) => v.id === viewId) ?? null))
  }, [cameraId, viewId])
  if (!view) return <p className="text-sm text-muted">Loading…</p>
  return <ZoneEditor view={view} onClose={onClose} />
}
