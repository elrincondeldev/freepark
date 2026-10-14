import type { Point } from '@/shared/lib'

/** Approximate curb parking line of a view, with a tolerance band around it. */
export interface Zone {
  id: number
  viewId: number
  name: string
  points: Point[]
  /** band half-width as a fraction of image width, at the first / last point */
  bandNear: number
  bandFar: number
  /** car lengths needed per space (null = server default) */
  minGapCars: number | null
  updatedAt: string
}

export type ZoneInput = Omit<Zone, 'id' | 'viewId' | 'updatedAt'>
