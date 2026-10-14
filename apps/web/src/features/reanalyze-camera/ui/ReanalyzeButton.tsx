import { reanalyzeCamera, useCameraFeed, useFeedStore } from '@/entities/feed'
import { ApiError } from '@/shared/api'
import { Button, cn, RefreshIcon, toast } from '@/shared/ui'

/** Ask the AI to analyse the current image again (one prediction). */
export function ReanalyzeButton({ cameraId }: { cameraId: string }) {
  const feed = useCameraFeed(cameraId)
  const markReanalysing = useFeedStore((s) => s.markReanalysing)
  const cancelReanalysing = useFeedStore((s) => s.cancelReanalysing)
  const busy =
    !!feed?.reanalysing || (!!feed?.frame && feed.analysis?.frameId !== feed.frame.frameId)

  async function run() {
    markReanalysing(cameraId)
    try {
      await reanalyzeCamera(cameraId, true)
    } catch (err) {
      cancelReanalysing(cameraId)
      toast({
        title: 'Could not re-analyse',
        body:
          err instanceof ApiError && err.status === 409
            ? 'Wait for the camera image to load, then try again.'
            : 'The server did not respond. Try again in a moment.',
      })
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={run}
      disabled={busy || !feed?.frame}
      title="Run the AI again on the current image"
    >
      <RefreshIcon width={14} height={14} className={cn(busy && 'animate-spin')} />
      {busy ? 'Analysing…' : 'Re-analyse'}
    </Button>
  )
}
