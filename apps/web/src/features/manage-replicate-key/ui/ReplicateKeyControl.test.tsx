import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReplicateKeyStore } from '@/entities/replicate-key'
import { ReplicateKeyControl } from './ReplicateKeyControl'

beforeEach(() => useReplicateKeyStore.getState().setKey(''))

test('user can add, change and remove a key without displaying it', async () => {
  const user = userEvent.setup()
  render(<ReplicateKeyControl />)
  await user.click(screen.getByText('Add API key'))
  const input = screen.getByLabelText('Replicate API key')
  expect(input).toHaveAttribute('type', 'password')
  await user.type(input, 'key-a')
  await user.click(screen.getByRole('button', { name: 'Save key' }))
  expect(useReplicateKeyStore.getState().key).toBe('key-a')
  expect(screen.queryByText('key-a')).not.toBeInTheDocument()

  await user.click(screen.getByText('API key set'))
  await user.type(screen.getByLabelText('New Replicate API key'), 'key-b')
  await user.click(screen.getByRole('button', { name: 'Change key' }))
  expect(useReplicateKeyStore.getState().key).toBe('key-b')

  await user.click(screen.getByText('API key set'))
  await user.click(screen.getByRole('button', { name: 'Remove' }))
  expect(useReplicateKeyStore.getState().key).toBe('')
})
