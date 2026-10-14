import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCameraSelection, useCameraStore } from '@/entities/camera'
import { AddCameraForm as AddCamera } from './AddCameraForm'

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

const probe = (id: string) => ({
  cameraId: id,
  frameId: '1-abcdef12',
  capturedAt: '',
  url: `/api/cameras/${id}/frames/1-abcdef12.jpg`,
})

beforeEach(() => {
  useCameraStore.setState({ cameras: [] })
  vi.unstubAllGlobals()
})

async function submit(text: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Camera link or number'), text)
  await user.click(screen.getByRole('button', { name: 'Add' }))
}

test('adds a camera from a full URL and shows a preview', async () => {
  const fetch = mockFetch(200, probe('47'))
  render(<AddCamera />)
  await submit('https://camaras.vigo.org/webcam/cam.php?id=47')
  expect(await screen.findByAltText('Preview of camera 47')).toBeInTheDocument()
  expect(useCameraStore.getState().cameras.map((c) => c.id)).toEqual(['47'])
  expect(fetch.mock.calls[0][0]).toContain(
    encodeURIComponent('https://camaras.vigo.org/webcam/cam.php?id=47'),
  )
})

test('adds a camera from a bare id', async () => {
  mockFetch(200, probe('04'))
  render(<AddCamera />)
  await submit('04')
  expect(await screen.findByText(/added/)).toBeInTheDocument()
  expect(useCameraStore.getState().cameras[0].id).toBe('04')
})

test('rejects invalid input without calling the API', async () => {
  const fetch = mockFetch(200, {})
  render(<AddCamera />)
  await submit('https://example.com/foo')
  expect(screen.getByRole('alert')).toHaveTextContent(/doesn't look like a Vigo camera/)
  expect(fetch).not.toHaveBeenCalled()
  expect(useCameraStore.getState().cameras).toEqual([])
})

test('reports an unreachable camera', async () => {
  mockFetch(502, { detail: 'camera 99 could not be reached: empty response' })
  render(<AddCamera />)
  await submit('99')
  expect(await screen.findByRole('alert')).toHaveTextContent('Camera 99 could not be reached')
  expect(useCameraStore.getState().cameras).toEqual([])
})

test('highlights an already watched camera instead of duplicating it', async () => {
  const fetch = mockFetch(200, probe('47'))
  useCameraStore.getState().addCamera('47')
  render(<AddCamera />)
  await submit('47')
  expect(screen.getByRole('alert')).toHaveTextContent('already watching camera 47')
  expect(useCameraSelection.getState().highlightedId).toBe('47')
  expect(fetch).not.toHaveBeenCalled()
  expect(useCameraStore.getState().cameras).toHaveLength(1)
})

test('autoFocus focuses the input', () => {
  render(<AddCamera autoFocus />)
  expect(screen.getByLabelText('Camera link or number')).toHaveFocus()
})
