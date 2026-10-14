export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** JSON fetch wrapper: throws ApiError with the API's `detail` message on non-2xx. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  })
  if (!resp.ok) {
    let message = resp.statusText
    try {
      const body = await resp.json()
      if (typeof body?.detail === 'string') message = body.detail
      else if (Array.isArray(body?.detail)) message = body.detail[0]?.msg ?? message
    } catch {
      /* not JSON */
    }
    throw new ApiError(resp.status, message)
  }
  return resp.status === 204 ? (undefined as T) : ((await resp.json()) as T)
}

export const jsonBody = (body: unknown) => JSON.stringify(body)
