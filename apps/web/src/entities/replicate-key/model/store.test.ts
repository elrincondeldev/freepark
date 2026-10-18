import { createReplicateKeyStore, REPLICATE_KEY_STORAGE } from './store'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  }
}

test('saves, restores, replaces and removes the key in browser storage', async () => {
  const storage = memoryStorage()
  const first = createReplicateKeyStore(() => storage)
  first.getState().setKey('  key-a  ')
  expect(first.getState().key).toBe('key-a')
  expect(storage.getItem(REPLICATE_KEY_STORAGE)).toContain('key-a')

  const second = createReplicateKeyStore(() => storage)
  await second.persist.rehydrate()
  expect(second.getState().key).toBe('key-a')
  second.getState().setKey('key-b')
  expect(storage.getItem(REPLICATE_KEY_STORAGE)).not.toContain('key-a')
  second.getState().setKey('')
  expect(second.getState().key).toBe('')
  expect(storage.getItem(REPLICATE_KEY_STORAGE)).not.toContain('key-b')
})
