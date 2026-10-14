import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFeedStore } from '@/entities/feed'
import type { View } from '@/entities/view'
import type { Zone } from '@/entities/zone'
import { useToastStore } from '@/shared/ui'
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

const markReanalysing = vi.fn()

beforeEach(() => {
  vi.unstubAllGlobals()
  markReanalysing.mockClear()
  useFeedStore.setState({ markReanalysing })
  useToastStore.setState({ toasts: [] })
})

function canvas() {
  const svg = screen.getByTestId('zone-canvas')
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 225, right: 400, bottom: 225, x: 0, y: 0 }) as DOMRect
  return svg
}

const click = (x: number, y: number) => fireEvent.click(canvas(), { clientX: x, clientY: y })

test('a view without zones starts drawing; double-click finishes and save applies it', async () => {
  const onDirtyChange = vi.fn()
  const calls = mockApi({
    'GET /api/views/3/zones': [],
    'POST /api/views/3/zones': { ...zone, id: 12, name: 'Curb 1' },
  })
  render(<ZoneEditor view={view} onDirtyChange={onDirtyChange} />)
  await screen.findByRole('button', { name: 'Save zone' })
  click(280, 214)
  click(240, 135)
  click(220, 90)
  fireEvent.doubleClick(canvas())
  expect(screen.getAllByTestId('zone-point')).toHaveLength(3)
  expect(screen.getByTestId('band-preview')).toBeInTheDocument()
  expect(onDirtyChange).toHaveBeenLastCalledWith(true)

  await userEvent.click(screen.getByRole('button', { name: 'Save zone' }))
  const post = calls.find((c) => c.method === 'POST')!
  expect(post.body).toMatchObject({ name: 'Curb 1', bandNear: 0.03, minGapCars: null })
  expect((post.body as Zone).points).toEqual([
    [0.7, 214 / 225],
    [0.6, 0.6],
    [0.55, 0.4],
  ])
  expect(markReanalysing).toHaveBeenCalledWith('47')
  expect(useToastStore.getState().toasts[0].title).toBe('Zone “Curb 1” saved')
  expect(await screen.findByRole('button', { name: 'New zone' })).toBeInTheDocument()
  expect(onDirtyChange).toHaveBeenLastCalledWith(false)
})

test('keyboard: Backspace undoes the last point, Enter finishes the line', async () => {
  mockApi({ 'GET /api/views/3/zones': [] })
  render(<ZoneEditor view={view} />)
  await screen.findByRole('button', { name: 'Save zone' })
  click(100, 100)
  click(150, 150)
  click(200, 200)
  fireEvent.keyDown(window, { key: 'Backspace' })
  expect(screen.getAllByTestId('zone-point')).toHaveLength(2)
  fireEvent.keyDown(window, { key: 'Enter' })
  expect(await screen.findByRole('button', { name: 'Remove point' })).toBeInTheDocument()
})

test('refuses to save a zone with fewer than two points', async () => {
  const calls = mockApi({ 'GET /api/views/3/zones': [] })
  render(<ZoneEditor view={view} />)
  await screen.findByRole('button', { name: 'Save zone' })
  click(100, 100)
  await userEvent.click(screen.getByRole('button', { name: 'Save zone' }))
  expect(screen.getByRole('alert')).toHaveTextContent('at least two points')
  expect(calls.some((c) => c.method === 'POST')).toBe(false)
})

test('edits an existing zone: drag a point, insert one, rename and save', async () => {
  const calls = mockApi({
    'GET /api/views/3/zones': [zone],
    'PATCH /api/zones/11': zone,
  })
  render(<ZoneEditor view={view} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Right curb' }))
  const name = await screen.findByDisplayValue('Right curb')
  const svg = canvas()
  const [first] = screen.getAllByTestId('zone-point')
  fireEvent.pointerDown(first, { clientX: 280, clientY: 214, pointerId: 1 })
  fireEvent.pointerMove(svg, { clientX: 300, clientY: 200, pointerId: 1 })
  fireEvent.pointerUp(svg, { pointerId: 1 })
  fireEvent.click(screen.getByLabelText('Insert point after point 1'))
  expect(screen.getAllByTestId('zone-point')).toHaveLength(3)
  await userEvent.clear(name)
  await userEvent.type(name, 'Bakery side')
  await userEvent.click(screen.getByRole('button', { name: 'Save zone' }))
  const patch = calls.find((c) => c.method === 'PATCH')!
  expect(patch.body).toMatchObject({ name: 'Bakery side' })
  expect((patch.body as Zone).points[0]).toEqual([0.75, 200 / 225])
  expect((patch.body as Zone).points).toHaveLength(3)
})

test('keeps at least two points and deletes a zone', async () => {
  const calls = mockApi({
    'GET /api/views/3/zones': [zone],
    'DELETE /api/zones/11': undefined,
  })
  render(<ZoneEditor view={view} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Right curb' }))
  await screen.findByDisplayValue('Right curb')
  fireEvent.pointerDown(screen.getAllByTestId('zone-point')[0], { pointerId: 1 })
  expect(screen.getByRole('button', { name: 'Remove point' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Delete zone' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true))
  expect(markReanalysing).toHaveBeenCalledWith('47')
})
