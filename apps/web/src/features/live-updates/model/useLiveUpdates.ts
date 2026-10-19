import { useEffect } from 'react'
import { useCameraStore } from '@/entities/camera'
import { subscribeMessage, useFeedStore, type ServerMessage } from '@/entities/feed'
import { useReplicateKeyStore } from '@/entities/replicate-key'
import { browserClientId, restoreBrowserState, saveBrowserStateSoon } from '@/shared/api'
import { defaultWsUrl, WsClient } from '@/shared/lib'

/**
 * One socket for the app, subscribed to exactly the watched cameras; feeds every server
 * message into the feed store. Mount once at the app root.
 */
export function useLiveUpdates(url?: string) {
  const replicateApiKey = useReplicateKeyStore((s) => s.key)
  useEffect(() => {
    const feed = useFeedStore.getState()
    feed.clearAnalyses()
    const client = new WsClient<ServerMessage>({
      url: url ?? defaultWsUrl(),
      beforeSubscribe: restoreBrowserState,
      subscribeMessage: (cameras) => subscribeMessage(cameras, replicateApiKey, browserClientId()),
      onMessage: (msg) => {
        useFeedStore.getState().handle(msg)
        if (msg.type === 'analysis' && msg.status === 'ok') saveBrowserStateSoon()
      },
      onState: (state) => feed.setConnection(state),
    })
    const ids = () => useCameraStore.getState().cameras.map((c) => c.id)
    client.setTopics(ids())
    client.connect()
    const unsubscribe = useCameraStore.subscribe((state, prev) => {
      if (state.cameras === prev.cameras) return
      client.setTopics(ids())
      const kept = new Set(state.cameras.map((c) => c.id))
      prev.cameras.filter((c) => !kept.has(c.id)).forEach((c) => feed.forget(c.id))
    })
    return () => {
      unsubscribe()
      client.close()
    }
  }, [url, replicateApiKey])
}
