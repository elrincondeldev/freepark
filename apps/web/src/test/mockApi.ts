type Handler = (url: string, init?: RequestInit) => unknown

/** Minimal fetch router: map "METHOD /path" prefixes to JSON responses. */
export function mockApi(routes: Record<string, Handler | unknown>) {
  const calls: { method: string; url: string; body?: unknown }[] = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, body })
    const key = Object.keys(routes)
      .filter((k) => {
        const [m, path] = k.split(' ')
        return m === method && url.startsWith(path)
      })
      .sort((a, b) => b.length - a.length)[0]
    if (!key) return new Response(JSON.stringify({ detail: 'not found' }), { status: 404 })
    const route = routes[key]
    const result = typeof route === 'function' ? (route as Handler)(url, init) : route
    if (result instanceof Response) return result
    if (result === undefined) return new Response(null, { status: 204 })
    return new Response(JSON.stringify(result), {
      status: method === 'POST' ? 201 : 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fn)
  return calls
}
