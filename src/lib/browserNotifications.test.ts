import { describe, expect, it, vi } from "vitest"
import {
  getNotificationSupport,
  requestNotificationPermission,
  showBrowserNotification,
} from "./browserNotifications.ts"

describe("browser notifications", () => {
  it("reports unsupported browsers honestly", () => {
    expect(getNotificationSupport(undefined)).toEqual({
      supported: false,
      reason: "unsupported",
    })
  })

  it("does not show alerts when permission is denied", () => {
    const Ctor = vi.fn() as unknown as typeof Notification
    Object.defineProperty(Ctor, "permission", { value: "denied" })
    expect(
      showBrowserNotification({
        title: "t",
        body: "b",
        tag: "x",
        notificationCtor: Ctor,
      }),
    ).toEqual({ shown: false, reason: "denied" })
    expect(Ctor).not.toHaveBeenCalled()
  })

  it("requests permission only through the Notification API", async () => {
    const requestPermission = vi.fn(async () => "granted" as const)
    const Ctor = { permission: "default", requestPermission } as unknown as typeof Notification
    await expect(requestNotificationPermission(Ctor)).resolves.toBe("granted")
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })
})
