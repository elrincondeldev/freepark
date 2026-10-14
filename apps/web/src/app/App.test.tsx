import { render, screen } from '@testing-library/react'
import { useCameraStore } from '@/entities/camera'
import { App } from './App'

class NoopSocket {
  static OPEN = 1
  readyState = 0
  close() {}
  send() {}
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', NoopSocket)
  useCameraStore.setState({ cameras: [] })
})

test('shows the empty state on first visit', () => {
  render(<App />)
  expect(screen.getByText('Parking Vision')).toBeInTheDocument()
  expect(screen.getByText(/Find a free spot/)).toBeInTheDocument()
})

test('shows camera cards for watched cameras', () => {
  useCameraStore.setState({ cameras: [{ id: '47', label: 'Home street', notify: false }] })
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Home street' })).toBeInTheDocument()
})
