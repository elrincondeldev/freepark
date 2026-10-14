import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { View } from '@/entities/view'
import { mockApi } from '@/test/mockApi'
import { ViewManager } from './ViewManager'

const view = (id: number, name: string): View => ({
  id,
  cameraId: '47',
  name,
  createdAt: '',
  referenceUrl: `/api/views/${id}/reference.jpg`,
  exemplarCount: 1,
  zoneCount: 2,
})

const onEditZones = vi.fn()

beforeEach(() => {
  vi.unstubAllGlobals()
  onEditZones.mockClear()
})

function renderManager(props: Partial<Parameters<typeof ViewManager>[0]> = {}) {
  return render(
    <ViewManager
      cameraId="47"
      frameId="f9"
      currentViewId={1}
      unknownView={false}
      onEditZones={onEditZones}
      {...props}
    />,
  )
}

test('saves the current frame as a new view and opens its zone editor', async () => {
  const calls = mockApi({
    'GET /api/cameras/47/views': [],
    'POST /api/cameras/47/views': view(7, 'Port'),
  })
  renderManager({ unknownView: true })
  expect(await screen.findByText('The camera is showing a new view')).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('New view name'), 'Port')
  await userEvent.click(screen.getByRole('button', { name: 'Save this view' }))
  expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ frameId: 'f9', name: 'Port' })
  expect(onEditZones).toHaveBeenCalledWith(7)
})

test('lists, renames, re-captures and deletes views', async () => {
  const calls = mockApi({
    'GET /api/cameras/47/views': [view(1, 'Avenue'), view(2, 'Crossing')],
    'PATCH /api/views/2': view(2, 'Square'),
    'POST /api/views/1/reference': { ...view(1, 'Avenue'), zonesRealigned: true },
    'DELETE /api/views/2': undefined,
  })
  renderManager()
  expect(await screen.findByText('Showing now')).toBeInTheDocument()
  const user = userEvent.setup()
  const rename = screen.getByLabelText('Rename Crossing')
  await user.clear(rename)
  await user.type(rename, 'Square')
  await user.tab()
  expect(calls.some((c) => c.method === 'PATCH' && c.url === '/api/views/2')).toBe(true)

  await user.click(screen.getAllByRole('button', { name: 'Re-capture' })[0])
  expect(calls.find((c) => c.url === '/api/views/1/reference')?.body).toEqual({ frameId: 'f9' })

  await user.click(screen.getAllByRole('button', { name: 'Delete' })[1])
  await user.click(screen.getByRole('button', { name: 'Delete view + zones?' }))
  expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/views/2')).toBe(true)
})

test('edit zones opens the zone editor for that view', async () => {
  mockApi({ 'GET /api/cameras/47/views': [view(1, 'Avenue')] })
  renderManager()
  await userEvent.click(await screen.findByRole('button', { name: 'Edit zones' }))
  expect(onEditZones).toHaveBeenCalledWith(1)
})
