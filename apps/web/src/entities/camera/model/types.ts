export interface WatchedCamera {
  id: string
  label: string
  /** Direct public JPEG URL for cameras outside the built-in Vigo source. */
  sourceUrl?: string
  /** availability alerts enabled for this camera */
  notify: boolean
}

export interface Settings {
  /** play a chime with availability alerts */
  sound: boolean
}
