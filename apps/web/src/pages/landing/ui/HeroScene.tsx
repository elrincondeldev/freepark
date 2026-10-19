import { AnimatePresence, animate, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { AnimatedCount, BellIcon, EASE_OUT, cn } from '@/shared/ui'
import { StreetScene, type Phase } from './StreetScene'

/**
 * A street camera rendered like a camera card from the app. It loops through the product's
 * core moment: a parked car pulls out, its curb space turns green, an alert arrives.
 */

const PHASES: [Phase, number][] = [
  ['occupied', 2800],
  ['leaving', 2600],
  ['free', 4600],
]

function usePhase(): { phase: Phase; progress: number } {
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const phase = reduced ? 'free' : PHASES[index][0]

  useEffect(() => {
    if (reduced) return
    const timer = window.setTimeout(
      () => setIndex((i) => (i + 1) % PHASES.length),
      PHASES[index][1],
    )
    return () => window.clearTimeout(timer)
  }, [index, reduced])

  useEffect(() => {
    if (phase !== 'leaving') {
      setProgress(phase === 'free' ? 1 : 0)
      return
    }
    const controls = animate(0, 1, {
      duration: 2.4,
      ease: [0.45, 0, 0.35, 1],
      onUpdate: setProgress,
    })
    return () => controls.stop()
  }, [phase])

  return { phase, progress }
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()} ${pad(
    now.getHours(),
  )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

export function HeroScene() {
  const { phase, progress } = usePhase()
  const clock = useClock()
  const free = phase === 'free'

  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-10 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--free)_26%,transparent),transparent)] blur-2xl"
      />
      <motion.figure
        initial={{ opacity: 0, y: 28, rotateX: 10 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 1, ease: EASE_OUT, delay: 0.2 }}
        style={{ transformPerspective: 1200 }}
        className="overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl shadow-black/25"
        aria-label="Example: a street camera where a parked car leaves and the free space is marked in green"
      >
        <div className="relative aspect-video overflow-hidden bg-[#141b26]">
          <StreetScene phase={phase} progress={progress} />
          <span className="absolute left-2.5 top-2.5 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-white/85 sm:text-[11px]">
            TV24 POLICARPO SANZ {clock}
          </span>
          <div
            className={cn(
              'absolute right-2.5 top-2.5 flex items-baseline gap-1 rounded-full px-2.5 py-1 text-sm font-semibold text-white shadow-sm backdrop-blur-md transition-colors duration-500',
              free ? 'bg-free' : 'bg-black/55',
            )}
          >
            <AnimatedCount value={free ? 1 : 0} />
            <span className="text-xs font-medium opacity-90">free</span>
          </div>
        </div>
        <figcaption className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">Policarpo Sanz</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-free/12 px-2 py-0.5 text-[11px] font-medium text-free">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> Live
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">Vigo · updated just now</p>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-free/15 text-free">
            <BellIcon width={15} height={15} />
          </span>
        </figcaption>
      </motion.figure>

      <AnimatePresence>
        {free && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.4 }}
            className="absolute -bottom-16 left-3 right-3 flex items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-xl backdrop-blur-md sm:-bottom-7 sm:-left-8 sm:right-auto sm:w-80"
            role="presentation"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-free/15 text-free">
              <BellIcon />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">A space just opened</span>
              <span className="block truncate text-xs text-muted">Policarpo Sanz · 1 free</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
