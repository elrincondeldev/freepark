import type { CatalogCity } from '../api/catalog'
import { nearestStreetKm, search, toDirectoryCameras } from './directory'

const city = (id: string, name: string, scope: 'city' | 'country'): CatalogCity => ({
  id,
  name,
  country: 'Spain',
  lat: 0,
  lon: 0,
  provider: name,
  scope,
})
const cam = (id: string, name: string, lat: number, lon: number) => ({
  id,
  name,
  lat,
  lon,
  input: id,
  previewUrl: `https://cams.test/${id}.jpg`,
})

const cameras = [
  ...toDirectoryCameras(city('spain-roads', 'All of Spain', 'country'), [
    cam('dgt-1', 'A-55 km 2 → Vigo · Pontevedra', 42.2, -8.68),
  ]),
  ...toDirectoryCameras(city('vigo', 'Vigo', 'city'), [
    cam('05', 'Castelao - Grove', 42.218, -8.744),
    cam('27', 'Praza de España', 42.231, -8.712),
  ]),
  ...toDirectoryCameras(city('madrid', 'Madrid', 'city'), [
    cam('m1', 'Gran Vía - Callao', 40.42, -3.705),
  ]),
]
const ids = (results: ReturnType<typeof search>) => results.map((r) => r.camera.id)

test('a city name finds its street cameras before road cameras that mention it', () => {
  expect(ids(search(cameras, 'vigo', null))).toEqual(['05', '27', 'dgt-1'])
})

test('every word must match, ignoring accents and case', () => {
  expect(ids(search(cameras, 'ESPANA vigo', null))).toEqual(['27'])
  expect(ids(search(cameras, 'gran via', null))).toEqual(['m1'])
  expect(ids(search(cameras, 'carretera pontevedra', null))).toEqual(['dgt-1'])
})

test('with a position, results are closest first with distances', () => {
  const results = search(cameras, '', { lat: 42.232, lon: -8.711 })
  expect(ids(results)[0]).toBe('27')
  expect(results[0].km).toBeLessThan(1)
})

test('labels say which city or that it is a road camera', () => {
  expect(cameras.map((c) => c.place)).toEqual(['Road camera', 'Vigo', 'Vigo', 'Madrid'])
})

test('nearest street camera ignores road cameras', () => {
  expect(nearestStreetKm(cameras, { lat: 42.2, lon: -8.68 })).toBeGreaterThan(2)
})
