import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCameraStore } from '../store/cameras'
import { useLiveStore } from '../store/live'
import { useUiStore } from '../store/ui'
import { analysisMsg, frameMsg } from '../test/factories'
import { mockApi } from '../test/mockApi'
import { FocusLayer } from './FocusView'

const camera = { id: '47', label: 'Home street', notify: false }

beforeEach(() => {
  useCameraStore.setState({ cameras: [camera] })
  useLiveStore.setState({ cameras: {} })
  useUiStore.setState({ focusId: null, editor: null })
  vi.unstubAllGlobals()
})

test('opens with the image, overlay and per-zone breakdown', () => {
  act(() => {
    useLiveStore.getState().handle(frameMsg('f1'))
    useLiveStore.getState().handle(analysisMsg('f1'))
    useUiStore.getState().focus('47')
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
    useLiveStore.getState().handle(frameMsg('f1'))
    useLiveStore
      .getState()
      .handle(analysisMsg('f1', { status: 'unknown_view', viewId: null, totalAvailable: null }))
    useUiStore.getState().focus('47')
  })
  render(<FocusLayer />)
  await userEvent.click(screen.getByRole('button', { name: 'Save this view' }))
  expect(await screen.findByText('The camera is showing a new view')).toBeInTheDocument()
})

test('rename, notification toggle and close', async () => {
  act(() => useUiStore.getState().focus('47'))
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
  expect(useUiStore.getState().focusId).toBeNull()
})
