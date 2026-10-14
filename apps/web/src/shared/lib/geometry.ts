export type Point = [number, number]
export type Box = [number, number, number, number]

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** SVG `points` attribute for a polyline/polygon in normalised coordinates. */
export const svgPoints = (pts: Point[]) => pts.map(([x, y]) => `${x},${y}`).join(' ')
