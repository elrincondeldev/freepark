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
import { Button, cn, ExpandIcon, fade } from '@/shared/ui'

export const CameraCard = forwardRef<HTMLElement, { camera: WatchedCamera }>(function CameraCard(
  { camera },
  ref,
) {
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
      layout="position"
      {...fade}
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-surface shadow-sm transition-[border-color,box-shadow] duration-300',
        highlighted ? 'border-accent ring-2 ring-accent/60' : 'border-line',
      )}
      aria-label={`${camera.label}, ${total === null ? 'availability unknown' : `${total} free`}`}
      data-status={status}
    >
      <button
        type="button"
        onClick={() => focus(camera.id)}
        className="relative block aspect-video w-full overflow-hidden bg-surface-2 text-left focus-visible:outline-offset-[-2px]"
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
          <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur-md transition-opacity duration-200 group-hover:opacity-100">
            <ExpandIcon width={12} height={12} /> Open
          </span>
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
})
