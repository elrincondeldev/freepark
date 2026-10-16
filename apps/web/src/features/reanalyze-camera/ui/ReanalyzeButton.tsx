import { useState } from 'react'
import { reanalyzeCamera, useCameraFeed, useFeedStore } from '@/entities/feed'
import { ApiError } from '@/shared/api'
import { Button, cn, RefreshIcon, toast } from '@/shared/ui'

function explain(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return 'The API is out of date. Restart or rebuild it, then try again.'
    if (err.status === 502 && /could not be reached/.test(err.message))
      return 'The camera did not send an image. Try again in a moment.'
    if (err.status >= 500) return 'The API is not reachable. Check that it is running.'
    return err.message
  }
  return 'The API is not reachable. Check that it is running.'
}

/**
 * Ask the AI to analyse the current image again (one prediction). Always available: it is
 * only disabled while its own request is being sent.
 */
export function ReanalyzeButton({ cameraId }: { cameraId: string }) {
  const feed = useCameraFeed(cameraId)
  const markReanalysing = useFeedStore((s) => s.markReanalysing)
  const cancelReanalysing = useFeedStore((s) => s.cancelReanalysing)
  const [sending, setSending] = useState(false)
  const busy = sending || !!feed?.reanalysing

  async function run() {
    setSending(true)
    markReanalysing(cameraId)
    try {
      const result = await reanalyzeCamera(cameraId, true)
      // Analysed immediately (camera not being monitored): show it without waiting for the socket.
      if (result.analysis) useFeedStore.getState().handle(result.analysis)
    } catch (err) {
      cancelReanalysing(cameraId)
      toast({ title: 'Could not re-analyse', body: explain(err) })
    } finally {
      setSending(false)
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={run}
      disabled={sending}
      title="Run the AI again on the current image"
    >
      <RefreshIcon width={14} height={14} className={cn(busy && 'animate-spin')} />
      {busy ? 'Analysing…' : 'Re-analyse'}
    </Button>
  )
}
