import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCameraSelection, useCameraStore } from '@/entities/camera'
import { mockApi } from '@/test/mockApi'
import { resetCatalogCache } from '../api/catalog'
import { resetDirectoryCache } from '../model/directory'
import { openCameraFinder, useCameraFinder } from '../model/finder'
import { CameraFinderDialog } from './CameraFinderDialog'

const source = (id: string, name: string, scope: 'city' | 'country', lat = 0, lon = 0) => ({
  id,
  name,
  country: 'Spain',
  lat,
  lon,
  provider: `${name} data`,
  scope,
})
const VIGO = source('vigo', 'Vigo', 'city', 42.23, -8.72)
const ROADS = source('spain-roads', 'All of Spain', 'country', 40.2, -3.7)
const camera = (id: string, name: string, lat: number, lon: number) => ({
  id,
  name,
  lat,
  lon,
  input: id,
  previewUrl: `https://cams.test/${id}.jpg`,
})
const VIGO_CAMERAS = [
  camera('05', 'Castelao - Grove', 42.218, -8.744),
  camera('24', 'Policarpo Sanz', 42.2375, -8.723),
  camera('27', 'Praza de España', 42.231, -8.712),
]
const ROAD_CAMERAS = [
  camera('dgt-1', 'A-2 km 310 → Zaragoza · Zaragoza', 41.63, -0.95),
  camera('dgt-2', 'A-6 km 10 → Madrid · Madrid', 40.47, -3.8),
]
const probe = (id: string) => ({
  cameraId: id,
  frameId: '1-a',
  capturedAt: '',
  url: `/api/cameras/${id}/frames/1-a.jpg`,
})

function api(
  probeRoute: unknown = (url: string) => probe(new URL(url, 'http://x').searchParams.get('input')!),
) {
  return mockApi({
    'GET /api/catalog/cities/vigo/cameras': { city: VIGO, cameras: VIGO_CAMERAS },
    'GET /api/catalog/cities/spain-roads/cameras': { city: ROADS, cameras: ROAD_CAMERAS },
    'GET /api/catalog/cities': [VIGO, ROADS],
    'GET /api/cameras/probe': probeRoute,
  })
}

function openFinder(options?: Parameters<typeof openCameraFinder>[0]) {
  render(<CameraFinderDialog />)
  act(() => openCameraFinder(options))
  return screen.getByRole('dialog')
}

function stubLocation(latitude: number, longitude: number) {
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude, longitude } } as GeolocationPosition),
    },
  })
}

beforeEach(() => {
  resetCatalogCache()
  resetDirectoryCache()
  useCameraStore.setState({ cameras: [] })
  useCameraFinder.setState({
    open: false,
    query: '',
    favorites: [],
    position: null,
    locate: 'idle',
  })
})

test('opens on a search box with no city shortcuts', async () => {
  api()
  const dialog = openFinder()
  expect(await within(dialog).findByText('Where are you parking?')).toBeInTheDocument()
  expect(within(dialog).getByRole('searchbox')).toBeInTheDocument()
  const pills = within(dialog).getByRole('group', { name: 'Quick searches' })
  expect(
    within(pills)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['Near me'])
})

test('searching a city lists its cameras and adds one in one tap, named after the place', async () => {
  const calls = api()
  const dialog = openFinder()
  await userEvent.type(within(dialog).getByRole('searchbox'), 'vigo')
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Add Castelao - Grove' }))
  expect(
    await within(dialog).findByRole('button', { name: /Castelao - Grove, already watching/ }),
  ).toBeInTheDocument()
  expect(useCameraStore.getState().cameras).toEqual([
    { id: '05', label: 'Castelao - Grove', notify: false },
  ])
  expect(calls.some((c) => c.url.startsWith('/api/cameras/probe?input=05'))).toBe(true)
  expect(within(dialog).getByRole('button', { name: 'Done · 1 added' })).toBeInTheDocument()
})

test('search ignores accents and spans cities and roads', async () => {
  api()
  const dialog = openFinder({ query: 'espana' })
  expect(
    await within(dialog).findByRole('button', { name: 'Add Praza de España' }),
  ).toBeInTheDocument()
  expect(within(dialog).getByText(/match/)).toHaveTextContent('1 camera matches “espana”')
  await userEvent.clear(within(dialog).getByRole('searchbox'))
  await userEvent.type(within(dialog).getByRole('searchbox'), 'zaragoza')
  expect(
    within(dialog).getByRole('button', { name: 'Add A-2 km 310 → Zaragoza · Zaragoza' }),
  ).toBeInTheDocument()
})

test('a search can be saved, reused from its pill and removed', async () => {
  api()
  const dialog = openFinder()
  await userEvent.type(within(dialog).getByRole('searchbox'), 'Policarpo')
  await userEvent.click(within(dialog).getByRole('button', { name: /Save “Policarpo”/ }))
  expect(useCameraFinder.getState().favorites).toEqual(['Policarpo'])

  await userEvent.clear(within(dialog).getByRole('searchbox'))
  await userEvent.click(within(dialog).getByRole('button', { name: /Policarpo/, pressed: false }))
  expect(within(dialog).getByRole('searchbox')).toHaveValue('Policarpo')
  expect(
    await within(dialog).findByRole('button', { name: 'Add Policarpo Sanz' }),
  ).toBeInTheDocument()

  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Remove saved search “Policarpo”' }),
  )
  expect(useCameraFinder.getState().favorites).toEqual([])
})

test('saved searches are normalised and are what gets remembered', () => {
  useCameraFinder.getState().toggleFavorite('  Gran   Vía ')
  useCameraFinder.getState().toggleFavorite('gran via')
  expect(useCameraFinder.getState().favorites).toEqual([])
  useCameraFinder.getState().toggleFavorite('Gran Vía')
  const { partialize } = useCameraFinder.persist.getOptions()
  expect(partialize!(useCameraFinder.getState())).toEqual({ favorites: ['Gran Vía'] })
})

test('choosing an already watched camera closes the finder and highlights it', async () => {
  api()
  useCameraStore.getState().addCamera('24', 'Policarpo Sanz')
  const dialog = openFinder({ query: 'policarpo' })
  await userEvent.click(
    await within(dialog).findByRole('button', { name: /Policarpo Sanz, already watching/ }),
  )
  expect(useCameraFinder.getState().open).toBe(false)
  expect(useCameraSelection.getState().highlightedId).toBe('24')
})

test('a camera that does not respond explains itself and is not added', async () => {
  api(() => new Response('{"detail":"down"}', { status: 502 }))
  const dialog = openFinder({ query: 'policarpo' })
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Add Policarpo Sanz' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/isn't sending images/)
  expect(useCameraStore.getState().cameras).toEqual([])
})

test('near me lists the closest cameras first, across every directory', async () => {
  api()
  stubLocation(42.2376, -8.7231)
  const dialog = openFinder({ nearMe: true })
  await within(dialog).findByText('Cameras closest to you')
  const names = within(dialog)
    .getAllByRole('button', { name: /^Add (?!a camera)/ })
    .map((b) => b.getAttribute('aria-label'))
  expect(names.slice(0, 3)).toEqual([
    'Add Policarpo Sanz',
    'Add Praza de España',
    'Add Castelao - Grove',
  ])
  expect(within(dialog).queryByRole('status')).toBeNull()
})

test('near me far from any city explains that these are road cameras', async () => {
  api()
  stubLocation(41.65, -0.88)
  const dialog = openFinder({ nearMe: true })
  expect(await within(dialog).findByRole('status')).toHaveTextContent(/DGT road cameras closest/)
  await within(dialog).findByText('Cameras closest to you')
  expect(within(dialog).getAllByRole('button', { name: /^Add A-/ })[0]).toHaveAccessibleName(
    'Add A-2 km 310 → Zaragoza · Zaragoza',
  )
})

test('denied location falls back to searching', async () => {
  api()
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: {
      getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) =>
        fail({ code: 1 } as GeolocationPositionError),
    },
  })
  const dialog = openFinder({ nearMe: true })
  expect(await within(dialog).findByRole('status')).toHaveTextContent(
    /Location access is turned off/,
  )
  expect(await within(dialog).findByText('Where are you parking?')).toBeInTheDocument()
})

test('can switch to adding by link and back', async () => {
  api()
  const dialog = openFinder()
  await userEvent.click(within(dialog).getByRole('button', { name: /Add a camera by link/ }))
  expect(within(dialog).getByLabelText('Camera link or number')).toHaveFocus()
  await userEvent.click(within(dialog).getByRole('button', { name: /Back to camera list/ }))
  expect(await within(dialog).findByRole('searchbox')).toBeInTheDocument()
})

test('Escape closes the finder', async () => {
  api()
  openFinder()
  await userEvent.keyboard('{Escape}')
  expect(useCameraFinder.getState().open).toBe(false)
})
