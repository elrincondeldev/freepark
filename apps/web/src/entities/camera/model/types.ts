export interface WatchedCamera {
  id: string
  label: string
  /** availability alerts enabled for this camera */
  notify: boolean
}

export interface Settings {
  /** play a chime with availability alerts */
  sound: boolean
}
