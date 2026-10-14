import type { Zone, ZoneInput } from '@/entities/zone'
import type { Point } from '@/shared/lib'

export const DEFAULT_ZONE: ZoneInput = {
  name: '',
  points: [],
  bandNear: 0.03,
  bandFar: 0.012,
  minGapCars: null,
}

export interface DraftState {
  /** zone being edited: an existing id, 'new', or nothing selected */
  selected: number | 'new' | null
  draft: ZoneInput
  /** clicks on the canvas append points */
  drawing: boolean
  activePoint: number | null
}

export type DraftAction =
  | { type: 'select'; zone: Zone }
  | { type: 'startNew'; name: string }
  | { type: 'cancel' }
  | { type: 'addPoint'; point: Point }
  | { type: 'movePoint'; index: number; point: Point }
  | { type: 'insertPoint'; after: number; point: Point }
  | { type: 'removeActivePoint' }
  | { type: 'undoPoint' }
  | { type: 'finishLine' }
  | { type: 'activatePoint'; index: number }
  | { type: 'update'; patch: Partial<Omit<ZoneInput, 'points'>> }

export const initialDraft: DraftState = {
  selected: null,
  draft: DEFAULT_ZONE,
  drawing: false,
  activePoint: null,
}

export const MIN_POINTS = 2
/** clicks closer than this to the previous point are ignored (double-click to finish) */
const DUPLICATE_DISTANCE = 0.006

const isNear = (a: Point | undefined, b: Point) =>
  !!a && Math.hypot(a[0] - b[0], a[1] - b[1]) < DUPLICATE_DISTANCE

export function zoneDraftReducer(state: DraftState, action: DraftAction): DraftState {
  const points = state.draft.points
  const withPoints = (next: Point[]) => ({ ...state.draft, points: next })
  switch (action.type) {
    case 'select': {
      const { name, points, bandNear, bandFar, minGapCars } = action.zone
      return {
        selected: action.zone.id,
        draft: { name, points, bandNear, bandFar, minGapCars },
        drawing: false,
        activePoint: null,
      }
    }
    case 'startNew':
      return {
        selected: 'new',
        draft: { ...DEFAULT_ZONE, name: action.name },
        drawing: true,
        activePoint: null,
      }
    case 'cancel':
      return initialDraft
    case 'addPoint':
      if (!state.drawing || isNear(points.at(-1), action.point)) return state
      return { ...state, draft: withPoints([...points, action.point]) }
    case 'movePoint':
      return {
        ...state,
        draft: withPoints(points.map((p, i) => (i === action.index ? action.point : p))),
      }
    case 'insertPoint': {
      const next = [...points]
      next.splice(action.after + 1, 0, action.point)
      return { ...state, draft: withPoints(next), activePoint: action.after + 1 }
    }
    case 'removeActivePoint':
      if (state.activePoint === null || points.length <= MIN_POINTS) return state
      return {
        ...state,
        draft: withPoints(points.filter((_, i) => i !== state.activePoint)),
        activePoint: null,
      }
    case 'undoPoint':
      return { ...state, draft: withPoints(points.slice(0, -1)) }
    case 'finishLine':
      return points.length >= MIN_POINTS ? { ...state, drawing: false } : state
    case 'activatePoint':
      return { ...state, activePoint: action.index }
    case 'update':
      return { ...state, draft: { ...state.draft, ...action.patch } }
  }
}

/** Returns a user-facing problem with the draft, or null when it can be saved. */
export function validateDraft(draft: ZoneInput): string | null {
  if (draft.points.length < MIN_POINTS)
    return 'A zone needs at least two points — click along the curb to add them.'
  if (!draft.name.trim()) return 'Give the zone a name.'
  return null
}
