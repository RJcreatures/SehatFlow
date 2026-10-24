/**
 * Sequential Web Audio playback for streamed TTS.
 *
 * Prefer linear16 PCM chunks (reliable). MP3 fragments are buffered and only
 * played once markComplete() runs — decodeAudioData cannot decode partial MP3.
 */

export type PlaybackDebugEvent =
  | { type: "enqueue"; bytes: number; kind: "pcm" | "mp3" | "unknown" }
  | { type: "pcm_play"; samples: number; sampleRate: number }
  | { type: "mp3_play"; bytes: number }
  | { type: "mp3_decode_fail"; bytes: number; error: string }
  | { type: "idle" }
  | { type: "stop" }

export type PlaybackQueue = {
  enqueue: (
    chunk: ArrayBuffer,
    mime: string,
    meta?: { sampleRate?: number; codec?: string },
  ) => Promise<void>
  markComplete: () => void
  stop: () => void
  dispose: () => void
  readonly playing: boolean
  readonly pending: number
}

function looksLikeMp3(mime: string, codec?: string): boolean {
  const tip = `${mime} ${codec ?? ""}`.toLowerCase()
  return tip.includes("mpeg") || tip.includes("mp3")
}

function looksLikePcm(mime: string, codec?: string): boolean {
  const tip = `${mime} ${codec ?? ""}`.toLowerCase()
  return (
    tip.includes("linear16") ||
    tip.includes("pcm") ||
    tip.includes("l16") ||
    tip.includes("wav")
  )
}

function pcm16ToAudioBuffer(
  ctx: AudioContext,
  pcm: ArrayBuffer,
  sampleRate: number,
): AudioBuffer {
  const bytes = pcm.byteLength & ~1
  const int16 = new Int16Array(pcm, 0, bytes / 2)
  const buffer = ctx.createBuffer(1, int16.length, sampleRate)
  const channel = buffer.getChannelData(0)
  for (let i = 0; i < int16.length; i += 1) {
    channel[i] = (int16[i] ?? 0) / 32768
  }
  return buffer
}

function concatBuffers(parts: ArrayBuffer[]): ArrayBuffer {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(new Uint8Array(part), offset)
    offset += part.byteLength
  }
  return out.buffer
}

export function createPlaybackQueue(
  onIdle?: () => void,
  onDebug?: (event: PlaybackDebugEvent) => void,
): PlaybackQueue {
  let ctx: AudioContext | null = null
  let playing = false
  let generation = 0
  let streamComplete = false
  let idleNotified = false
  let currentSource: AudioBufferSourceNode | null = null
  let chain: Promise<void> = Promise.resolve()

  /** PCM schedule queue */
  const pcmQueue: Array<{ buffer: ArrayBuffer; sampleRate: number }> = []
  /** MP3 fragments held until complete */
  const mp3Parts: ArrayBuffer[] = []
  let mode: "pcm" | "mp3" | null = null

  function ensureCtx(): AudioContext {
    if (!ctx) {
      ctx = new AudioContext()
    }
    return ctx
  }

  function maybeIdle() {
    if (
      !streamComplete ||
      playing ||
      pcmQueue.length > 0 ||
      mp3Parts.length > 0 ||
      idleNotified
    ) {
      return
    }
    idleNotified = true
    onDebug?.({ type: "idle" })
    onIdle?.()
  }

  async function playAudioBuffer(gen: number, audio: AudioBuffer): Promise<void> {
    const audioCtx = ensureCtx()
    if (audioCtx.state === "suspended") {
      await audioCtx.resume()
    }
    if (gen !== generation) {
      return
    }
    playing = true
    idleNotified = false
    await new Promise<void>((resolve) => {
      const source = audioCtx.createBufferSource()
      currentSource = source
      source.buffer = audio
      source.connect(audioCtx.destination)
      source.onended = () => {
        currentSource = null
        resolve()
      }
      source.start(0)
    })
  }

  async function drainPcm(gen: number): Promise<void> {
    while (gen === generation) {
      const item = pcmQueue.shift()
      if (!item) {
        playing = false
        maybeIdle()
        return
      }
      const audio = pcm16ToAudioBuffer(
        ensureCtx(),
        item.buffer,
        item.sampleRate,
      )
      onDebug?.({
        type: "pcm_play",
        samples: audio.length,
        sampleRate: item.sampleRate,
      })
      await playAudioBuffer(gen, audio)
    }
  }

  async function playMp3Blob(gen: number): Promise<void> {
    if (gen !== generation || mp3Parts.length === 0) {
      playing = false
      maybeIdle()
      return
    }
    const merged = concatBuffers(mp3Parts.splice(0, mp3Parts.length))
    onDebug?.({ type: "mp3_play", bytes: merged.byteLength })
    try {
      const decoded = await ensureCtx().decodeAudioData(merged.slice(0))
      if (gen !== generation) {
        return
      }
      await playAudioBuffer(gen, decoded)
    } catch (error) {
      onDebug?.({
        type: "mp3_decode_fail",
        bytes: merged.byteLength,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    playing = false
    maybeIdle()
  }

  return {
    get playing() {
      return playing
    },
    get pending() {
      return pcmQueue.length + mp3Parts.length
    },
    enqueue(chunk, mime, meta) {
      streamComplete = false
      idleNotified = false
      const codec = meta?.codec
      const sampleRate = meta?.sampleRate ?? 24000

      if (looksLikePcm(mime, codec) || (!looksLikeMp3(mime, codec) && mode === "pcm")) {
        mode = "pcm"
        onDebug?.({ type: "enqueue", bytes: chunk.byteLength, kind: "pcm" })
        pcmQueue.push({ buffer: chunk, sampleRate })
        const gen = generation
        chain = chain.then(() => drainPcm(gen))
        return chain
      }

      mode = "mp3"
      onDebug?.({ type: "enqueue", bytes: chunk.byteLength, kind: "mp3" })
      mp3Parts.push(chunk)
      // Do not play yet — wait for markComplete so decodeAudioData gets a full file.
      return Promise.resolve()
    },
    markComplete() {
      streamComplete = true
      const gen = generation
      if (mode === "mp3" && mp3Parts.length > 0) {
        chain = chain.then(() => playMp3Blob(gen))
        return
      }
      maybeIdle()
    },
    stop() {
      generation += 1
      pcmQueue.length = 0
      mp3Parts.length = 0
      streamComplete = false
      idleNotified = true
      mode = null
      try {
        currentSource?.stop()
      } catch {
        /* ignore */
      }
      currentSource = null
      playing = false
      chain = Promise.resolve()
      onDebug?.({ type: "stop" })
    },
    dispose() {
      this.stop()
      void ctx?.close()
      ctx = null
    },
  }
}
