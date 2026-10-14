import { useCallback, useState } from 'react'
import type { AnalysisMessage } from './messages'
import { useCameraFeed } from './store'

/**
 * Keeps overlays tied to the frame actually on screen: `current` is the analysis of the
 * displayed frame (if it has arrived), `previous` the last one that matched, shown faded
 * while the next frame is being analysed.
 */
export function useDisplayedAnalysis(cameraId: string) {
  const feed = useCameraFeed(cameraId)
  const [displayedId, setDisplayedId] = useState<string | null>(null)
  const [lastMatched, setLastMatched] = useState<AnalysisMessage | undefined>(undefined)
  const analysis = feed?.analysis
  const current = analysis && analysis.frameId === displayedId ? analysis : undefined
  if (current && current !== lastMatched) setLastMatched(current)
  const onDisplayed = useCallback((id: string) => setDisplayedId(id), [])
  return { feed, current, previous: lastMatched, displayedId, onDisplayed }
}

export type DisplayedAnalysis = ReturnType<typeof useDisplayedAnalysis>
