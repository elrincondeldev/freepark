import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { api, ApiError } from '../lib/api'
import type { Point, View, Zone, ZoneInput } from '../lib/types'
import { bandPolygon, clamp01, midpoints } from '../lib/zoneGeometry'

const DEFAULT_DRAFT: ZoneInput = {
  name: '',
  points: [],
  bandNear: 0.03,
  bandFar: 0.012,
  minGapCars: null,
}

const svgPoints = (pts: Point[]) => pts.map(([x, y]) => `${x},${y}`).join(' ')

type Selection = number | 'new' | null

export function ZoneEditor({ view, onClose }: { view: View; onClose: () => void }) {
  const [zones, setZones] = useState<Zone[]>([])
  const [selected, setSelected] = useState<Selection>(null)
  const [draft, setDraft] = useState<ZoneInput>(DEFAULT_DRAFT)
  const [drawing, setDrawing] = useState(false)
  const [activePoint, setActivePoint] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragIndex = useRef<number | null>(null)

  const load = useCallback(async () => {
    try {
      setZones(await api.listZones(view.id))
    } catch {
      setError('Could not load zones.')
    }
  }, [view.id])

  useEffect(() => {
    load()
  }, [load])

  function select(zone: Zone) {
    setSelected(zone.id)
    setDraft({
      name: zone.name,
      points: zone.points,
      bandNear: zone.bandNear,
      bandFar: zone.bandFar,
      minGapCars: zone.minGapCars,
    })
    setDrawing(false)
    setActivePoint(null)
    setError(null)
  }

  function startNew() {
    setSelected('new')
    setDraft({ ...DEFAULT_DRAFT, name: `Curb ${zones.length + 1}` })
    setDrawing(true)
    setActivePoint(null)
    setError(null)
  }

  function cancel() {
    setSelected(null)
    setDrawing(false)
    setActivePoint(null)
    setError(null)
  }

  const toNorm = (clientX: number, clientY: number): Point => {
    const r = svgRef.current!.getBoundingClientRect()
    return [clamp01((clientX - r.left) / r.width), clamp01((clientY - r.top) / r.height)]
  }

  function onCanvasClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!drawing) return
    const p = toNorm(e.clientX, e.clientY)
    setDraft((d) => ({ ...d, points: [...d.points, p] }))
    setError(null)
  }

  function onHandleDown(e: PointerEvent<SVGCircleElement>, i: number) {
    e.stopPropagation()
    dragIndex.current = i
    setActivePoint(i)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const i = dragIndex.current
    if (i === null || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return
    const p = toNorm(e.clientX, e.clientY)
    setDraft((d) => ({ ...d, points: d.points.map((q, j) => (j === i ? p : q)) }))
  }

  function insertPoint(after: number, p: Point) {
    setDraft((d) => {
      const points = [...d.points]
      points.splice(after + 1, 0, p)
      return { ...d, points }
    })
    setActivePoint(after + 1)
  }

  function removeActivePoint() {
    if (activePoint === null || draft.points.length <= 2) return
    setDraft((d) => ({ ...d, points: d.points.filter((_, j) => j !== activePoint) }))
    setActivePoint(null)
  }

  async function save() {
    if (draft.points.length < 2) {
      setError('A zone needs at least two points — click along the curb to add them.')
      return
    }
    if (!draft.name.trim()) {
      setError('Give the zone a name.')
      return
    }
    setSaving(true)
    try {
      const saved =
        selected === 'new'
          ? await api.createZone(view.id, draft)
          : await api.updateZone(selected as number, draft)
      await load()
      select(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the zone.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (typeof selected !== 'number') return
    try {
      await api.deleteZone(selected)
      cancel()
      await load()
    } catch {
      setError('Could not delete the zone.')
    }
  }

  const editing = selected !== null
  const band = bandPolygon(draft.points, draft.bandNear, draft.bandFar)

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-surface-2">
          {view.referenceUrl && (
            <img
              src={view.referenceUrl}
              alt={`Reference image of ${view.name}`}
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
          )}
          <svg
            ref={svgRef}
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            className={`absolute inset-0 h-full w-full touch-none ${drawing ? 'cursor-crosshair' : ''}`}
            onClick={onCanvasClick}
            onPointerMove={onPointerMove}
            onPointerUp={() => (dragIndex.current = null)}
            data-testid="zone-canvas"
          >
            {zones
              .filter((z) => z.id !== selected)
              .map((z) => (
                <g
                  key={z.id}
                  onClick={(e) => (e.stopPropagation(), select(z))}
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
                      className="cursor-copy fill-white/70 stroke-accent"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                      onClick={(e) => (e.stopPropagation(), insertPoint(i, m))}
                      aria-label={`Insert point after point ${i + 1}`}
                    />
                  ))}
                {draft.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p[0]}
                    cy={p[1]}
                    r={0.013}
                    className={`cursor-grab ${activePoint === i ? 'fill-accent' : 'fill-white'} stroke-accent`}
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
        <p className="mt-2 text-xs text-muted">
          Zones are approximate: cars partly inside or outside the band still count. Draw them on
          the nearer part of the curb, where the AI sees cars best.
        </p>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-72">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Zones · {view.name}</h3>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
            Done
          </button>
        </div>

        {!editing && (
          <>
            <ul className="flex flex-col gap-1.5">
              {zones.map((z) => (
                <li key={z.id}>
                  <button
                    type="button"
                    onClick={() => select(z)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-surface-2"
                  >
                    {z.name}
                  </button>
                </li>
              ))}
              {zones.length === 0 && <li className="text-sm text-muted">No zones yet.</li>}
            </ul>
            <button
              type="button"
              onClick={startNew}
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
            >
              New zone
            </button>
          </>
        )}

        {editing && (
          <div className="flex flex-col gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="rounded-lg border border-line bg-surface px-3 py-1.5"
                maxLength={80}
              />
            </label>
            <Slider
              label="Band width (near end)"
              value={draft.bandNear}
              onChange={(v) => setDraft({ ...draft, bandNear: v })}
            />
            <Slider
              label="Band width (far end)"
              value={draft.bandFar}
              onChange={(v) => setDraft({ ...draft, bandFar: v })}
            />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Car lengths per space (optional)</span>
              <input
                type="number"
                min={0.8}
                max={5}
                step={0.05}
                placeholder="1.15"
                value={draft.minGapCars ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, minGapCars: e.target.value ? Number(e.target.value) : null })
                }
                className="rounded-lg border border-line bg-surface px-3 py-1.5"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {drawing ? (
                <button
                  type="button"
                  onClick={() => setDrawing(false)}
                  disabled={draft.points.length < 2}
                  className="rounded-full border border-line px-3 py-1.5 disabled:opacity-40"
                >
                  Finish line
                </button>
              ) : (
                <button
                  type="button"
                  onClick={removeActivePoint}
                  disabled={activePoint === null || draft.points.length <= 2}
                  className="rounded-full border border-line px-3 py-1.5 disabled:opacity-40"
                >
                  Remove point
                </button>
              )}
              {drawing && draft.points.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, points: draft.points.slice(0, -1) })}
                  className="rounded-full border border-line px-3 py-1.5"
                >
                  Undo point
                </button>
              )}
            </div>
            {error && (
              <p role="alert" className="text-busy">
                {error}
              </p>
            )}
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="flex-1 rounded-full bg-free px-4 py-2 font-medium text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save zone'}
              </button>
              <button type="button" onClick={cancel} className="rounded-full px-3 py-2 text-muted">
                Cancel
              </button>
            </div>
            {typeof selected === 'number' && (
              <button
                type="button"
                onClick={remove}
                className="self-start text-xs text-busy hover:underline"
              >
                Delete zone
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-xs text-muted">
        {label}
        <span className="tabular-nums">{Math.round(value * 1000) / 10}%</span>
      </span>
      <input
        type="range"
        min={0.004}
        max={0.12}
        step={0.002}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-[var(--accent)]"
      />
    </label>
  )
}
