import type { AnalysisMessage, FrameMessage } from './messages'
import { isStale, typicalInterval, useFeedStore } from './store'

const frame = (id: string, capturedSec = 0): FrameMessage => ({
  type: 'frame',
  cameraId: '47',
  frameId: id,
  capturedAt: new Date(capturedSec * 1000).toISOString(),
  url: `/f/${id}.jpg`,
})

beforeEach(() => useFeedStore.setState({ cameras: {} }))

test('tracks frames, gaps and staleness', () => {
  const { handle } = useFeedStore.getState()
  handle(frame('a', 0), 0)
  handle(frame('a', 0), 5_000) // duplicate replay ignored
  handle(frame('b', 60), 61_000) // gaps use capture time, not receipt time
  handle(frame('c', 130), 131_000)
  const live = useFeedStore.getState().cameras['47']
  expect(live.frame?.frameId).toBe('c')
  expect(live.gaps).toEqual([60_000, 70_000])
  expect(typicalInterval(live)).toBe(70_000)
  expect(isStale(live, 131_000 + 200_000)).toBe(false)
  expect(isStale(live, 131_000 + 211_000)).toBe(true)
})

test('a replayed frame followed quickly by a new one does not make the camera stale', () => {
  const { handle } = useFeedStore.getState()
  handle(frame('old', 0), 1_000) // replay on reconnect
  handle(frame('new', 70), 3_000) // next frame arrives 2 s later in client time
  const live = useFeedStore.getState().cameras['47']
  expect(typicalInterval(live)).toBe(70_000)
  expect(isStale(live, 3_000 + 30_000)).toBe(false)
})

test('typical interval has a 30 s floor', () => {
  const { handle } = useFeedStore.getState()
  handle(frame('a', 0), 0)
  handle(frame('b', 5), 5_000)
  expect(typicalInterval(useFeedStore.getState().cameras['47'])).toBe(30_000)
})

test('camera status and analysis are stored', () => {
  const { handle } = useFeedStore.getState()
  handle({ type: 'camera_status', cameraId: '04', online: false, lastError: 'empty response' })
  expect(useFeedStore.getState().cameras['04'].online).toBe(false)
  handle({ type: 'analysis', cameraId: '04', frameId: 'x' } as AnalysisMessage)
  expect(useFeedStore.getState().cameras['04'].analysis?.frameId).toBe('x')
})
