import { subscribeMessage } from './messages'

test("subscription carries the user's key only when set", () => {
  expect(subscribeMessage(['47'], 'key-a')).toEqual({
    type: 'subscribe',
    cameras: ['47'],
    replicateApiKey: 'key-a',
  })
  expect(subscribeMessage(['47'], '')).toEqual({ type: 'subscribe', cameras: ['47'] })
})
