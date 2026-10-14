import { motion } from 'framer-motion'
import { forwardRef } from 'react'
import { useCameraSelection, type WatchedCamera } from '@/entities/camera'
import {
  displayStatus,
  FeedStatusBadge,
  FeedViewport,
  FreeSpacesChip,
  useDisplayedAnalysis,
} from '@/entities/feed'
import { RemoveCameraButton } from '@/features/remove-camera'
import { AlertsButton } from '@/features/toggle-camera-alerts'
import { formatAgo, useNow } from '@/shared/lib'
import { Button } from '@/shared/ui'

export const CameraCard = forwardRef<HTMLElement, { camera: WatchedCamera; index: number }>(
  function CameraCard({ camera, index }, ref) {
    const now = useNow()
    const display = useDisplayedAnalysis(camera.id)
    const { feed, current } = display
    const status = displayStatus(feed, now)
    const highlighted = useCameraSelection((s) => s.highlightedId === camera.id)
    const focus = useCameraSelection((s) => s.focus)
    const total = current?.totalAvailable ?? null

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
          <FeedViewport
            cameraId={camera.id}
            display={display}
            emptyLabel={status === 'offline' ? 'Camera offline' : 'Waiting for image…'}
          >
            <div className="absolute right-2 top-2">
              <FreeSpacesChip total={total} />
            </div>
          </FeedViewport>
        </button>
        {status === 'unknown_view' && (
          <Button
            size="xs"
            variant="warning"
            className="absolute bottom-[4.25rem] left-2 font-semibold shadow-md"
            onClick={() => focus(camera.id, { kind: 'views' })}
          >
            Save view
          </Button>
        )}

        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="min-w-0 truncate text-sm font-semibold">{camera.label}</h2>
              <FeedStatusBadge status={status} />
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {feed?.lastFrameAt
                ? `Updated ${formatAgo(now - feed.lastFrameAt)}`
                : `Camera ${camera.id}`}
              {current?.viewName ? ` · ${current.viewName}` : ''}
            </p>
          </div>
          <AlertsButton camera={camera} />
          <RemoveCameraButton camera={camera} />
        </div>
      </motion.article>
    )
  },
)
