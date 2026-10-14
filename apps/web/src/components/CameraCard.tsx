import { motion } from 'framer-motion'
import { forwardRef } from 'react'
import { toggleAlerts } from '../lib/alerts'
import { displayStatus } from '../lib/cameraStatus'
import { useDisplayedAnalysis } from '../hooks/useDisplayedAnalysis'
import { formatAgo, useNow } from '../hooks/useNow'
import { useCameraStore, type WatchedCamera } from '../store/cameras'
import { useUiStore } from '../store/ui'
import { AnimatedCount } from './AnimatedCount'
import { CameraImage } from './CameraImage'
import { BellIcon, BellOffIcon, CloseIcon } from './icons'
import { Overlay } from './Overlay'
import { StatusBadge } from './StatusBadge'

export const CameraCard = forwardRef<HTMLElement, { camera: WatchedCamera; index: number }>(
  function CameraCard({ camera, index }, ref) {
    const now = useNow()
    const { live, current, previous, onDisplayed } = useDisplayedAnalysis(camera.id)
    const status = displayStatus(live, now)
    const highlighted = useUiStore((s) => s.highlightId === camera.id)
    const focus = useUiStore((s) => s.focus)
    const openEditor = useUiStore((s) => s.openEditor)
    const removeCamera = useCameraStore((s) => s.removeCamera)
    const total = current?.totalAvailable ?? null
    const analysing = status === 'analysing'

    return (
      <motion.article
        ref={ref}
        layout
        layoutId={`card-${camera.id}`}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{
          opacity: 1,
          y: 0,
          scale: highlighted ? [1, 1.025, 1] : 1,
          boxShadow: highlighted ? '0 0 0 3px var(--accent)' : '0 1px 2px rgba(0,0,0,0.06)',
        }}
        exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.2 } }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, delay: index * 0.04 }}
        className="group relative overflow-hidden rounded-2xl border border-line bg-surface"
        aria-label={`${camera.label}, ${total === null ? 'availability unknown' : `${total} free`}`}
        data-status={status}
      >
        <button
          type="button"
          onClick={() => focus(camera.id)}
          className="relative block aspect-video w-full overflow-hidden bg-surface-2 text-left"
          aria-label={`Open ${camera.label}`}
        >
          <CameraImage frame={live?.frame} alt={`Camera ${camera.id}`} onDisplayed={onDisplayed} />
          <Overlay analysis={current ?? previous} faded={!current} />
          {analysing && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-accent/20">
              <div
                className="h-full w-1/3 bg-accent"
                style={{ animation: 'shimmer 1.2s linear infinite' }}
              />
            </div>
          )}
          {!live?.frame && (
            <div className="absolute inset-0 grid place-items-center text-sm text-muted">
              {status === 'offline' ? 'Camera offline' : 'Waiting for image…'}
            </div>
          )}
          <div className="absolute right-2 top-2">
            <FreeChip total={total} />
          </div>
        </button>
        {status === 'unknown_view' && (
          <button
            type="button"
            onClick={() => {
              focus(camera.id)
              openEditor({ cameraId: camera.id, mode: 'views' })
            }}
            className="absolute bottom-[4.25rem] left-2 rounded-full bg-warn px-3 py-1 text-xs font-semibold text-black shadow-md hover:opacity-90"
          >
            Save view
          </button>
        )}

        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="min-w-0 truncate text-sm font-semibold">{camera.label}</h2>
              <StatusBadge status={status} />
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {live?.lastFrameAt
                ? `Updated ${formatAgo(now - live.lastFrameAt)}`
                : `Camera ${camera.id}`}
              {current?.viewName ? ` · ${current.viewName}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleAlerts(camera.id)}
            aria-pressed={camera.notify}
            aria-label={camera.notify ? 'Turn off alerts' : 'Alert me when a space opens'}
            title={camera.notify ? 'Alerts on' : 'Alerts off'}
            className={`grid h-8 w-8 place-items-center rounded-full transition ${
              camera.notify ? 'bg-free/15 text-free' : 'text-muted hover:bg-surface-2'
            }`}
          >
            {camera.notify ? <BellIcon /> : <BellOffIcon />}
          </button>
          <button
            type="button"
            onClick={() => removeCamera(camera.id)}
            aria-label={`Remove ${camera.label}`}
            className="grid h-8 w-8 place-items-center rounded-full text-muted opacity-60 transition hover:bg-surface-2 hover:text-busy hover:opacity-100 focus:opacity-100"
          >
            <CloseIcon />
          </button>
        </div>
      </motion.article>
    )
  },
)

export function FreeChip({ total, large = false }: { total: number | null; large?: boolean }) {
  const free = (total ?? 0) > 0
  return (
    <motion.div
      layout
      className={`flex items-baseline gap-1 rounded-full font-semibold shadow-sm backdrop-blur-md ${
        large ? 'px-4 py-1.5 text-lg' : 'px-2.5 py-1 text-sm'
      } ${
        total === null
          ? 'bg-black/45 text-white/70'
          : free
            ? 'bg-free text-white'
            : 'bg-black/55 text-white'
      }`}
      animate={free ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={{ duration: 0.45 }}
      key={free ? 'free' : 'busy'}
      data-testid="free-chip"
    >
      {total === null ? (
        <span>—</span>
      ) : (
        <>
          <AnimatedCount value={total} />
          <span className="text-xs font-medium opacity-90">free</span>
        </>
      )}
    </motion.div>
  )
}
