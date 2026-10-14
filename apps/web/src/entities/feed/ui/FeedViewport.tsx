import type { ReactNode } from 'react'
import type { DisplayedAnalysis } from '../model/useDisplayedAnalysis'
import { FeedImage } from './FeedImage'
import { ParkingOverlay } from './ParkingOverlay'

/**
 * A camera's live image with its parking overlay; the overlay always belongs to the frame
 * on screen (pass the result of `useDisplayedAnalysis`). `children` render on top.
 */
export function FeedViewport({
  cameraId,
  display,
  showOthers = true,
  emptyLabel,
  children,
}: {
  cameraId: string
  display: DisplayedAnalysis
  showOthers?: boolean
  emptyLabel?: string
  children?: ReactNode
}) {
  const { feed, current, previous, onDisplayed } = display
  const analysing =
    !!feed?.frame && (feed.analysis?.frameId !== feed.frame.frameId || !!feed.reanalysing)
  return (
    <>
      <FeedImage frame={feed?.frame} alt={`Camera ${cameraId}`} onDisplayed={onDisplayed} />
      <ParkingOverlay analysis={current ?? previous} faded={!current} showOthers={showOthers} />
      {analysing && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-accent/20">
          <div
            className="h-full w-1/3 bg-accent"
            style={{ animation: 'shimmer 1.2s linear infinite' }}
          />
        </div>
      )}
      {!feed?.frame && emptyLabel && (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted">
          {emptyLabel}
        </div>
      )}
      {children}
    </>
  )
}
