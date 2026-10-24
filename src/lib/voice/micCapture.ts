import {
  floatTo16kPcm,
  int16ToBase64,
  TARGET_PCM_RATE,
} from "../../domain/voice/pcmResample.ts"

export type MicCapture = {
  start: () => Promise<void>
  stop: () => void
  /** Hardware-mute tracks without tearing down the AudioContext. */
  setEnabled: (enabled: boolean) => void
  readonly active: boolean
  readonly enabled: boolean
}

/**
 * Streams microphone audio as base64 linear16 @ 16 kHz via AudioWorklet.
 * Permission is requested only when start() is called.
 */
export function createMicCapture(
  onPcmBase64: (pcmBase64: string) => void,
): MicCapture {
  let stream: MediaStream | null = null
  let context: AudioContext | null = null
  let worklet: AudioWorkletNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let active = false
  let enabled = true
  let pending = new Int16Array(0)

  function flushPending(force = false) {
    // ~100ms at 16kHz mono 16-bit = 3200 bytes = 1600 samples
    const frame = 1600
    while (pending.length >= frame || (force && pending.length > 0)) {
      const take = Math.min(frame, pending.length)
      const slice = pending.subarray(0, take)
      pending = pending.subarray(take)
      onPcmBase64(int16ToBase64(slice))
    }
  }

  return {
    get active() {
      return active
    },
    get enabled() {
      return enabled
    },
    async start() {
      if (active) {
        return
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      context = new AudioContext()
      await context.audioWorklet.addModule("/audio/pcm-worklet.js")
      source = context.createMediaStreamSource(stream)
      worklet = new AudioWorkletNode(context, "pcm-capture-processor")
      worklet.port.onmessage = (event) => {
        if (!active || !enabled || event.data?.type !== "samples") {
          return
        }
        const samples = event.data.samples as Float32Array
        const pcm = floatTo16kPcm(
          samples,
          context?.sampleRate ?? 48000,
          TARGET_PCM_RATE,
        )
        const merged = new Int16Array(pending.length + pcm.length)
        merged.set(pending)
        merged.set(pcm, pending.length)
        pending = merged
        flushPending(false)
      }
      source.connect(worklet)
      // Keep the graph alive without monitoring speakers.
      const silent = context.createGain()
      silent.gain.value = 0
      worklet.connect(silent)
      silent.connect(context.destination)
      active = true
      enabled = true
    },
    setEnabled(next: boolean) {
      enabled = next
      stream?.getAudioTracks().forEach((track) => {
        track.enabled = next
      })
      if (!next) {
        pending = new Int16Array(0)
      }
    },
    stop() {
      active = false
      enabled = false
      flushPending(true)
      pending = new Int16Array(0)
      try {
        worklet?.disconnect()
      } catch {
        /* ignore */
      }
      try {
        source?.disconnect()
      } catch {
        /* ignore */
      }
      stream?.getTracks().forEach((track) => track.stop())
      void context?.close()
      worklet = null
      source = null
      stream = null
      context = null
    },
  }
}
