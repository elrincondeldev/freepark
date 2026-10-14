import { createCameraStore, STORAGE_KEY } from './cameras'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

test('adds cameras with default labels and prevents duplicates', () => {
  const store = createCameraStore(() => memoryStorage())
  expect(store.getState().addCamera('47')).toBe('added')
  expect(store.getState().addCamera('04', 'Colón')).toBe('added')
  expect(store.getState().addCamera('47')).toBe('duplicate')
  expect(store.getState().cameras).toEqual([
    { id: '47', label: 'Camera 47', notify: false },
    { id: '04', label: 'Colón', notify: false },
  ])
})

test('persists and restores cameras, labels, order and notification flags', async () => {
  const storage = memoryStorage()
  const a = createCameraStore(() => storage)
  a.getState().addCamera('47')
  a.getState().addCamera('04')
  a.getState().renameCamera('47', 'Home street')
  a.getState().toggleNotify('04')
  a.getState().moveCamera('04', 0)
  a.getState().setSound(true)
  expect(JSON.parse(storage.getItem(STORAGE_KEY)!).version).toBe(1)

  const b = createCameraStore(() => storage) // simulates a reload
  await b.persist.rehydrate()
  expect(b.getState().cameras).toEqual([
    { id: '04', label: 'Camera 04', notify: true },
    { id: '47', label: 'Home street', notify: false },
  ])
  expect(b.getState().settings.sound).toBe(true)
  expect(b.getState().storageAvailable).toBe(true)
})

test('remove deletes from storage', () => {
  const storage = memoryStorage()
  const store = createCameraStore(() => storage)
  store.getState().addCamera('47')
  store.getState().removeCamera('47')
  expect(JSON.parse(storage.getItem(STORAGE_KEY)!).state.cameras).toEqual([])
})

test('works without storage when localStorage throws', () => {
  const throwing = {
    setItem: () => {
      throw new DOMException('blocked', 'SecurityError')
    },
    getItem: () => {
      throw new DOMException('blocked', 'SecurityError')
    },
    removeItem: () => {},
  } as unknown as Storage
  const store = createCameraStore(() => throwing)
  expect(store.getState().storageAvailable).toBe(false)
  expect(store.getState().addCamera('47')).toBe('added')
  expect(store.getState().cameras).toHaveLength(1)
})

test('blank rename falls back to the default label', () => {
  const store = createCameraStore(() => memoryStorage())
  store.getState().addCamera('34', 'Areal')
  store.getState().renameCamera('34', '   ')
  expect(store.getState().cameras[0].label).toBe('Camera 34')
})
