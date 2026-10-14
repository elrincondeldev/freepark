import { act, render, screen, waitFor } from '@testing-library/react'
import { useCameraStore } from '@/entities/camera'
import { useFeedStore } from '@/entities/feed'
import { analysisMsg, frameMsg } from '@/test/factories'
import { CameraCard } from './CameraCard'

const camera = { id: '47', label: 'Home street', notify: false }

beforeEach(() => {
  useFeedStore.setState({ cameras: {} })
  useCameraStore.setState({ cameras: [camera] })
})

const push = (...msgs: Parameters<ReturnType<typeof useFeedStore.getState>['handle']>[0][]) =>
  act(() => msgs.forEach((m) => useFeedStore.getState().handle(m)))

const badge = () =>
  document.querySelector('[data-status]:not(article)')?.getAttribute('data-status')

test('draws red occupied boxes, green available areas and faint other vehicles', () => {
  push(frameMsg('f1'), analysisMsg('f1'))
  render(<CameraCard camera={camera} />)
  expect(document.querySelectorAll('[data-kind="occupied"]')).toHaveLength(2)
  expect(document.querySelectorAll('[data-kind="available"]')).toHaveLength(1)
  expect(document.querySelectorAll('[data-kind="other"]')).toHaveLength(1)
  expect(screen.getByTestId('free-chip')).toHaveTextContent('1free')
  expect(badge()).toBe('live')
})

test('keeps overlays tied to the displayed frame while the next one is analysed', async () => {
  push(frameMsg('f1'), analysisMsg('f1'))
  render(<CameraCard camera={camera} />)
  push(frameMsg('f2'))
  expect(badge()).toBe('analysing')
  expect(screen.getByTestId('overlay')).toHaveAttribute('data-frame', 'f1')
  expect(screen.getByTestId('free-chip')).toHaveTextContent('—')
  push(analysisMsg('f2', { totalAvailable: 0, zones: [] }))
  await waitFor(() => expect(screen.getByTestId('overlay')).toHaveAttribute('data-frame', 'f2'))
  expect(badge()).toBe('live')
})

test.each([
  ['unknown_view', 'Unknown view'],
  ['low_quality', 'Low quality'],
  ['analysis_unavailable', 'AI unavailable'],
  ['analysis_disabled', 'AI disabled'],
] as const)('shows the %s status', (status, label) => {
  push(frameMsg('f1'), analysisMsg('f1', { status, totalAvailable: null, zones: [] }))
  render(<CameraCard camera={camera} />)
  expect(screen.getByText(label)).toBeInTheDocument()
  expect(screen.getByTestId('free-chip')).toHaveTextContent('—')
})

test('unknown view offers to save the view', () => {
  push(frameMsg('f1'), analysisMsg('f1', { status: 'unknown_view', totalAvailable: null }))
  render(<CameraCard camera={camera} />)
  expect(screen.getByRole('button', { name: 'Save view' })).toBeInTheDocument()
})

test('offline and waiting states', () => {
  render(<CameraCard camera={camera} />)
  expect(screen.getByText('Waiting for image…')).toBeInTheDocument()
  push({ type: 'camera_status', cameraId: '47', online: false })
  expect(screen.getByText('Camera offline')).toBeInTheDocument()
  expect(screen.getByText('Offline')).toBeInTheDocument()
})

test('stale image is flagged', () => {
  vi.useFakeTimers()
  try {
    act(() => useFeedStore.getState().handle(frameMsg('f1'), Date.now() - 300_000))
    push(analysisMsg('f1'))
    render(<CameraCard camera={camera} />)
    expect(screen.getByText('Stale image')).toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

test('notification toggle and remove update the store', async () => {
  render(<CameraCard camera={camera} />)
  act(() => screen.getByRole('button', { name: 'Alert me when a space opens' }).click())
  expect(useCameraStore.getState().cameras[0].notify).toBe(true)
  act(() => screen.getByRole('button', { name: 'Remove Home street' }).click())
  expect(useCameraStore.getState().cameras).toEqual([])
})
