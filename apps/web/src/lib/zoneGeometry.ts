import type { Point } from './types'

/** Frames are 384×216; geometry is computed in this pixel space so offsets are isotropic. */
export const FRAME_W = 384
export const FRAME_H = 216

const toPx = ([x, y]: Point): Point => [x * FRAME_W, y * FRAME_H]
const toNorm = ([x, y]: Point): Point => [x / FRAME_W, y / FRAME_H]

/**
 * Outline of a zone's tolerance band (mirrors Polyline.band_polygon in the API).
 * Band half-widths are fractions of the image width at the first / last point.
 */
export function bandPolygon(points: Point[], bandNear: number, bandFar: number): Point[] {
  if (points.length < 2) return []
  const px = points.map(toPx)
  const cum = [0]
  for (let i = 1; i < px.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(px[i][0] - px[i - 1][0], px[i][1] - px[i - 1][1]))
  }
  const total = cum[cum.length - 1] || 1
  const left: Point[] = []
  const right: Point[] = []
  px.forEach((p, i) => {
    const a = px[Math.max(0, i - 1)]
    const b = px[Math.min(px.length - 1, i + 1)]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const w = (bandNear + (bandFar - bandNear) * (cum[i] / total)) * FRAME_W
    left.push(toNorm([p[0] + nx * w, p[1] + ny * w]))
    right.push(toNorm([p[0] - nx * w, p[1] - ny * w]))
  })
  return [...left, ...right.reverse()]
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function midpoints(points: Point[]): Point[] {
  return points.slice(1).map((p, i) => [(p[0] + points[i][0]) / 2, (p[1] + points[i][1]) / 2])
}
