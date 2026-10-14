import { analysisMsg } from '../test/factories'
import type { AnalysisMessage } from './types'
import { ALERT_COOLDOWN_MS, detectAvailability, emptyMemory } from './availability'

const withSpaces = (frameId: string, spaces: number, extra: Partial<AnalysisMessage> = {}) =>
  analysisMsg(frameId, {
    totalAvailable: spaces,
    zones: [{ zoneId: 5, name: 'Right curb', spaces, occupied: [], available: [] }],
    ...extra,
  })

function run(sequence: [AnalysisMessage, number][]) {
  let memory = emptyMemory()
  return sequence.map(([a, t]) => {
    const r = detectAvailability(memory, a, t)
    memory = r.memory
    return r.event
  })
}

test('space opens: 0 → 1 fires once with zone name', () => {
  const events = run([
    [withSpaces('a', 0), 0],
    [withSpaces('b', 1), 70_000],
  ])
  expect(events[0]).toBeNull()
  expect(events[1]).toMatchObject({
    cameraId: '47',
    total: 1,
    zones: [{ name: 'Right curb', spaces: 1 }],
  })
})

test('first reading never alerts (no transition yet)', () => {
  expect(run([[withSpaces('a', 2), 0]])).toEqual([null])
})

test('unchanged availability does not alert again', () => {
  const events = run([
    [withSpaces('a', 0), 0],
    [withSpaces('b', 1), 1000],
    [withSpaces('c', 1), 2000],
    [withSpaces('d', 1), 3000],
  ])
  expect(events.filter(Boolean)).toHaveLength(1)
})

test('flapping 0 → 1 → 0 → 1 within the cooldown alerts only once', () => {
  const events = run([
    [withSpaces('a', 0), 0],
    [withSpaces('b', 1), 10_000],
    [withSpaces('c', 0), 20_000],
    [withSpaces('d', 1), 40_000],
  ])
  expect(events.filter(Boolean)).toHaveLength(1)
})

test('after the cooldown a new opening alerts again', () => {
  const events = run([
    [withSpaces('a', 0), 0],
    [withSpaces('b', 1), 10_000],
    [withSpaces('c', 0), 20_000],
    [withSpaces('d', 1), 10_000 + ALERT_COOLDOWN_MS + 1],
  ])
  expect(events.filter(Boolean)).toHaveLength(2)
})

test('a further increase bypasses the cooldown', () => {
  const twoZones = (frameId: string, a: number, b: number) =>
    analysisMsg(frameId, {
      totalAvailable: a + b,
      zones: [
        { zoneId: 5, name: 'Right curb', spaces: a, occupied: [], available: [] },
        { zoneId: 6, name: 'Left curb', spaces: b, occupied: [], available: [] },
      ],
    })
  const events = run([
    [twoZones('a', 0, 0), 0],
    [twoZones('b', 1, 0), 1000],
    [twoZones('c', 1, 1), 2000], // left curb gets its first space, total rises to 2
  ])
  expect(events[2]).toMatchObject({ total: 2, zones: [{ name: 'Left curb' }] })
})

test('unknown views, low quality and failures never alert or reset memory', () => {
  const events = run([
    [withSpaces('a', 0), 0],
    [analysisMsg('b', { status: 'unknown_view', totalAvailable: null, zones: [] }), 1000],
    [analysisMsg('c', { status: 'low_quality', totalAvailable: null, zones: [] }), 2000],
    [analysisMsg('d', { status: 'analysis_unavailable', totalAvailable: null, zones: [] }), 3000],
    [withSpaces('e', 0), 4000],
  ])
  expect(events.every((e) => e === null)).toBe(true)
})
