export type NotificationSupport =
  | { supported: false; reason: "unsupported" }
  | { supported: true; permission: NotificationPermission }

export function getNotificationSupport(
  notificationCtor: typeof Notification | undefined = typeof Notification ===
  "undefined"
    ? undefined
    : Notification,
): NotificationSupport {
  if (!notificationCtor) {
    return { supported: false, reason: "unsupported" }
  }
  return {
    supported: true,
    permission: notificationCtor.permission,
  }
}

/**
 * Request permission only after an explicit user gesture.
 * Never throws; returns the resulting permission.
 */
export async function requestNotificationPermission(
  notificationCtor: typeof Notification | undefined = typeof Notification ===
  "undefined"
    ? undefined
    : Notification,
): Promise<NotificationPermission | "unsupported"> {
  if (!notificationCtor) {
    return "unsupported"
  }
  if (notificationCtor.permission === "granted") {
    return "granted"
  }
  if (notificationCtor.permission === "denied") {
    return "denied"
  }
  try {
    return await notificationCtor.requestPermission()
  } catch {
    return "denied"
  }
}

/**
 * Show an in-session browser notification when permission is granted.
 * Does not claim background/push delivery. Never includes access codes.
 */
export function showBrowserNotification(input: {
  title: string
  body: string
  tag: string
  notificationCtor?: typeof Notification
}): { shown: boolean; reason?: "unsupported" | "denied" | "error" } {
  const Ctor =
    input.notificationCtor ??
    (typeof Notification === "undefined" ? undefined : Notification)
  if (!Ctor) {
    return { shown: false, reason: "unsupported" }
  }
  if (Ctor.permission !== "granted") {
    return { shown: false, reason: "denied" }
  }
  try {
    // tag prevents OS-level duplicates for the same dedupe key while the page is open.
    new Ctor(input.title, {
      body: input.body,
      tag: input.tag,
    })
    return { shown: true }
  } catch {
    return { shown: false, reason: "error" }
  }
}
