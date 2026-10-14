import { useEffect } from 'react'
import { defaultWsUrl, WsClient } from '../lib/ws'
import { useCameraStore } from '../store/cameras'
import { useLiveStore } from '../store/live'

/** One socket for the app, subscribed to exactly the cameras in the watched list. */
export function useLiveConnection(url: string = defaultWsUrl()) {
  useEffect(() => {
    const live = useLiveStore.getState()
    const client = new WsClient({
      url,
      onMessage: (msg) => useLiveStore.getState().handle(msg),
      onState: (state) => live.setConnection(state),
    })
    const ids = () => useCameraStore.getState().cameras.map((c) => c.id)
    client.setCameras(ids())
    client.connect()
    const unsubscribe = useCameraStore.subscribe((state, prev) => {
      if (state.cameras === prev.cameras) return
      client.setCameras(ids())
      const kept = new Set(state.cameras.map((c) => c.id))
      prev.cameras.filter((c) => !kept.has(c.id)).forEach((c) => live.forget(c.id))
    })
    return () => {
      unsubscribe()
      client.close()
    }
  }, [url])
}
