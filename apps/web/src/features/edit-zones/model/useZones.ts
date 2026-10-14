import { useCallback, useEffect, useState } from 'react'
import { zoneApi, type Zone, type ZoneInput } from '@/entities/zone'
import { ApiError } from '@/shared/api'

/** A view's zones with save/remove operations; errors are returned as messages. */
export function useZones(viewId: number) {
  const [zones, setZones] = useState<Zone[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    try {
      setZones(await zoneApi.list(viewId))
      setLoadError(null)
      setLoaded(true)
    } catch {
      setLoadError('Could not load zones.')
    }
  }, [viewId])

  useEffect(() => {
    reload()
  }, [reload])

  const save = useCallback(
    async (id: number | 'new', draft: ZoneInput): Promise<Zone | string> => {
      try {
        const saved =
          id === 'new' ? await zoneApi.create(viewId, draft) : await zoneApi.update(id, draft)
        await reload()
        return saved
      } catch (err) {
        return err instanceof ApiError ? err.message : 'Could not save the zone.'
      }
    },
    [reload, viewId],
  )

  const remove = useCallback(
    async (id: number): Promise<string | null> => {
      try {
        await zoneApi.remove(id)
        await reload()
        return null
      } catch {
        return 'Could not delete the zone.'
      }
    },
    [reload],
  )

  return { zones, loaded, loadError, save, remove }
}
