import { distanceKm, formatDistance } from './geo'

test('distance between Vigo and Madrid is about 460 km', () => {
  const km = distanceKm({ lat: 42.23, lon: -8.72 }, { lat: 40.42, lon: -3.7 })
  expect(km).toBeGreaterThan(440)
  expect(km).toBeLessThan(480)
})

test('distances read naturally', () => {
  expect(formatDistance(0.153)).toBe('150 m')
  expect(formatDistance(2.345)).toBe('2.3 km')
})
