import type { Transition } from 'framer-motion'

/**
 * Motion presets: short, ease-out, no bounce. Animation should explain a change
 * (something appeared, moved or updated), never decorate.
 */
export const EASE_OUT: [number, number, number, number] = [0.2, 0, 0, 1]

export const motionPresets = {
  fast: { duration: 0.15, ease: EASE_OUT } satisfies Transition,
  base: { duration: 0.2, ease: EASE_OUT } satisfies Transition,
  slow: { duration: 0.3, ease: EASE_OUT } satisfies Transition,
}

/** Plain fade, for things that appear/disappear in place. */
export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: motionPresets.base,
}

/** Fade with a small rise, for things that enter a list or the page. */
export const rise = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: motionPresets.base,
}
