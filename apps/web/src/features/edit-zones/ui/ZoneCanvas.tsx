import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState, type Dispatch, type PointerEvent } from 'react'
import { bandPolygon, midpoints, type Zone } from '@/entities/zone'
import { clamp01, svgPoints, type Point } from '@/shared/lib'
import { cn } from '@/shared/ui'
import type { DraftAction, DraftState } from '../model/draft'

/** Reference image with all zones; the selected zone's points are editable. */
export function ZoneCanvas({
  imageUrl,
  imageAlt,
  zones,
  state,
  dispatch,
  onSelectZone,
}: {
  imageUrl: string | null
  imageAlt: string
  zones: Zone[]
  state: DraftState
  dispatch: Dispatch<DraftAction>
  onSelectZone: (zone: Zone) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragIndex = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const { draft, drawing, selected, activePoint } = state
  const editing = selected !== null
  const band = bandPolygon(draft.points, draft.bandNear, draft.bandFar)

  const toNorm = (clientX: number, clientY: number): Point => {
    const r = svgRef.current!.getBoundingClientRect()
    return [clamp01((clientX - r.left) / r.width), clamp01((clientY - r.top) / r.height)]
  }

  const onHandleDown = (e: PointerEvent<SVGCircleElement>, index: number) => {
    e.stopPropagation()
    dragIndex.current = index
    setDragging(true)
    dispatch({ type: 'activatePoint', index })
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const index = dragIndex.current
    if (index === null || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return
    dispatch({ type: 'movePoint', index, point: toNorm(e.clientX, e.clientY) })
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-surface-2">
      {imageUrl && (
        <img
          src={imageUrl}
          alt={imageAlt}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      )}
      <svg
        ref={svgRef}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className={cn(
          'absolute inset-0 h-full w-full touch-none',
          dragging ? 'cursor-grabbing' : drawing ? 'cursor-crosshair' : 'cursor-default',
        )}
        onClick={(e) =>
          drawing && dispatch({ type: 'addPoint', point: toNorm(e.clientX, e.clientY) })
        }
        onDoubleClick={() => drawing && dispatch({ type: 'finishLine' })}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          dragIndex.current = null
          setDragging(false)
        }}
        data-testid="zone-canvas"
      >
        {zones
          .filter((z) => z.id !== selected)
          .map((z) => (
            <g
              key={z.id}
              onClick={(e) => (e.stopPropagation(), onSelectZone(z))}
              className="cursor-pointer"
            >
              <polygon
                points={svgPoints(bandPolygon(z.points, z.bandNear, z.bandFar))}
                className="fill-free/20 stroke-free/60"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                points={svgPoints(z.points)}
                className="fill-none stroke-white"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        {editing && (
          <g>
            {band.length > 0 && (
              <polygon
                points={svgPoints(band)}
                className="fill-accent/25 stroke-accent"
                strokeWidth={1}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
                data-testid="band-preview"
              />
            )}
            <polyline
              points={svgPoints(draft.points)}
              className="fill-none stroke-accent"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
            />
            {!drawing &&
              midpoints(draft.points).map((m, i) => (
                <circle
                  key={`m${i}`}
                  cx={m[0]}
                  cy={m[1]}
                  r={0.008}
                  className="cursor-pointer fill-white/70 stroke-accent hover:fill-white"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  onClick={(e) => (
                    e.stopPropagation(),
                    dispatch({ type: 'insertPoint', after: i, point: m })
                  )}
                  aria-label={`Insert point after point ${i + 1}`}
                />
              ))}
            {draft.points.map((p, i) => (
              <circle
                key={i}
                cx={p[0]}
                cy={p[1]}
                r={0.013}
                className={cn(
                  dragging ? 'cursor-grabbing' : 'cursor-grab',
                  activePoint === i ? 'fill-accent' : 'fill-white',
                  'stroke-accent',
                )}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                onPointerDown={(e) => onHandleDown(e, i)}
                onClick={(e) => e.stopPropagation()}
                data-testid="zone-point"
              />
            ))}
          </g>
        )}
      </svg>
      <AnimatePresence>
        {drawing && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-black/70 px-3 py-1 text-xs text-white"
          >
            Click along the curb where cars park ({draft.points.length} point
            {draft.points.length === 1 ? '' : 's'})
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
