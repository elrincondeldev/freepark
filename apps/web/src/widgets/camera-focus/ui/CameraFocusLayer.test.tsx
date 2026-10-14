import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCameraSelection, useCameraStore } from '@/entities/camera'
import { useFeedStore } from '@/entities/feed'
import { analysisMsg, frameMsg } from '@/test/factories'
import { mockApi } from '@/test/mockApi'
import { CameraFocusLayer as FocusLayer } from './CameraFocusLayer'

const camera = { id: '47', label: 'Home street', notify: false }

beforeEach(() => {
  useCameraStore.setState({ cameras: [camera] })
  useFeedStore.setState({ cameras: {} })
  useCameraSelection.setState({ focusedId: null, panel: { kind: 'live' } })
  vi.unstubAllGlobals()
})

test('opens with the image, overlay and per-zone breakdown', () => {
  act(() => {
    useFeedStore.getState().handle(frameMsg('f1'))
    useFeedStore.getState().handle(analysisMsg('f1'))
    useCameraSelection.getState().focus('47')
  })
  render(<FocusLayer />)
  const dialog = screen.getByRole('dialog', { name: 'Home street' })
  expect(within(dialog).getByTestId('overlay')).toBeInTheDocument()
  const zones = within(dialog).getByRole('list', { name: 'Zones' })
  expect(zones).toHaveTextContent('Right curb')
  expect(zones).toHaveTextContent('1free')
  expect(within(dialog).getByText(/Avenue/)).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Edit zones' })).toBeInTheDocument()
})

test('unknown view shows a call to action that opens the view manager', async () => {
  mockApi({ 'GET /api/cameras/47/views': [] })
  act(() => {
    useFeedStore.getState().handle(frameMsg('f1'))
    useFeedStore
      .getState()
      .handle(analysisMsg('f1', { status: 'unknown_view', viewId: null, totalAvailable: null }))
    useCameraSelection.getState().focus('47')
  })
  render(<FocusLayer />)
  await userEvent.click(screen.getByRole('button', { name: 'Save this view' }))
  expect(await screen.findByText('The camera is showing a new view')).toBeInTheDocument()
})

test('rename, notification toggle and close', async () => {
  act(() => useCameraSelection.getState().focus('47'))
  render(<FocusLayer />)
  const user = userEvent.setup()
  const name = screen.getByLabelText('Camera name')
  await user.clear(name)
  await user.type(name, 'Bakery corner')
  await user.tab()
  expect(useCameraStore.getState().cameras[0].label).toBe('Bakery corner')
  await user.click(screen.getByRole('switch', { name: /Alert me/ }))
  expect(useCameraStore.getState().cameras[0].notify).toBe(true)
  await user.keyboard('{Escape}')
  expect(useCameraSelection.getState().focusedId).toBeNull()
})
