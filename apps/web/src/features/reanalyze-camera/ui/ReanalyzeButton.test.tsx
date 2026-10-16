import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFeedStore } from '@/entities/feed'
import { useToastStore } from '@/shared/ui'
import { analysisMsg, frameMsg } from '@/test/factories'
import { mockApi } from '@/test/mockApi'
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

const button = () => screen.getByRole('button', { name: /Re-analyse|Analysing/ })

test('queued re-analysis shows progress until the result arrives over the socket', async () => {
  const calls = mockApi({ 'POST /api/cameras/47/reanalyze': { queued: true } })
  render(<ReanalyzeButton cameraId="47" />)
  await userEvent.click(button())
  expect(calls[0].url).toBe('/api/cameras/47/reanalyze?fresh=true')
  expect(button()).toHaveTextContent('Analysing')
  expect(button()).toBeEnabled() // never locked: you can always ask again
  act(() => useFeedStore.getState().handle(analysisMsg('f1', { analysedAt: 'later' })))
  expect(button()).toHaveTextContent('Re-analyse')
})

test('immediate analysis from the API is shown right away', async () => {
  mockApi({
    'POST /api/cameras/47/reanalyze': {
      queued: false,
      analysis: analysisMsg('f1', { analysedAt: 'now', totalAvailable: 3 }),
    },
  })
  render(<ReanalyzeButton cameraId="47" />)
  await userEvent.click(button())
  await waitFor(() => expect(button()).toHaveTextContent('Re-analyse'))
  expect(useFeedStore.getState().cameras['47'].analysis?.totalAvailable).toBe(3)
})

test('works even before the first image has arrived', async () => {
  useFeedStore.setState({ cameras: {} })
  mockApi({ 'POST /api/cameras/47/reanalyze': { queued: false } })
  render(<ReanalyzeButton cameraId="47" />)
  expect(button()).toBeEnabled()
})

test.each([
  [404, { detail: 'Not Found' }, /out of date/],
  [502, { detail: 'camera 47 could not be reached: empty response' }, /did not send an image/],
  [500, { detail: 'boom' }, /not reachable/],
])('explains a %i error', async (status, body, message) => {
  mockApi({
    'POST /api/cameras/47/reanalyze': () => new Response(JSON.stringify(body), { status }),
  })
  render(<ReanalyzeButton cameraId="47" />)
  await userEvent.click(button())
  await waitFor(() => expect(useToastStore.getState().toasts[0]?.body).toMatch(message))
  expect(button()).toHaveTextContent('Re-analyse')
})

test('explains a network failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  render(<ReanalyzeButton cameraId="47" />)
  await userEvent.click(button())
  await waitFor(() => expect(useToastStore.getState().toasts[0]?.body).toMatch(/not reachable/))
})
