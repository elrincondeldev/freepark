import { WsClient } from './wsClient'

class MockSocket {
  static OPEN = 1
  static instances: MockSocket[] = []
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    MockSocket.instances.push(this)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.readyState = 3
    this.onclose?.()
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  subscriptions() {
    return this.sent.map((s) => JSON.parse(s).cameras)
  }
}

beforeEach(() => {
  MockSocket.instances = []
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

function client(onMessage = vi.fn(), onState = vi.fn()) {
  const c = new WsClient<unknown>({
    url: 'ws://test/ws',
    subscribeMessage: (cameras) => ({ type: 'subscribe', cameras }),
    onMessage,
    onState,
    WebSocketImpl: MockSocket as unknown as typeof WebSocket,
    random: () => 0.5,
  })
  return { c, onMessage, onState }
}

test('subscribes on open and whenever the topic set changes', () => {
  const { c } = client()
  c.setTopics(['47'])
  c.connect()
  const ws = MockSocket.instances[0]
  ws.open()
  c.setTopics(['47', '04'])
  c.setTopics(['04', '47']) // same set: no duplicate message
  c.setTopics(['04'])
  expect(ws.subscriptions()).toEqual([['47'], ['04', '47'], ['04']])
})

test('reconnects with backoff and restores subscriptions', () => {
  const { c, onState } = client()
  c.setTopics(['47', '04'])
  c.connect()
  MockSocket.instances[0].open()
  MockSocket.instances[0].close() // connection drops
  expect(onState).toHaveBeenLastCalledWith('reconnecting')
  vi.advanceTimersByTime(999)
  expect(MockSocket.instances).toHaveLength(1)
  vi.advanceTimersByTime(1)
  expect(MockSocket.instances).toHaveLength(2)
  MockSocket.instances[1].open()
  expect(MockSocket.instances[1].subscriptions()).toEqual([['04', '47']])
  expect(onState).toHaveBeenLastCalledWith('open')
})

test('backoff grows and is capped', () => {
  const { c } = client()
  const delays = []
  for (let i = 0; i < 7; i++) {
    delays.push(c.nextDelay())
    ;(c as unknown as { attempts: number }).attempts += 1
  }
  expect(delays).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000])
})

test('parses messages and stops after close()', () => {
  const { c, onMessage } = client()
  c.connect()
  const ws = MockSocket.instances[0]
  ws.open()
  ws.onmessage?.({ data: JSON.stringify({ type: 'subscribed', cameras: [] }) })
  ws.onmessage?.({ data: 'not json' })
  expect(onMessage).toHaveBeenCalledTimes(1)
  c.close()
  vi.advanceTimersByTime(60_000)
  expect(MockSocket.instances).toHaveLength(1)
})
