import { render, screen } from '@testing-library/react'
import { EmptyState } from './EmptyState'

test('empty state invites adding a camera with the input focused', () => {
  render(<EmptyState />)
  expect(screen.getByText(/Find a free spot/)).toBeInTheDocument()
  expect(screen.getByLabelText('Camera link or number')).toHaveFocus()
})
