import { useState } from 'react'
import type { CameraPanel, WatchedCamera } from '@/entities/camera'
import {
  FeedViewport,
  FreeSpacesChip,
  type DisplayedAnalysis,
  type DisplayStatus,
} from '@/entities/feed'
import { ReanalyzeButton } from '@/features/reanalyze-camera'
import { AlertsSwitch } from '@/features/toggle-camera-alerts'
import { formatAgo } from '@/shared/lib'
import { Button, Switch } from '@/shared/ui'
import { UnknownViewNotice } from './UnknownViewNotice'
import { ZoneBreakdown } from './ZoneBreakdown'

export function LivePanel({
  camera,
  display,
  status,
  now,
  onShowPanel,
}: {
  camera: WatchedCamera
  display: DisplayedAnalysis
  status: DisplayStatus
  now: number
  onShowPanel: (panel: CameraPanel) => void
}) {
  const [showOthers, setShowOthers] = useState(true)
  const { feed, current } = display
  const viewId = current?.viewId ?? null

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div className="relative aspect-video min-w-0 flex-1 overflow-hidden rounded-2xl bg-surface-2">
        <FeedViewport cameraId={camera.id} display={display} showOthers={showOthers}>
          <div className="absolute right-3 top-3">
            <FreeSpacesChip total={current?.totalAvailable ?? null} large />
          </div>
        </FeedViewport>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-80">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-muted">
            {feed?.lastFrameAt
              ? `Image updated ${formatAgo(now - feed.lastFrameAt)}`
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
          <ReanalyzeButton cameraId={camera.id} />
        </div>

        {status === 'unknown_view' && (
          <UnknownViewNotice onSaveView={() => onShowPanel({ kind: 'views' })} />
        )}

        <ZoneBreakdown zones={current?.zones ?? []} />

        <div className="flex flex-col gap-2">
          <AlertsSwitch camera={camera} />
          <Switch
            checked={showOthers}
            onChange={() => setShowOthers(!showOthers)}
            label="Show other vehicles"
          />
        </div>

        <div className="mt-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onShowPanel({ kind: 'views' })}>
            Manage views
          </Button>
          {viewId !== null && (
            <Button onClick={() => onShowPanel({ kind: 'zones', viewId })}>Edit zones</Button>
          )}
        </div>
      </aside>
    </div>
  )
}
