import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { AnalysisMessage, Point } from '../lib/types'

const pts = (poly: Point[]) => poly.map(([x, y]) => `${x},${y}`).join(' ')

/**
 * Parking overlay in normalised coordinates (viewBox 0 0 1 1) stacked on the image.
 * Red: vehicles occupying a zone. Green: available curb stretches. Faint dashed: other vehicles.
 */
export function Overlay({
  analysis,
  faded = false,
  showOthers = true,
}: {
  analysis: AnalysisMessage | undefined
  faded?: boolean
  showOthers?: boolean
}) {
  const reduce = useReducedMotion()
  if (!analysis) return null
  const vehicles = analysis.vehicles ?? []
  const parked = vehicles.filter((v) => v.zoneId !== null)
  const others = showOthers ? vehicles.filter((v) => v.zoneId === null) : []
  const available = (analysis.zones ?? []).flatMap((z) =>
    z.available.map((a, i) => ({ key: `${z.zoneId}-${i}-${pts(a.polygon)}`, ...a })),
  )
  const enter = (i: number) =>
    reduce
      ? { initial: false as const, animate: { opacity: 1 } }
      : {
          initial: { opacity: 0, scale: 0.6 },
          animate: { opacity: 1, scale: 1 },
          exit: { opacity: 0, scale: 0.9 },
          transition: { type: 'spring' as const, stiffness: 380, damping: 26, delay: i * 0.025 },
        }

  return (
    <motion.svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      animate={{ opacity: faded ? 0.3 : 1 }}
      transition={{ duration: 0.3 }}
      data-testid="overlay"
      data-frame={analysis.frameId}
      aria-hidden
    >
      <AnimatePresence>
        {available.map((a, i) => (
          <motion.polygon
            key={a.key}
            points={pts(a.polygon)}
            className="fill-free/35 stroke-free"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            data-kind="available"
            {...enter(i)}
          />
        ))}
        {parked.map((v, i) => (
          <motion.rect
            key={`p-${v.box.join()}`}
            x={v.box[0]}
            y={v.box[1]}
            width={v.box[2] - v.box[0]}
            height={v.box[3] - v.box[1]}
            className="fill-busy/15 stroke-busy"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            data-kind="occupied"
            {...enter(i)}
          />
        ))}
        {others.map((v) => (
          <motion.rect
            key={`o-${v.box.join()}`}
            x={v.box[0]}
            y={v.box[1]}
            width={v.box[2] - v.box[0]}
            height={v.box[3] - v.box[1]}
            className="fill-none stroke-white/50"
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-kind="other"
          />
        ))}
      </AnimatePresence>
    </motion.svg>
  )
}
