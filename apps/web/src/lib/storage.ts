import type { StateStorage } from 'zustand/middleware'

/** localStorage when usable, otherwise an in-memory fallback (private mode, blocked storage). */
export function createSafeStorage(
  getStorage: () => Storage | undefined = () => globalThis.localStorage,
): {
  storage: StateStorage
  available: boolean
} {
  let available = false
  try {
    const s = getStorage()
    if (s) {
      const probe = '__pv_probe__'
      s.setItem(probe, '1')
      s.removeItem(probe)
      available = true
    }
  } catch {
    available = false
  }
  const memory = new Map<string, string>()
  const storage: StateStorage = {
    getItem: (name) => {
      if (!available) return memory.get(name) ?? null
      try {
        return getStorage()!.getItem(name)
      } catch {
        return memory.get(name) ?? null
      }
    },
    setItem: (name, value) => {
      memory.set(name, value)
      if (!available) return
      try {
        getStorage()!.setItem(name, value)
      } catch {
        /* quota or blocked: keep the in-memory copy */
      }
    },
    removeItem: (name) => {
      memory.delete(name)
      if (!available) return
      try {
        getStorage()!.removeItem(name)
      } catch {
        /* ignore */
      }
    },
  }
  return { storage, available }
}
