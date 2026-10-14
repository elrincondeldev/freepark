import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { useCameraSelection, useCameraStore, type WatchedCamera } from '@/entities/camera'
import { displayStatus, FeedStatusBadge, useDisplayedAnalysis } from '@/entities/feed'
import { ViewManager } from '@/features/manage-views'
import { CameraNameInput } from '@/features/rename-camera'
import { useNow } from '@/shared/lib'
import { CloseIcon, IconButton } from '@/shared/ui'
import { LivePanel } from './LivePanel'
import { ZoneEditorPanel } from './ZoneEditorPanel'

/** Modal focus view for the selected camera (live image, views, zone editor). */
export function CameraFocusLayer() {
  const focusedId = useCameraSelection((s) => s.focusedId)
  const camera = useCameraStore((s) => s.cameras.find((c) => c.id === focusedId))
  return (
    <AnimatePresence>
      {camera && <CameraFocusDialog key={camera.id} camera={camera} />}
    </AnimatePresence>
  )
}

function CameraFocusDialog({ camera }: { camera: WatchedCamera }) {
  const panel = useCameraSelection((s) => s.panel)
  const showPanel = useCameraSelection((s) => s.showPanel)
  const close = useCameraSelection((s) => s.close)
  const now = useNow()
  const display = useDisplayedAnalysis(camera.id)
  const { feed, current, displayedId } = display
  const status = displayStatus(feed, now)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (panel.kind === 'live') close()
      else showPanel({ kind: 'live' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel, close, showPanel])

  const backToLive = () => showPanel({ kind: 'live' })

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={close}
    >
      <motion.section
        layoutId={`card-${camera.id}`}
        role="dialog"
        aria-modal="true"
        aria-label={camera.label}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-t-3xl border border-line bg-surface p-4 shadow-2xl sm:rounded-3xl sm:p-6"
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      >
        <header className="mb-4 flex items-center gap-3">
          <CameraNameInput camera={camera} />
          <FeedStatusBadge status={status} />
          <IconButton label="Close" size="md" onClick={close}>
            <CloseIcon />
          </IconButton>
        </header>

        {panel.kind === 'zones' ? (
          <ZoneEditorPanel cameraId={camera.id} viewId={panel.viewId} onClose={backToLive} />
        ) : panel.kind === 'views' ? (
          <ViewManager
            cameraId={camera.id}
            frameId={displayedId ?? feed?.frame?.frameId ?? null}
            currentViewId={current?.viewId ?? null}
            unknownView={status === 'unknown_view'}
            onEditZones={(viewId) => showPanel({ kind: 'zones', viewId })}
            onClose={backToLive}
          />
        ) : (
          <LivePanel
            camera={camera}
            display={display}
            status={status}
            now={now}
            onShowPanel={showPanel}
          />
        )}
      </motion.section>
    </motion.div>
  )
}
