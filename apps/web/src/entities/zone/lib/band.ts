import { FRAME_HEIGHT, FRAME_WIDTH } from '@/shared/config'
import type { Point } from '@/shared/lib'

const FRAME_W = FRAME_WIDTH
const FRAME_H = FRAME_HEIGHT

const toPx = ([x, y]: Point): Point => [x * FRAME_W, y * FRAME_H]
const toNorm = ([x, y]: Point): Point => [x / FRAME_W, y / FRAME_H]

/**
 * Band half-widths at the first / last point. `bandNear` belongs to the end closer to the
 * camera (lower in the image), whichever direction the line was drawn in (mirrors
 * `near_far_bands` in the API).
 */
export function endBands(points: Point[], bandNear: number, bandFar: number): [number, number] {
  if (points.length < 2) return [bandNear, bandFar]
  return points[0][1] >= points[points.length - 1][1] ? [bandNear, bandFar] : [bandFar, bandNear]
}

/**
 * Outline of a zone's tolerance band (mirrors Polyline.band_polygon in the API).
 * Band half-widths are fractions of the image width, near the camera and far from it.
 */
export function bandPolygon(points: Point[], bandNear: number, bandFar: number): Point[] {
  if (points.length < 2) return []
  const [bandFirst, bandLast] = endBands(points, bandNear, bandFar)
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
    const w = (bandFirst + (bandLast - bandFirst) * (cum[i] / total)) * FRAME_W
    left.push(toNorm([p[0] + nx * w, p[1] + ny * w]))
    right.push(toNorm([p[0] - nx * w, p[1] - ny * w]))
  })
  return [...left, ...right.reverse()]
}

export function midpoints(points: Point[]): Point[] {
  return points.slice(1).map((p, i) => [(p[0] + points[i][0]) / 2, (p[1] + points[i][1]) / 2])
}
