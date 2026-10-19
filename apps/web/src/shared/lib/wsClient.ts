export type ConnectionState = 'connecting' | 'open' | 'reconnecting'

export interface WsClientOptions<TIn> {
  url: string
  onMessage: (msg: TIn) => void
  /** Message announcing the current topic set; re-sent on every (re)connect. */
  subscribeMessage: (topics: string[]) => unknown
  beforeSubscribe?: () => Promise<void>
  onState?: (state: ConnectionState) => void
  WebSocketImpl?: typeof WebSocket
  baseDelayMs?: number
  maxDelayMs?: number
  random?: () => number
}

/**
 * JSON WebSocket client with jittered exponential reconnect. Keeps a set of subscribed
 * topics and re-announces it whenever it changes and after every reconnect.
 */
export class WsClient<TIn> {
  private ws: WebSocket | null = null
  private ready = false
  private topics: string[] = []
  private attempts = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private closed = false
  private readonly opts: Required<Omit<WsClientOptions<TIn>, 'onState' | 'beforeSubscribe'>> &
    Pick<WsClientOptions<TIn>, 'onState' | 'beforeSubscribe'>

  constructor(opts: WsClientOptions<TIn>) {
    this.opts = {
      WebSocketImpl: WebSocket,
      baseDelayMs: 1000,
      maxDelayMs: 15000,
      random: Math.random,
      ...opts,
    }
  }

  connect(): void {
    this.closed = false
    this.opts.onState?.(this.attempts === 0 ? 'connecting' : 'reconnecting')
    const ws = new this.opts.WebSocketImpl(this.opts.url)
    this.ws = ws
    this.ready = false
    ws.onopen = () => {
      this.attempts = 0
      this.opts.onState?.('open')
      if (this.opts.beforeSubscribe) {
        void this.opts
          .beforeSubscribe()
          .catch((error) => console.error(error))
          .finally(() => {
            if (this.ws === ws) {
              this.ready = true
              this.sendSubscribe()
            }
          })
      } else {
        this.ready = true
        this.sendSubscribe()
      }
    }
    ws.onmessage = (event) => {
      try {
        this.opts.onMessage(JSON.parse(String(event.data)) as TIn)
      } catch {
        /* ignore malformed frames */
      }
    }
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      if (!this.closed) this.scheduleReconnect()
    }
    ws.onerror = () => ws.close()
  }

  /** Jittered exponential backoff: base·2^n·[0.5, 1.5), capped. */
  nextDelay(): number {
    const exp = Math.min(this.opts.baseDelayMs * 2 ** this.attempts, this.opts.maxDelayMs)
    return Math.round(exp * (0.5 + this.opts.random()))
  }

  private scheduleReconnect(): void {
    this.opts.onState?.('reconnecting')
    const delay = this.nextDelay()
    this.attempts += 1
    this.timer = setTimeout(() => this.connect(), delay)
  }

  setTopics(topics: string[]): void {
    const next = [...new Set(topics)].sort()
    if (next.join() === this.topics.join()) return
    this.topics = next
    this.sendSubscribe()
  }

  private sendSubscribe(): void {
    if (this.ready && this.ws && this.ws.readyState === this.opts.WebSocketImpl.OPEN) {
      this.ws.send(JSON.stringify(this.opts.subscribeMessage(this.topics)))
    }
  }

  close(): void {
    this.closed = true
    if (this.timer) clearTimeout(this.timer)
    this.ws?.close()
    this.ws = null
  }
}

export function defaultWsUrl(path = '/ws'): string {
  const { protocol, host } = window.location
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}${path}`
}
