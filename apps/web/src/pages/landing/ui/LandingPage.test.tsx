import { render, screen } from '@testing-library/react'
import { useCameraStore } from '@/entities/camera'
import { resetGitHubStars } from '../api/github'
import { LandingPage } from './LandingPage'

beforeEach(() => {
  useCameraStore.setState({ cameras: [] })
  sessionStorage.clear()
  resetGitHubStars()
})

test('leads to the app and to the GitHub repository with its star count', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ stargazers_count: 1234 }), { status: 200 })),
  )
  render(<LandingPage />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Find a free spot before you get there.',
  )
  for (const link of screen.getAllByRole('link', { name: /Open the app/ })) {
    expect(link).toHaveAttribute('href', '/app')
  }
  const stars = await screen.findAllByRole('link', { name: /Star on GitHub \(1234 stars\)/ })
  expect(stars[0]).toHaveAttribute('href', 'https://github.com/elrincondeldev/freepark')
  expect(screen.getAllByText('1.2k').length).toBeGreaterThan(0)
})

test('the star button still works when GitHub cannot be reached', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  render(<LandingPage />)
  const links = screen.getAllByRole('link', { name: 'Star on GitHub' })
  expect(links[0]).toHaveAttribute('href', 'https://github.com/elrincondeldev/freepark')
})

test('returning users are invited back to their cameras', () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  useCameraStore.setState({ cameras: [{ id: '47', label: 'Home', notify: false }] })
  render(<LandingPage />)
  expect(screen.getAllByRole('link', { name: /Open your cameras/ })[0]).toHaveAttribute(
    'href',
    '/app',
  )
})
