import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { FrameMessage } from '../model/messages'

/**
 * Shows the latest frame, preloading each new one before crossfading to it so the swap never
 * flashes. Reports which frame is actually on screen, so overlays can be matched to it.
 */
export function FeedImage({
  frame,
  alt,
  onDisplayed,
}: {
  frame: FrameMessage | undefined
  alt: string
  onDisplayed: (frameId: string) => void
}) {
  const [shown, setShown] = useState<FrameMessage | undefined>(undefined)

  useEffect(() => {
    if (!frame || frame.frameId === shown?.frameId) return
    let cancelled = false
    const img = new Image()
    img.src = frame.url
    const done = () => {
      if (cancelled) return
      setShown(frame)
      onDisplayed(frame.frameId)
    }
    if (typeof img.decode === 'function') img.decode().then(done, done)
    else done()
    return () => {
      cancelled = true
    }
  }, [frame, shown?.frameId, onDisplayed])

  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.img
          key={shown.frameId}
          src={shown.url}
          alt={alt}
          draggable={false}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="absolute inset-0 h-full w-full object-cover"
          data-frame={shown.frameId}
        />
      )}
    </AnimatePresence>
  )
}
