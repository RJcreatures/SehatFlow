import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import { buildQrScanUrl } from "../domain/qrLookup.ts"
import { getPublicAppOrigin } from "../lib/publicAppUrl.ts"
import { useMessages } from "../preferences/usePreferences.ts"

type Props = {
  qrToken: string
  tokenCode: string
}

type QrApi = {
  toDataURL: (
    text: string,
    options?: Record<string, unknown>,
  ) => Promise<string>
}

function resolveQrApi(module: unknown): QrApi | null {
  if (!module || typeof module !== "object") {
    return null
  }
  const record = module as { toDataURL?: unknown; default?: unknown }
  if (typeof record.toDataURL === "function") {
    return record as QrApi
  }
  if (record.default && typeof record.default === "object") {
    const nested = record.default as { toDataURL?: unknown }
    if (typeof nested.toDataURL === "function") {
      return nested as QrApi
    }
  }
  return null
}

function buildScanUrlSafely(qrToken: string): string | null {
  try {
    return buildQrScanUrl(getPublicAppOrigin(), qrToken)
  } catch {
    return null
  }
}

export function SlipQrCard({ qrToken, tokenCode }: Props) {
  const messages = useMessages()
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  const scanUrl = useMemo(() => buildScanUrlSafely(qrToken), [qrToken])

  useEffect(() => {
    let cancelled = false

    async function generate() {
      if (!scanUrl) {
        if (!cancelled) {
          setDataUrl(null)
          setError(true)
        }
        return
      }

      const api = resolveQrApi(QRCode)
      if (!api) {
        if (!cancelled) {
          setDataUrl(null)
          setError(true)
        }
        return
      }

      try {
        const url = await api.toDataURL(scanUrl, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 280,
          color: {
            dark: "#14221c",
            light: "#ffffff",
          },
        })
        if (!cancelled) {
          setError(false)
          setDataUrl(url)
        }
      } catch {
        if (!cancelled) {
          setDataUrl(null)
          setError(true)
        }
      }
    }

    void generate()
    return () => {
      cancelled = true
    }
  }, [scanUrl, retryKey])

  const imageAlt = (messages.qrImageAlt || "QR code for token {token}").replace(
    "{token}",
    tokenCode,
  )

  return (
    <figure className="slip-qr-card" aria-labelledby="slip-qr-title">
      <figcaption id="slip-qr-title" className="visually-hidden">
        {messages.qrScanTitle}
      </figcaption>
      <div className="slip-qr-header">
        <span className="slip-qr-badge" aria-hidden="true">
          QR
        </span>
        <div>
          <p className="slip-qr-title">{messages.qrScanTitle}</p>
          <p className="slip-qr-hint">{messages.qrScanHint}</p>
        </div>
      </div>
      <div className="slip-qr-frame">
        {dataUrl ? (
          <img
            className="slip-qr-image"
            src={dataUrl}
            width={280}
            height={280}
            alt={imageAlt}
          />
        ) : error ? (
          <div className="slip-qr-fallback" role="alert">
            <p>{messages.qrGenerateError}</p>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setRetryKey((value) => value + 1)}
            >
              {messages.qrRetry}
            </button>
          </div>
        ) : (
          <p className="slip-qr-loading" role="status">
            {messages.qrLoading}
          </p>
        )}
      </div>
      <p className="slip-qr-footnote">{messages.qrNoPersonalData}</p>
    </figure>
  )
}
