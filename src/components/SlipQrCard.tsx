import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { buildQrScanUrl } from "../domain/qrLookup.ts"
import { getPublicAppOrigin } from "../lib/publicAppUrl.ts"
import { useMessages } from "../preferences/usePreferences.ts"

type Props = {
  qrToken: string
  tokenCode: string
}

export function SlipQrCard({ qrToken, tokenCode }: Props) {
  const messages = useMessages()
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  const scanUrl = buildQrScanUrl(getPublicAppOrigin(), qrToken)

  useEffect(() => {
    let cancelled = false
    void QRCode.toDataURL(scanUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 280,
      color: {
        dark: "#14221c",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (!cancelled) {
          setError(false)
          setDataUrl(url)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl(null)
          setError(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [scanUrl, retryKey])

  return (
    <figure className="slip-qr-card" aria-labelledby="slip-qr-title">
      <div className="slip-qr-header">
        <span className="slip-qr-badge" aria-hidden="true">
          QR
        </span>
        <div>
          <figcaption id="slip-qr-title" className="slip-qr-title">
            {messages.qrScanTitle}
          </figcaption>
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
            alt={messages.qrImageAlt.replace("{token}", tokenCode)}
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
