import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toasts } from '../components/Toasts'
import { CameraCard } from '../components/CameraCard'
import { FocusLayer } from '../components/FocusView'
import { useCameraStore } from '../store/cameras'
import { useLiveStore } from '../store/live'
import { useToastStore } from '../store/toasts'
import { useUiStore } from '../store/ui'
import { analysisMsg } from '../test/factories'
import { useAvailabilityAlerts } from './useAvailabilityAlerts'

class MockNotification {
  static permission: NotificationPermission = 'default'
  static requestPermission = vi.fn(async () => MockNotification.permission)
  static instances: MockNotification[] = []
  onclick: (() => void) | null = null
  constructor(
    public title: string,
    public options: NotificationOptions,
  ) {
    MockNotification.instances.push(this)
  }
  close() {}
}

const audioStarts = vi.fn()
class MockAudioContext {
  currentTime = 0
  destination = {}
  createOscillator() {
    return { type: '', frequency: {}, connect: (n: unknown) => n, start: audioStarts, stop() {} }
  }
  createGain() {
    const gain = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }
    return { gain, connect: (n: unknown) => n }
  }
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

const spaces = (frameId: string, n: number) =>
  analysisMsg(frameId, {
    totalAvailable: n,
    zones: [{ zoneId: 5, name: 'Right curb', spaces: n, occupied: [], available: [] }],
  })

function Harness() {
  useAvailabilityAlerts()
  return <Toasts />
}

async function openSpace() {
  await act(async () => {
    useLiveStore.getState().handle(spaces('a', 0))
    useLiveStore.getState().handle(spaces('b', 1))
    await Promise.resolve()
  })
}

beforeEach(() => {
  MockNotification.permission = 'default'
  MockNotification.instances = []
  MockNotification.requestPermission.mockClear()
  audioStarts.mockClear()
  vi.stubGlobal('Notification', MockNotification)
  vi.stubGlobal('AudioContext', MockAudioContext)
  setVisibility('visible')
  useLiveStore.setState({ cameras: {} })
  useToastStore.setState({ toasts: [] })
  useUiStore.setState({ focusId: null, editor: null })
  useCameraStore.setState({
    cameras: [{ id: '47', label: 'Home street', notify: true }],
    settings: { sound: false },
  })
})

afterEach(() => vi.unstubAllGlobals())

test('a space opening shows a toast naming the zone and camera', async () => {
  render(<Harness />)
  await openSpace()
  expect(screen.getByRole('status')).toHaveTextContent('1 free space — Home street')
  expect(screen.getByRole('status')).toHaveTextContent('Right curb: 1 free')
  expect(MockNotification.instances).toHaveLength(0) // tab visible: in-app only
  expect(audioStarts).not.toHaveBeenCalled() // chime is off by default
})

test('clicking the toast opens the camera focus view', async () => {
  render(<Harness />)
  await openSpace()
  await userEvent.click(screen.getByText(/1 free space/))
  expect(useUiStore.getState().focusId).toBe('47')
})

test('no alert for cameras with notifications off', async () => {
  useCameraStore.setState({ cameras: [{ id: '47', label: 'Home street', notify: false }] })
  render(<Harness />)
  await openSpace()
  expect(screen.queryByRole('status')).toBeNull()
})

test('hidden tab with permission gets a native notification that focuses the camera', async () => {
  MockNotification.permission = 'granted'
  setVisibility('hidden')
  render(<Harness />)
  await openSpace()
  expect(MockNotification.instances).toHaveLength(1)
  expect(MockNotification.instances[0].title).toBe('1 free space — Home street')
  act(() => MockNotification.instances[0].onclick?.())
  expect(useUiStore.getState().focusId).toBe('47')
})

test('permission denied: only toasts, and the focus view explains how to re-enable', async () => {
  MockNotification.permission = 'denied'
  setVisibility('hidden')
  render(<Harness />)
  await openSpace()
  expect(MockNotification.instances).toHaveLength(0)
  expect(screen.getByRole('status')).toBeInTheDocument()
  act(() => useUiStore.getState().focus('47'))
  render(<FocusLayer />)
  expect(screen.getByRole('note')).toHaveTextContent('notifications are blocked')
})

test('turning alerts on asks for browser permission from the click', async () => {
  useCameraStore.setState({ cameras: [{ id: '47', label: 'Home street', notify: false }] })
  render(<CameraCard camera={useCameraStore.getState().cameras[0]} index={0} />)
  await userEvent.click(screen.getByRole('button', { name: 'Alert me when a space opens' }))
  expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1)
  expect(useCameraStore.getState().cameras[0].notify).toBe(true)
})

test('optional chime plays when sound is enabled', async () => {
  useCameraStore.setState({ settings: { sound: true } })
  render(<Harness />)
  await openSpace()
  expect(audioStarts).toHaveBeenCalledTimes(2)
})
