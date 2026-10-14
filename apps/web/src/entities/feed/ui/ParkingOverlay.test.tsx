import { render, waitFor } from '@testing-library/react'
import { analysisMsg } from '@/test/factories'
import { ParkingOverlay } from './ParkingOverlay'

test('draws red occupied boxes, green available areas and dashed other vehicles', () => {
  render(<ParkingOverlay analysis={analysisMsg('f1')} />)
  expect(document.querySelectorAll('[data-kind="occupied"]')).toHaveLength(2)
  expect(document.querySelectorAll('[data-kind="available"]')).toHaveLength(1)
  expect(document.querySelectorAll('[data-kind="other"]')).toHaveLength(1)
})

test('shapes are static: no per-shape transform animation', () => {
  render(<ParkingOverlay analysis={analysisMsg('f1')} />)
  for (const el of document.querySelectorAll('[data-kind]')) {
    expect((el as SVGElement).style.transform).toBe('')
  }
})

test('hides other vehicles on request and fades out without analysis', async () => {
  const { rerender } = render(<ParkingOverlay analysis={analysisMsg('f1')} showOthers={false} />)
  expect(document.querySelectorAll('[data-kind="other"]')).toHaveLength(0)
  rerender(<ParkingOverlay analysis={undefined} />)
  await waitFor(() => expect(document.querySelector('[data-testid="overlay"]')).toBeNull())
})
