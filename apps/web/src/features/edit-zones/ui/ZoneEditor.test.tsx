import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { View } from '@/entities/view'
import type { Zone } from '@/entities/zone'
import { mockApi } from '@/test/mockApi'
import { ZoneEditor } from './ZoneEditor'

const view: View = {
  id: 3,
  cameraId: '47',
  name: 'Avenue',
  createdAt: '',
  referenceUrl: '/api/views/3/reference.jpg',
  exemplarCount: 1,
  zoneCount: 1,
}

const zone: Zone = {
  id: 11,
  viewId: 3,
  name: 'Right curb',
  points: [
    [0.7, 0.95],
    [0.6, 0.6],
  ],
  bandNear: 0.03,
  bandFar: 0.012,
  minGapCars: null,
  updatedAt: '',
}

beforeEach(() => vi.unstubAllGlobals())

function canvas() {
  const svg = screen.getByTestId('zone-canvas')
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 225, right: 400, bottom: 225, x: 0, y: 0 }) as DOMRect
  return svg
}

test('draws a new zone by clicking along the curb and saves it', async () => {
  const calls = mockApi({
    'GET /api/views/3/zones': [],
    'POST /api/views/3/zones': { ...zone, id: 12, name: 'Curb 1' },
  })
  render(<ZoneEditor view={view} onClose={() => {}} />)
  await userEvent.click(await screen.findByRole('button', { name: 'New zone' }))
  fireEvent.click(canvas(), { clientX: 280, clientY: 214 })
  fireEvent.click(canvas(), { clientX: 240, clientY: 135 })
  fireEvent.click(canvas(), { clientX: 220, clientY: 90 })
  expect(screen.getAllByTestId('zone-point')).toHaveLength(3)
  expect(screen.getByTestId('band-preview')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Finish line' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save zone' }))
  const post = calls.find((c) => c.method === 'POST')!
  expect(post.body).toMatchObject({
    name: 'Curb 1',
    bandNear: 0.03,
    bandFar: 0.012,
    minGapCars: null,
  })
  expect((post.body as Zone).points).toEqual([
    [0.7, 214 / 225],
    [0.6, 0.6],
    [0.55, 0.4],
  ])
})

test('refuses to save a zone with fewer than two points', async () => {
  const calls = mockApi({ 'GET /api/views/3/zones': [] })
  render(<ZoneEditor view={view} onClose={() => {}} />)
  await userEvent.click(await screen.findByRole('button', { name: 'New zone' }))
  fireEvent.click(canvas(), { clientX: 100, clientY: 100 })
  await userEvent.click(screen.getByRole('button', { name: 'Save zone' }))
  expect(screen.getByRole('alert')).toHaveTextContent('at least two points')
  expect(calls.some((c) => c.method === 'POST')).toBe(false)
})

test('edits an existing zone: drag a point, insert one, rename and save', async () => {
  const calls = mockApi({
    'GET /api/views/3/zones': [zone],
    'PATCH /api/zones/11': zone,
  })
  render(<ZoneEditor view={view} onClose={() => {}} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Right curb' }))
  const svg = canvas()
  const [first] = screen.getAllByTestId('zone-point')
  fireEvent.pointerDown(first, { clientX: 280, clientY: 214, pointerId: 1 })
  fireEvent.pointerMove(svg, { clientX: 300, clientY: 200, pointerId: 1 })
  fireEvent.pointerUp(svg, { pointerId: 1 })
  fireEvent.click(screen.getByLabelText('Insert point after point 1'))
  expect(screen.getAllByTestId('zone-point')).toHaveLength(3)
  const name = screen.getByDisplayValue('Right curb')
  await userEvent.clear(name)
  await userEvent.type(name, 'Bakery side')
  await userEvent.click(screen.getByRole('button', { name: 'Save zone' }))
  const patch = calls.find((c) => c.method === 'PATCH')!
  expect(patch.body).toMatchObject({ name: 'Bakery side' })
  expect((patch.body as Zone).points[0]).toEqual([0.75, 200 / 225])
  expect((patch.body as Zone).points).toHaveLength(3)
})

test('removes a point (keeping at least two) and deletes a zone', async () => {
  const calls = mockApi({
    'GET /api/views/3/zones': [zone],
    'DELETE /api/zones/11': undefined,
  })
  render(<ZoneEditor view={view} onClose={() => {}} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Right curb' }))
  fireEvent.pointerDown(screen.getAllByTestId('zone-point')[0], { pointerId: 1 })
  expect(screen.getByRole('button', { name: 'Remove point' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Delete zone' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true))
})
