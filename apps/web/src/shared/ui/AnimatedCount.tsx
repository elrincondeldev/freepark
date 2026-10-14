import { AnimatePresence, motion } from 'framer-motion'
import { motionPresets } from './motion'

/** Number that eases to its new value with a short vertical slide. */
export function AnimatedCount({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span
      className={`relative inline-flex overflow-hidden tabular-nums ${className}`}
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: '40%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-40%', opacity: 0 }}
          transition={motionPresets.base}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
