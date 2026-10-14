import { useCallback, useEffect, useState } from 'react'
import { viewApi, type View } from '@/entities/view'
import { ApiError } from '@/shared/api'

/** Loads a camera's views and wraps mutations with busy/error state and a reload. */
export function useViews(cameraId: string) {
  const [views, setViews] = useState<View[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      setViews(await viewApi.list(cameraId))
    } catch {
      setError('Could not load views.')
    }
  }, [cameraId])

  useEffect(() => {
    reload()
  }, [reload])

  const run = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true)
      setError(null)
      try {
        const result = await action()
        await reload()
        return result
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong.')
        return undefined
      } finally {
        setBusy(false)
      }
    },
    [reload],
  )

  return { views, error, busy, run }
}
