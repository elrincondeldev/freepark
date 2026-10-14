import { useCallback, useState } from 'react'
import type { AnalysisMessage } from '../lib/types'
import { useLiveStore } from '../store/live'

/** Frame shown + overlay for it (or the previous one, faded, while analysing). */
export function useDisplayedAnalysis(cameraId: string) {
  const live = useLiveStore((s) => s.cameras[cameraId])
  const [displayedId, setDisplayedId] = useState<string | null>(null)
  const [lastMatched, setLastMatched] = useState<AnalysisMessage | undefined>(undefined)
  const analysis = live?.analysis
  const current = analysis && analysis.frameId === displayedId ? analysis : undefined
  if (current && current !== lastMatched) setLastMatched(current)
  const onDisplayed = useCallback((id: string) => setDisplayedId(id), [])
  return { live, current, previous: lastMatched, displayedId, onDisplayed }
}
