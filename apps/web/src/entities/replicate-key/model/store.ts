import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createSafeStorage } from '@/shared/lib'

interface ReplicateKeyState {
  key: string
  storageAvailable: boolean
  setKey: (key: string) => void
}

export const REPLICATE_KEY_STORAGE = 'parking-vision:replicate-key:v1'

export function createReplicateKeyStore(getStorage?: () => Storage | undefined) {
  const { storage, available } = createSafeStorage(getStorage)
  return create<ReplicateKeyState>()(
    persist(
      (set) => ({
        key: '',
        storageAvailable: available,
        setKey: (key) => set({ key: key.trim() }),
      }),
      {
        name: REPLICATE_KEY_STORAGE,
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ key: state.key }),
      },
    ),
  )
}

export const useReplicateKeyStore = createReplicateKeyStore()
