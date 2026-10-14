/** Browser Notification API helpers; everything degrades to in-app toasts. */

export type Permission = NotificationPermission | 'unsupported'

export function notificationPermission(): Permission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** Ask only from a user gesture (e.g. turning a camera's alerts on). */
export async function requestNotificationPermission(): Promise<Permission> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

export function showBrowserNotification(title: string, body: string, onClick: () => void): boolean {
  if (notificationPermission() !== 'granted' || document.visibilityState !== 'hidden') return false
  try {
    const n = new Notification(title, { body, icon: '/favicon.svg', tag: title })
    n.onclick = () => {
      window.focus()
      onClick()
      n.close()
    }
    return true
  } catch {
    return false
  }
}

let audio: AudioContext | null = null

/** Short two-note chime synthesised with Web Audio (no asset needed). */
export function playChime(): void {
  try {
    audio ??= new AudioContext()
    const t = audio.currentTime
    ;[880, 1318.5].forEach((freq, i) => {
      const osc = audio!.createOscillator()
      const gain = audio!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t + i * 0.12)
      gain.gain.exponentialRampToValueAtTime(0.18, t + i * 0.12 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.35)
      osc.connect(gain).connect(audio!.destination)
      osc.start(t + i * 0.12)
      osc.stop(t + i * 0.12 + 0.4)
    })
  } catch {
    /* audio unavailable */
  }
}
