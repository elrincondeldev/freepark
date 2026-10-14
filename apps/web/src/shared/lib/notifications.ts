/** Browser Notification API helpers; callers fall back to in-app UI when unavailable. */

export type NotificationPermissionState = NotificationPermission | 'unsupported'

export function notificationPermission(): NotificationPermissionState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** Ask only from a user gesture. */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/** Shows a native notification only when permitted and the page is in the background. */
export function showBackgroundNotification(
  title: string,
  body: string,
  onClick: () => void,
): boolean {
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
