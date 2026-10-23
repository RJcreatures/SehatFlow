import { resolvePublicAppOrigin } from "../domain/qrLookup.ts"

/** Deployed app origin for QR codes. Falls back to the current browser origin. */
export function getPublicAppOrigin(): string {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined
  const windowOrigin =
    typeof window !== "undefined" ? window.location.origin : null
  return resolvePublicAppOrigin({
    configured,
    windowOrigin,
  })
}
