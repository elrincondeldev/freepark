/** Durable browser copy of the user's views, zones, samples and reference images. */

// Storage keys keep the project's original name so existing browsers keep their data.
const CLIENT_KEY = 'parking-vision-client-id'
const STATE_KEY = 'parking-vision-state-v1'
const DB_NAME = 'parking-vision-images'
const STORE_NAME = 'exemplars'
const storage = (() => {
  try {
    const candidate = globalThis.localStorage
    const probe = '__pv_state_probe__'
    candidate?.setItem(probe, '1')
    candidate?.removeItem(probe)
    return candidate ?? null
  } catch {
    return null
  }
})()
const available = storage !== null
let temporaryClientId: string | null = null

interface Snapshot {
  views: Record<string, unknown>[]
  exemplars: (Record<string, unknown> & { id: number; image?: string })[]
  zones: Record<string, unknown>[]
  samples: Record<string, unknown>
}

interface StoredSnapshot {
  generation: string
  snapshot: Snapshot
}

function snapshotOnDisk(raw: string): { generation: string | null; snapshot: Snapshot } {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object') throw new Error('Configuración local inválida')
  if ('snapshot' in parsed) {
    const stored = parsed as StoredSnapshot
    return { generation: stored.generation, snapshot: stored.snapshot }
  }
  return { generation: null, snapshot: parsed as Snapshot }
}

function randomId(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export function browserClientId(): string {
  let id = storage?.getItem(CLIENT_KEY) ?? temporaryClientId
  if (!id || !/^[A-Za-z0-9]{1,64}$/.test(id)) {
    id = randomId(16)
    temporaryClientId = id
    storage?.setItem(CLIENT_KEY, id)
  }
  return id
}

function openImages(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function putImages(
  images: { id: number; image: string }[],
  generation: string,
): Promise<void> {
  const db = await openImages()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      images.forEach(({ id, image }) => store.put(image, `${generation}:${id}`))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

async function getImage(id: number, generation: string | null): Promise<string | undefined> {
  const db = await openImages()
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction(STORE_NAME)
        .objectStore(STORE_NAME)
        .get(generation ? `${generation}:${id}` : id)
      request.onsuccess = () => resolve(request.result as string | undefined)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

async function removeImages(ids: number[], generation: string | null): Promise<void> {
  const db = await openImages()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      ids.forEach((id) => store.delete(generation ? `${generation}:${id}` : id))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function restoreBrowserState(): Promise<void> {
  if (!available) return
  const raw = storage?.getItem(STATE_KEY)
  if (!raw) return
  const statusResponse = await fetch('/api/state/status', {
    headers: { 'X-Client-Id': browserClientId() },
  })
  if (!statusResponse.ok) throw new Error('No se pudo comprobar la sesión local')
  const status = (await statusResponse.json()) as { initialized: boolean }
  if (status.initialized) return
  const { generation, snapshot: state } = snapshotOnDisk(raw)
  const exemplars = await Promise.all(
    state.exemplars.map(async (ex) => ({ ...ex, image: await getImage(ex.id, generation) })),
  )
  if (exemplars.some((ex) => !ex.image)) throw new Error('Falta una imagen de referencia guardada')
  const response = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': browserClientId() },
    body: JSON.stringify({ ...state, exemplars }),
  })
  if (!response.ok) throw new Error('No se pudo restaurar la configuración local')
}

let pending: Promise<void> = Promise.resolve()

export function saveBrowserState(): Promise<void> {
  if (!available) return Promise.resolve()
  const save = async () => {
    const response = await fetch('/api/state', {
      headers: { 'X-Client-Id': browserClientId() },
    })
    if (!response.ok) throw new Error('No se pudo guardar la configuración local')
    const state = (await response.json()) as Snapshot
    const previous = storage?.getItem(STATE_KEY)
    let old: ReturnType<typeof snapshotOnDisk> | null = null
    try {
      old = previous ? snapshotOnDisk(previous) : null
    } catch {
      // A corrupt old snapshot must not prevent an imported snapshot from replacing it.
    }
    const generation = randomId(8)
    await putImages(
      state.exemplars.map((ex) => ({ id: ex.id, image: ex.image ?? '' })),
      generation,
    )
    try {
      storage?.setItem(
        STATE_KEY,
        JSON.stringify({
          generation,
          snapshot: {
            ...state,
            exemplars: state.exemplars.map((ex) => {
              const metadata = { ...ex }
              delete metadata.image
              return metadata
            }),
          },
        }),
      )
    } catch (error) {
      await removeImages(
        state.exemplars.map((ex) => ex.id),
        generation,
      ).catch(() => {})
      throw error
    }
    if (old) {
      await removeImages(
        old.snapshot.exemplars.map((ex) => ex.id),
        old.generation,
      ).catch(console.error)
    }
  }
  pending = pending.catch(() => {}).then(save)
  return pending
}

let lastScheduled = 0

export function saveBrowserStateSoon(): void {
  if (Date.now() - lastScheduled < 30000) return
  lastScheduled = Date.now()
  void saveBrowserState().catch((error) => console.error(error))
}

export async function importBrowserSnapshot(
  file: File,
): Promise<{ watchlist: unknown; cameraIds: string[] }> {
  if (!available) throw new Error('El navegador bloquea el almacenamiento local')
  const { watchlist, ...data } = JSON.parse(await file.text()) as Snapshot & {
    watchlist?: unknown
  }
  const response = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': browserClientId() },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('El archivo no contiene una configuración válida')
  await saveBrowserState()
  return {
    watchlist,
    cameraIds: data.views
      .map((view) => view.camera_id)
      .filter((id): id is string => typeof id === 'string'),
  }
}

export async function exportBrowserSnapshot(watchlist?: unknown): Promise<void> {
  const response = await fetch('/api/state', {
    headers: { 'X-Client-Id': browserClientId() },
  })
  if (!response.ok) throw new Error('No se pudo exportar la configuración')
  const data = (await response.json()) as Snapshot
  const blob = new Blob([JSON.stringify({ ...data, watchlist })], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'freepark-data.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
