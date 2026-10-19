import { render, screen } from '@testing-library/react'
import { useCameraStore } from '@/entities/camera'
import { useReplicateKeyStore } from '@/entities/replicate-key'
import { App } from './App'

class NoopSocket {
  static OPEN = 1
  readyState = 0
  close() {}
  send() {}
}

beforeEach(() => {
  window.history.pushState({}, '', '/app')
  vi.stubGlobal('WebSocket', NoopSocket)
  useCameraStore.setState({ cameras: [] })
  useReplicateKeyStore.getState().setKey('')
})

test('shows the empty state on first visit', () => {
  render(<App />)
  expect(screen.getByText('Parking Vision')).toBeInTheDocument()
  expect(screen.getByText(/Find a free spot/)).toBeInTheDocument()
  expect(screen.getByLabelText('Replicate API token')).toHaveFocus()
})

test('shows camera cards for watched cameras', () => {
  useCameraStore.setState({ cameras: [{ id: '47', label: 'Home street', notify: false }] })
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Home street' })).toBeInTheDocument()
})

test('the root path shows the landing page without starting the live connection', () => {
  window.history.pushState({}, '', '/')
  const socket = vi.fn()
  vi.stubGlobal('WebSocket', socket)
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  render(<App />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Find a free spot/)
  expect(screen.queryByLabelText('Replicate API token')).toBeNull()
  expect(socket).not.toHaveBeenCalled()
})
