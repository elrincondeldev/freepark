import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

/** Number that slides in from below when it increases and from above when it decreases. */
export function AnimatedCount({ value, className = '' }: { value: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <span
      className={`relative inline-flex overflow-hidden tabular-nums ${className}`}
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout" initial={false} custom={value}>
        <motion.span
          key={value}
          initial={reduce ? false : { y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: '-100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
