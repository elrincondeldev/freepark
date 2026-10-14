import { render } from '@testing-library/react'
import { analysisMsg } from '../test/factories'
import { Overlay } from './Overlay'

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })),
  )
}

afterEach(() => vi.unstubAllGlobals())

test('animates rectangles in with a scale transform by default', () => {
  mockReducedMotion(false)
  render(<Overlay analysis={analysisMsg('f1')} />)
  const rect = document.querySelector('[data-kind="occupied"]') as SVGElement
  expect(rect.style.transform).toMatch(/scale/)
})

test('hides other vehicles on request and renders nothing without analysis', () => {
  const { rerender } = render(<Overlay analysis={analysisMsg('f1')} showOthers={false} />)
  expect(document.querySelectorAll('[data-kind="other"]')).toHaveLength(0)
  rerender(<Overlay analysis={undefined} />)
  expect(document.querySelector('[data-testid="overlay"]')).toBeNull()
})
