import { AnimatePresence, motion } from 'framer-motion'
import { svgPoints } from '@/shared/lib'
import { motionPresets } from '@/shared/ui'
import type { AnalysisMessage } from '../model/messages'

/**
 * Parking overlay in normalised coordinates (viewBox 0 0 1 1) stacked on the image.
 * Red: vehicles occupying a zone. Green: available curb stretches. Dashed: other vehicles.
 * The overlay cross-fades as a whole when a new frame's analysis arrives; shapes inside
 * do not animate individually.
 */
export function ParkingOverlay({
  analysis,
  faded = false,
  showOthers = true,
}: {
  analysis: AnalysisMessage | undefined
  faded?: boolean
  showOthers?: boolean
}) {
  return (
    <AnimatePresence initial={false}>
      {analysis && (
        <motion.svg
          key={analysis.frameId + analysis.analysedAt}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: faded ? 0.35 : 1 }}
          exit={{ opacity: 0 }}
          transition={motionPresets.slow}
          data-testid="overlay"
          data-frame={analysis.frameId}
          aria-hidden
        >
          <OverlayShapes analysis={analysis} showOthers={showOthers} />
        </motion.svg>
      )}
    </AnimatePresence>
  )
}

function OverlayShapes({
  analysis,
  showOthers,
}: {
  analysis: AnalysisMessage
  showOthers: boolean
}) {
  const vehicles = analysis.vehicles ?? []
  return (
    <>
      {(analysis.zones ?? []).flatMap((z) =>
        z.available.map((a, i) => (
          <polygon
            key={`a-${z.zoneId}-${i}`}
            points={svgPoints(a.polygon)}
            className="fill-free/35 stroke-free"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            data-kind="available"
          />
        )),
      )}
      {vehicles.map((v, i) => {
        const parked = v.zoneId !== null
        if (!parked && !showOthers) return null
        return (
          <rect
            key={`v-${i}`}
            x={v.box[0]}
            y={v.box[1]}
            width={v.box[2] - v.box[0]}
            height={v.box[3] - v.box[1]}
            className={parked ? 'fill-busy/15 stroke-busy' : 'fill-none stroke-white/45'}
            strokeWidth={parked ? 1.5 : 1}
            strokeDasharray={parked ? undefined : '3 3'}
            vectorEffect="non-scaling-stroke"
            data-kind={parked ? 'occupied' : 'other'}
          />
        )
      })}
    </>
  )
}
