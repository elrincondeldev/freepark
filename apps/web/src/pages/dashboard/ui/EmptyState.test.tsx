import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CameraFinderDialog, useCameraFinder } from '@/features/add-camera'
import { mockApi } from '@/test/mockApi'
import { EmptyState } from './EmptyState'

beforeEach(() => {
  useCameraFinder.setState({ open: false, query: '', favorites: [], position: null })
})

test('empty state leads with finding cameras and keeps pasting a link available', () => {
  render(<EmptyState />)
  expect(screen.getByText(/Find a free spot/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Find cameras near me' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Search a place' })).toBeInTheDocument()
  expect(screen.queryByText('Your searches')).toBeNull()
  expect(screen.getByLabelText('Camera link or number')).toBeInTheDocument()
})

test('a saved search opens the finder with that search', async () => {
  mockApi({ 'GET /api/catalog/cities': [] })
  useCameraFinder.setState({ favorites: ['Gran Vía'] })
  render(
    <>
      <EmptyState />
      <CameraFinderDialog />
    </>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Gran Vía' }))
  const dialog = await screen.findByRole('dialog', { name: 'Add a camera' })
  expect(within(dialog).getByRole('searchbox')).toHaveValue('Gran Vía')
})
