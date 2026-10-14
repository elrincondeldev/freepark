import type { Zone } from '@/entities/zone'
import { initialDraft, validateDraft, zoneDraftReducer as reduce, type DraftState } from './draft'

const zone: Zone = {
  id: 3,
  viewId: 1,
  name: 'Right curb',
  points: [
    [0.1, 0.9],
    [0.2, 0.5],
  ],
  bandNear: 0.03,
  bandFar: 0.01,
  minGapCars: null,
  updatedAt: '',
}

test('drawing appends points only while drawing; finish needs two points', () => {
  let s: DraftState = reduce(initialDraft, { type: 'startNew', name: 'Curb 1' })
  s = reduce(s, { type: 'addPoint', point: [0.1, 0.1] })
  expect(reduce(s, { type: 'finishLine' }).drawing).toBe(true)
  s = reduce(s, { type: 'addPoint', point: [0.2, 0.2] })
  s = reduce(s, { type: 'finishLine' })
  expect(s.drawing).toBe(false)
  expect(reduce(s, { type: 'addPoint', point: [0.3, 0.3] }).draft.points).toHaveLength(2)
})

test('editing points of an existing zone', () => {
  let s = reduce(initialDraft, { type: 'select', zone })
  s = reduce(s, { type: 'insertPoint', after: 0, point: [0.15, 0.7] })
  expect(s.activePoint).toBe(1)
  s = reduce(s, { type: 'movePoint', index: 0, point: [0.12, 0.88] })
  expect(s.draft.points).toEqual([
    [0.12, 0.88],
    [0.15, 0.7],
    [0.2, 0.5],
  ])
  s = reduce(s, { type: 'removeActivePoint' })
  expect(s.draft.points).toHaveLength(2)
  s = reduce(reduce(s, { type: 'activatePoint', index: 0 }), { type: 'removeActivePoint' })
  expect(s.draft.points).toHaveLength(2) // never fewer than two
})

test('validation messages', () => {
  expect(validateDraft({ ...zone, points: [[0, 0]] })).toMatch(/at least two points/)
  expect(validateDraft({ ...zone, name: '  ' })).toMatch(/name/)
  expect(validateDraft(zone)).toBeNull()
})
