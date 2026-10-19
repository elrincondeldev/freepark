import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createSafeStorage } from '@/shared/lib'
import type { Coords } from './geo'

export type LocateState = 'idle' | 'locating' | 'denied' | 'unavailable'

/** Saved searches kept, newest first. */
export const MAX_FAVORITES = 10

interface FinderState {
  open: boolean
  /** current search text */
  query: string
  /** searches the user pinned; remembered between visits */
  favorites: string[]
  /** the user's position once they chose "Near me" (never persisted) */
  position: Coords | null
  locate: LocateState
  /** when true the dialog asks for the user's location as soon as it opens */
  locateOnOpen: boolean
  openFinder: (options?: { query?: string; nearMe?: boolean }) => void
  close: () => void
  setQuery: (query: string) => void
  toggleFavorite: (query: string) => void
  removeFavorite: (query: string) => void
  setPosition: (position: Coords | null) => void
  setLocate: (locate: LocateState) => void
}

/** Case-, accent- and spacing-insensitive form used to compare and match searches. */
export const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')

const { storage } = createSafeStorage()

export const useCameraFinder = create<FinderState>()(
  persist(
    (set) => ({
      open: false,
      query: '',
      favorites: [],
      position: null,
      locate: 'idle',
      locateOnOpen: false,
      openFinder: ({ query = '', nearMe = false } = {}) =>
        set({ open: true, query, locateOnOpen: nearMe }),
      close: () => set({ open: false, locateOnOpen: false }),
      setQuery: (query) => set({ query }),
      toggleFavorite: (query) =>
        set((s) => {
          const label = query.trim().replace(/\s+/g, ' ')
          if (!label) return s
          const key = fold(label)
          const saved = s.favorites.some((f) => fold(f) === key)
          return {
            favorites: saved
              ? s.favorites.filter((f) => fold(f) !== key)
              : [label, ...s.favorites].slice(0, MAX_FAVORITES),
          }
        }),
      removeFavorite: (query) =>
        set((s) => ({ favorites: s.favorites.filter((f) => fold(f) !== fold(query)) })),
      setPosition: (position) => set({ position }),
      setLocate: (locate) => set({ locate }),
    }),
    {
      name: 'parking-vision:camera-finder',
      version: 2,
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ favorites: s.favorites }),
      // v1 remembered a selected city, which no longer exists
      migrate: () => ({ favorites: [] }),
    },
  ),
)

export const openCameraFinder = (options?: { query?: string; nearMe?: boolean }) =>
  useCameraFinder.getState().openFinder(options)
