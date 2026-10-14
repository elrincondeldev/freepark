import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFeedStore } from '@/entities/feed'
import { analysisMsg, frameMsg } from '@/test/factories'
import { mockApi } from '@/test/mockApi'
import { useToastStore } from '@/shared/ui'
import { ReanalyzeButton } from './ReanalyzeButton'

beforeEach(() => {
  vi.unstubAllGlobals()
  useFeedStore.setState({ cameras: {} })
  useToastStore.setState({ toasts: [] })
  act(() => {
    useFeedStore.getState().handle(frameMsg('f1'))
    useFeedStore.getState().handle(analysisMsg('f1'))
  })
})

test('requests a fresh analysis and shows progress until the result arrives', async () => {
  const calls = mockApi({ 'POST /api/cameras/47/reanalyze': { queued: true } })
  render(<ReanalyzeButton cameraId="47" />)
  await userEvent.click(screen.getByRole('button', { name: /Re-analyse/ }))
  expect(calls[0].url).toBe('/api/cameras/47/reanalyze?fresh=true')
  expect(screen.getByRole('button', { name: /Analysing/ })).toBeDisabled()
  act(() => useFeedStore.getState().handle(analysisMsg('f1', { analysedAt: 'later' })))
  expect(screen.getByRole('button', { name: /Re-analyse/ })).toBeEnabled()
})

test('explains when the camera is not ready', async () => {
  mockApi({
    'POST /api/cameras/47/reanalyze': () =>
      new Response(JSON.stringify({ detail: 'not watched' }), { status: 409 }),
  })
  render(<ReanalyzeButton cameraId="47" />)
  await userEvent.click(screen.getByRole('button', { name: /Re-analyse/ }))
  expect(useToastStore.getState().toasts[0].body).toMatch(/Wait for the camera image/)
  expect(screen.getByRole('button', { name: /Re-analyse/ })).toBeEnabled()
})
