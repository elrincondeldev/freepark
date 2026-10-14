import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createSafeStorage } from '../lib/storage'

export interface WatchedCamera {
  id: string
  label: string
  notify: boolean
}

export interface Settings {
  sound: boolean
}

interface CameraState {
  cameras: WatchedCamera[]
  settings: Settings
  storageAvailable: boolean
  addCamera: (id: string, label?: string) => 'added' | 'duplicate'
  removeCamera: (id: string) => void
  renameCamera: (id: string, label: string) => void
  moveCamera: (id: string, toIndex: number) => void
  toggleNotify: (id: string) => void
  setSound: (sound: boolean) => void
}

export const STORAGE_KEY = 'parking-vision:v1'
export const defaultLabel = (id: string) => `Camera ${id}`

export function createCameraStore(getStorage?: () => Storage | undefined) {
  const { storage, available } = createSafeStorage(getStorage)
  return create<CameraState>()(
    persist(
      (set, get) => ({
        cameras: [],
        settings: { sound: false },
        storageAvailable: available,
        addCamera: (id, label) => {
          if (get().cameras.some((c) => c.id === id)) return 'duplicate'
          set((s) => ({
            cameras: [
              ...s.cameras,
              { id, label: label?.trim() || defaultLabel(id), notify: false },
            ],
          }))
          return 'added'
        },
        removeCamera: (id) => set((s) => ({ cameras: s.cameras.filter((c) => c.id !== id) })),
        renameCamera: (id, label) =>
          set((s) => ({
            cameras: s.cameras.map((c) =>
              c.id === id ? { ...c, label: label.trim() || defaultLabel(id) } : c,
            ),
          })),
        moveCamera: (id, toIndex) =>
          set((s) => {
            const from = s.cameras.findIndex((c) => c.id === id)
            if (from < 0) return s
            const next = [...s.cameras]
            const [item] = next.splice(from, 1)
            next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item)
            return { cameras: next }
          }),
        toggleNotify: (id) =>
          set((s) => ({
            cameras: s.cameras.map((c) => (c.id === id ? { ...c, notify: !c.notify } : c)),
          })),
        setSound: (sound) => set((s) => ({ settings: { ...s.settings, sound } })),
      }),
      {
        name: STORAGE_KEY,
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: (s) => ({ cameras: s.cameras, settings: s.settings }),
        migrate: (persisted) => persisted as Pick<CameraState, 'cameras' | 'settings'>,
      },
    ),
  )
}

export const useCameraStore = createCameraStore()
