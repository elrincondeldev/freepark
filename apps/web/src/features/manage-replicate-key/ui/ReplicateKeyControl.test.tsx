import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReplicateKeyStore } from '@/entities/replicate-key'
import { ReplicateKeyControl } from './ReplicateKeyControl'

const firstToken = `r8_${'a'.repeat(37)}`
const secondToken = `r8_${'b'.repeat(37)}`

beforeEach(() => useReplicateKeyStore.getState().setKey(''))

test('opens on entry without a key, can be dismissed and reopened', async () => {
  const user = userEvent.setup()
  render(<ReplicateKeyControl />)

  expect(screen.getByRole('dialog', { name: 'Enable AI parking detection' })).toBeInTheDocument()
  expect(screen.getByLabelText('Replicate API token')).toHaveFocus()
  expect(screen.getByRole('link', { name: /Get a token from Replicate/ })).toHaveAttribute(
    'href',
    'https://replicate.com/account/api-tokens',
  )

  await user.click(screen.getByRole('button', { name: 'Continue without AI' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(useReplicateKeyStore.getState().key).toBe('')

  await user.click(screen.getByRole('button', { name: 'Connect AI' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

test('saves, replaces and removes a key without exposing it by default', async () => {
  const user = userEvent.setup()
  render(<ReplicateKeyControl />)

  const input = screen.getByLabelText('Replicate API token')
  expect(input).toHaveAttribute('type', 'password')
  expect(screen.queryByRole('button', { name: /Save token/ })).not.toBeInTheDocument()
  await user.type(input, 'r8_abc')
  expect(useReplicateKeyStore.getState().key).toBe('')
  await user.clear(input)
  await user.type(input, firstToken)
  await waitFor(() => expect(useReplicateKeyStore.getState().key).toBe(firstToken))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.queryByText(firstToken)).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'AI connected' }))
  const replacement = screen.getByLabelText('Replicate API token')
  expect(replacement).toHaveAttribute('type', 'password')
  expect(replacement).toHaveValue(firstToken)
  expect(replacement).toHaveFocus()
  await user.clear(replacement)
  await user.type(replacement, 'r8_')
  await user.click(screen.getByRole('button', { name: 'Show token' }))
  expect(replacement).toHaveAttribute('type', 'text')
  await user.type(replacement, secondToken.slice(3))
  await waitFor(() => expect(useReplicateKeyStore.getState().key).toBe(secondToken))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

  await user.click(screen.getByRole('button', { name: 'AI connected' }))
  await user.click(screen.getByRole('button', { name: 'Remove key' }))
  expect(useReplicateKeyStore.getState().key).toBe('')
  expect(screen.getByRole('button', { name: 'Connect AI' })).toBeInTheDocument()
})

test('a saved key does not open the dialog on entry', () => {
  useReplicateKeyStore.getState().setKey(firstToken)
  render(<ReplicateKeyControl />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'AI connected' })).toBeInTheDocument()
})
