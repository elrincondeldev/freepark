import { act, renderHook, waitFor } from '@testing-library/react'
import { useCameraStore } from '@/entities/camera'
import { useFeedStore } from '@/entities/feed'
import { useReplicateKeyStore } from '@/entities/replicate-key'
import { useLiveUpdates } from './useLiveUpdates'

class MockSocket {
  static OPEN = 1
  static instances: MockSocket[] = []
  readyState = 0
  sent: string[] = []
  closed = false
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null

  constructor(public url: string) {
    MockSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
    this.onclose?.()
  }

  open() {
    this.readyState = 1
    this.onopen?.()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  useCameraStore.setState({ cameras: [] })
  useReplicateKeyStore.getState().setKey('')
  useFeedStore.setState({ cameras: {} })
  MockSocket.instances = []
})

test('changing the key reconnects the live camera with the new key', async () => {
  vi.stubGlobal('WebSocket', MockSocket)
  useCameraStore.setState({ cameras: [{ id: '47', label: 'Camera 47', notify: false }] })
  useReplicateKeyStore.getState().setKey('key-a')
  const { unmount } = renderHook(() => useLiveUpdates('ws://test/ws'))
  const first = MockSocket.instances[0]
  act(() => first.open())
  await waitFor(() => expect(first.sent).toHaveLength(1))
  expect(JSON.parse(first.sent[0])).toEqual(
    expect.objectContaining({
      type: 'subscribe',
      cameras: ['47'],
      replicateApiKey: 'key-a',
    }),
  )

  act(() => useReplicateKeyStore.getState().setKey('key-b'))
  expect(first.closed).toBe(true)
  const second = MockSocket.instances[1]
  act(() => second.open())
  await waitFor(() => expect(second.sent).toHaveLength(1))
  expect(JSON.parse(second.sent[0]).replicateApiKey).toBe('key-b')
  unmount()
})
