/**
 * Progressive enhancement helpers for browser geolocation and device orientation.
 * Never invents an indoor map position from GPS for the sample hospital.
 */

export type GeoSupport =
  | { supported: false; reason: "unsupported" }
  | { supported: true }

export type GeoResult =
  | {
      ok: true
      latitude: number
      longitude: number
      accuracyMeters: number | null
    }
  | {
      ok: false
      reason: "denied" | "unavailable" | "timeout" | "unsupported" | "inaccurate"
    }

export type CompassSupport =
  | { supported: false; reason: "unsupported" }
  | { supported: true; needsPermission: boolean }

export type CompassHeadingResult =
  | { ok: true; headingDegrees: number }
  | {
      ok: false
      reason: "denied" | "unavailable" | "unsupported" | "unreliable"
    }

/** Sample hospital has no configured geodetic → floor-plan mapping. */
export const INDOOR_GEO_MAPPING_CONFIGURED = false

export function getGeolocationSupport(
  geo: Geolocation | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.geolocation,
): GeoSupport {
  if (!geo || typeof geo.getCurrentPosition !== "function") {
    return { supported: false, reason: "unsupported" }
  }
  return { supported: true }
}

export function requestBrowserLocation(input?: {
  geo?: Geolocation
  timeoutMs?: number
  maximumAgeMs?: number
  /** Reject fixes worse than this accuracy (metres). */
  maxAccuracyMeters?: number
}): Promise<GeoResult> {
  const geo =
    input?.geo ??
    (typeof navigator === "undefined" ? undefined : navigator.geolocation)
  if (!geo) {
    return Promise.resolve({ ok: false, reason: "unsupported" })
  }

  const timeoutMs = input?.timeoutMs ?? 8_000
  const maximumAgeMs = input?.maximumAgeMs ?? 60_000
  const maxAccuracy = input?.maxAccuracyMeters ?? 75

  return new Promise((resolve) => {
    try {
      geo.getCurrentPosition(
        (position) => {
          const accuracy =
            typeof position.coords.accuracy === "number"
              ? position.coords.accuracy
              : null
          if (accuracy !== null && accuracy > maxAccuracy) {
            resolve({ ok: false, reason: "inaccurate" })
            return
          }
          resolve({
            ok: true,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: accuracy,
          })
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            resolve({ ok: false, reason: "denied" })
            return
          }
          if (error.code === error.TIMEOUT) {
            resolve({ ok: false, reason: "timeout" })
            return
          }
          resolve({ ok: false, reason: "unavailable" })
        },
        {
          enableHighAccuracy: false,
          timeout: timeoutMs,
          maximumAge: maximumAgeMs,
        },
      )
    } catch {
      resolve({ ok: false, reason: "unavailable" })
    }
  })
}

/**
 * Maps a geographic fix onto an indoor node only when a real mapping exists.
 * For this sample hospital the mapping is not configured — always returns null.
 */
export function mapGeoToIndoorNode(_fix: {
  latitude: number
  longitude: number
  accuracyMeters: number | null
}): string | null {
  if (!INDOOR_GEO_MAPPING_CONFIGURED) {
    return null
  }
  return null
}

export function getCompassSupport(
  win: Window & typeof globalThis = typeof window === "undefined"
    ? (undefined as unknown as Window & typeof globalThis)
    : window,
): CompassSupport {
  if (!win || typeof win.DeviceOrientationEvent === "undefined") {
    return { supported: false, reason: "unsupported" }
  }
  const needsPermission =
    typeof (
      win.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<PermissionState>
      }
    ).requestPermission === "function"
  return { supported: true, needsPermission }
}

export async function requestCompassPermission(
  win: Window & typeof globalThis = typeof window === "undefined"
    ? (undefined as unknown as Window & typeof globalThis)
    : window,
): Promise<"granted" | "denied" | "unsupported"> {
  const support = getCompassSupport(win)
  if (!support.supported) {
    return "unsupported"
  }
  if (!support.needsPermission) {
    return "granted"
  }
  try {
    const request = (
      win.DeviceOrientationEvent as unknown as {
        requestPermission: () => Promise<PermissionState>
      }
    ).requestPermission
    const state = await request()
    return state === "granted" ? "granted" : "denied"
  } catch {
    return "denied"
  }
}

/**
 * Normalize a DeviceOrientationEvent into a compass heading (0 = north)
 * when absolute / webkitCompassHeading data is available.
 */
export function headingFromOrientationEvent(
  event: DeviceOrientationEvent & {
    webkitCompassHeading?: number
    absolute?: boolean
  },
): CompassHeadingResult {
  const webkit = event.webkitCompassHeading
  if (typeof webkit === "number" && Number.isFinite(webkit)) {
    return { ok: true, headingDegrees: ((webkit % 360) + 360) % 360 }
  }
  if (event.absolute === true && typeof event.alpha === "number") {
    // alpha is degrees from north when absolute; invert for compass heading.
    const heading = (360 - event.alpha) % 360
    return { ok: true, headingDegrees: ((heading % 360) + 360) % 360 }
  }
  if (typeof event.alpha === "number" && Number.isFinite(event.alpha)) {
    return { ok: false, reason: "unreliable" }
  }
  return { ok: false, reason: "unavailable" }
}

/** Sample map north is “up” (−y) in SVG space; rotate only when mapping is known. */
export const MAP_NORTH_DEGREES = 0
export const MAP_NORTH_ALIGNED = true
