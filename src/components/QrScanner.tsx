import { useEffect, useRef, useState } from "react"
import jsQR from "jsqr"
import {
  detectQrDecodeEngine,
  extractQrTokenFromScanText,
  stopMediaStream,
} from "../domain/qrScan.ts"
import { useMessages } from "../preferences/usePreferences.ts"

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>
}

type QrScannerProps = {
  active: boolean
  onDetected: (qrToken: string) => void
  onCancel: () => void
  onUnsupported?: () => void
}

/**
 * In-app camera QR scanner for SehatFlow slip URLs / opaque tokens.
 * Stops the MediaStream on success, cancel, or unmount. Does not log tokens.
 */
export function QrScanner({
  active,
  onDetected,
  onCancel,
  onUnsupported,
}: QrScannerProps) {
  const messages = useMessages()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const closedRef = useRef(false)
  const onDetectedRef = useRef(onDetected)
  const onUnsupportedRef = useRef(onUnsupported)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<
    "starting" | "scanning" | "denied" | "unsupported"
  >("starting")

  useEffect(() => {
    onDetectedRef.current = onDetected
    onUnsupportedRef.current = onUnsupported
  }, [onDetected, onUnsupported])

  useEffect(() => {
    if (!active) {
      return
    }
    closedRef.current = false
    let cancelled = false

    function cleanup() {
      closedRef.current = true
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      const video = videoRef.current
      if (video) {
        video.srcObject = null
      }
      stopMediaStream(streamRef.current)
      streamRef.current = null
    }

    async function scanLoop() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || cancelled || closedRef.current) {
        return
      }
      if (video.readyState < 2) {
        rafRef.current = window.requestAnimationFrame(() => {
          void scanLoop()
        })
        return
      }

      const engine = detectQrDecodeEngine()
      let payload: string | null = null

      if (engine === "barcodeDetector") {
        try {
          const Detector = (
            globalThis as {
              BarcodeDetector?: new (opts: {
                formats: string[]
              }) => BarcodeDetectorLike
            }
          ).BarcodeDetector
          if (Detector) {
            const detector = new Detector({ formats: ["qr_code"] })
            const codes = await detector.detect(video)
            payload = codes[0]?.rawValue ?? null
          }
        } catch {
          // fall through to jsQR
        }
      }

      if (!payload) {
        const width = video.videoWidth
        const height = video.videoHeight
        if (width > 0 && height > 0) {
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext("2d", { willReadFrequently: true })
          if (ctx) {
            ctx.drawImage(video, 0, 0, width, height)
            const image = ctx.getImageData(0, 0, width, height)
            const code = jsQR(image.data, width, height)
            payload = code?.data ?? null
          }
        }
      }

      if (payload && !cancelled && !closedRef.current) {
        const token = extractQrTokenFromScanText(payload)
        if (token) {
          cleanup()
          onDetectedRef.current(token)
          return
        }
        setError(messages.qrScanUnsupportedCode)
      }

      if (!cancelled && !closedRef.current) {
        rafRef.current = window.requestAnimationFrame(() => {
          void scanLoop()
        })
      }
    }

    async function start() {
      setError(null)
      setStatus("starting")

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported")
        onUnsupportedRef.current?.()
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
        if (cancelled || closedRef.current) {
          stopMediaStream(stream)
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) {
          stopMediaStream(stream)
          return
        }
        video.srcObject = stream
        await video.play()
        setStatus("scanning")
        void scanLoop()
      } catch {
        if (!cancelled) {
          setStatus("denied")
          setError(messages.qrCameraDenied)
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [active, messages.qrCameraDenied, messages.qrScanUnsupportedCode])

  if (!active) {
    return null
  }

  return (
    <section
      className="panel qr-scanner"
      aria-labelledby="qr-scanner-title"
      role="region"
    >
      <h2 id="qr-scanner-title">{messages.qrScannerTitle}</h2>
      <p>{messages.qrScannerHint}</p>
      <div className="qr-scanner-viewport">
        <video
          ref={videoRef}
          className="qr-scanner-video"
          playsInline
          muted
          autoPlay
          aria-label={messages.qrScannerVideoLabel}
        />
        <canvas ref={canvasRef} className="qr-scanner-canvas" hidden />
      </div>
      {status === "starting" ? (
        <p role="status">{messages.qrScannerStarting}</p>
      ) : null}
      {status === "scanning" ? (
        <p role="status">{messages.qrScannerScanning}</p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {status === "unsupported" || status === "denied" ? (
        <p>{messages.qrInvalidHint}</p>
      ) : null}
      <button type="button" className="button button-secondary" onClick={onCancel}>
        {messages.qrScannerCancel}
      </button>
    </section>
  )
}
