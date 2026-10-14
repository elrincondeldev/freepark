import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useRef, useState } from 'react'
import {
  useCameraSelection,
  useCameraStore,
  type CameraPanel,
  type WatchedCamera,
} from '@/entities/camera'
import { displayStatus, FeedStatusBadge, useDisplayedAnalysis } from '@/entities/feed'
import { ViewManager } from '@/features/manage-views'
import { CameraNameInput } from '@/features/rename-camera'
import { useNow } from '@/shared/lib'
import { ArrowLeftIcon, Button, CloseIcon, fade, IconButton, motionPresets } from '@/shared/ui'
import { useModalBehaviour } from '../model/useModalBehaviour'
import { LivePanel } from './LivePanel'
import { ZoneEditorPanel } from './ZoneEditorPanel'

const PANEL_TITLE: Record<CameraPanel['kind'], string> = {
  live: '',
  views: 'Views',
  zones: 'Zones',
}

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
  const dialogRef = useRef<HTMLElement>(null)

  // Unsaved zone edits: leaving asks first.
  const [dirty, setDirty] = useState(false)
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null)
  const leave = useCallback(
    (action: () => void) => (dirty ? setPendingLeave(() => action) : action()),
    [dirty],
  )
  const back = () =>
    leave(() => showPanel(panel.kind === 'zones' ? { kind: 'views' } : { kind: 'live' }))
  const dismiss = () => (panel.kind === 'live' ? close() : back())

  useModalBehaviour(dialogRef, () => (pendingLeave ? setPendingLeave(null) : dismiss()))

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-6"
      {...fade}
      onClick={dismiss}
    >
      <motion.section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={camera.label}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={motionPresets.base}
        className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-t-3xl border border-line bg-surface p-4 shadow-2xl outline-none sm:rounded-3xl sm:p-6"
      >
        <header className="mb-4 flex min-h-9 items-center gap-2">
          {panel.kind === 'live' ? (
            <CameraNameInput camera={camera} />
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={back} className="-ml-2">
                <ArrowLeftIcon width={16} height={16} />
                Back
              </Button>
              <p className="min-w-0 flex-1 truncate text-sm text-muted">
                {camera.label} <span aria-hidden>/</span>{' '}
                <span className="font-medium text-ink">{PANEL_TITLE[panel.kind]}</span>
              </p>
            </>
          )}
          <FeedStatusBadge status={status} />
          <IconButton label="Close" size="md" onClick={() => leave(close)}>
            <CloseIcon />
          </IconButton>
        </header>

        <AnimatePresence>
          {pendingLeave && (
            <motion.div
              {...fade}
              role="alertdialog"
              aria-label="Unsaved zone"
              className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm"
            >
              <span className="mr-auto">You have an unsaved zone. Leave without saving?</span>
              <Button variant="secondary" size="xs" onClick={() => setPendingLeave(null)}>
                Keep editing
              </Button>
              <Button
                variant="danger"
                size="xs"
                onClick={() => {
                  const action = pendingLeave
                  setPendingLeave(null)
                  setDirty(false)
                  action()
                }}
              >
                Discard
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={panel.kind} {...fade}>
            {panel.kind === 'zones' ? (
              <ZoneEditorPanel
                cameraId={camera.id}
                viewId={panel.viewId}
                onDirtyChange={setDirty}
              />
            ) : panel.kind === 'views' ? (
              <ViewManager
                cameraId={camera.id}
                frameId={displayedId ?? feed?.frame?.frameId ?? null}
                currentViewId={current?.viewId ?? null}
                unknownView={status === 'unknown_view'}
                onEditZones={(viewId) => showPanel({ kind: 'zones', viewId })}
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
          </motion.div>
        </AnimatePresence>
      </motion.section>
    </motion.div>
  )
}
