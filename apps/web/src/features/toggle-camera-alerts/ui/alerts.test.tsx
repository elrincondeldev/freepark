import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCameraStore } from '@/entities/camera'
import { AlertsButton } from './AlertsButton'
import { AlertsSwitch } from './AlertsSwitch'

const requestPermission = vi.fn(async () => 'granted' as NotificationPermission)

function stubNotification(permission: NotificationPermission) {
  vi.stubGlobal('Notification', { permission, requestPermission })
}

beforeEach(() => {
  requestPermission.mockClear()
  useCameraStore.setState({ cameras: [{ id: '47', label: 'Home street', notify: false }] })
})
afterEach(() => vi.unstubAllGlobals())

const camera = () => useCameraStore.getState().cameras[0]

test('turning alerts on asks for browser permission from the click', async () => {
  stubNotification('default')
  render(<AlertsButton camera={camera()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Alert me when a space opens' }))
  expect(requestPermission).toHaveBeenCalledTimes(1)
  expect(camera().notify).toBe(true)
})

test('turning alerts off does not ask again', async () => {
  stubNotification('default')
  useCameraStore.setState({ cameras: [{ id: '47', label: 'Home street', notify: true }] })
  render(<AlertsButton camera={camera()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Turn off alerts' }))
  expect(requestPermission).not.toHaveBeenCalled()
  expect(camera().notify).toBe(false)
})

test('switch explains how to re-enable blocked notifications', () => {
  stubNotification('denied')
  useCameraStore.setState({ cameras: [{ id: '47', label: 'Home street', notify: true }] })
  render(<AlertsSwitch camera={camera()} />)
  expect(screen.getByRole('switch', { name: /Alert me/ })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('note')).toHaveTextContent('notifications are blocked')
})
