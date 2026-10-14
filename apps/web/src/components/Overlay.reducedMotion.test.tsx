// Separate file: framer-motion reads prefers-reduced-motion once per module load.
import { render } from '@testing-library/react'
import { analysisMsg } from '../test/factories'

vi.stubGlobal(
  'matchMedia',
  vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })),
)

test('reduced motion renders overlays and counters without transform animations', async () => {
  const { Overlay } = await import('./Overlay')
  const { AnimatedCount } = await import('./AnimatedCount')
  render(
    <>
      <Overlay analysis={analysisMsg('f1')} />
      <AnimatedCount value={3} />
    </>,
  )
  const animated = document.querySelectorAll('[data-kind="occupied"], [data-kind="available"]')
  expect(animated.length).toBe(3)
  for (const el of animated) {
    expect((el as SVGElement).style.transform).not.toMatch(/scale/)
  }
})
