/** Target sample rate for Sarvam realtime STT (linear16 mono). */
export const TARGET_PCM_RATE = 16_000

/**
 * Downsample Float32 mono PCM to Int16 LE at targetRate.
 * Linear interpolation — does not merely relabel 48 kHz as 16 kHz.
 */
export function floatTo16kPcm(
  input: Float32Array,
  inputRate: number,
  targetRate = TARGET_PCM_RATE,
): Int16Array {
  if (input.length === 0) {
    return new Int16Array(0)
  }
  if (inputRate === targetRate) {
    const out = new Int16Array(input.length)
    for (let i = 0; i < input.length; i += 1) {
      out[i] = floatToInt16(input[i]!)
    }
    return out
  }
  const ratio = inputRate / targetRate
  const outLength = Math.max(1, Math.floor(input.length / ratio))
  const out = new Int16Array(outLength)
  for (let i = 0; i < outLength; i += 1) {
    const src = i * ratio
    const i0 = Math.floor(src)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = src - i0
    const sample = input[i0]! * (1 - frac) + input[i1]! * frac
    out[i] = floatToInt16(sample)
  }
  return out
}

export function floatToInt16(sample: number): number {
  const clipped = Math.max(-1, Math.min(1, sample))
  return clipped < 0 ? Math.round(clipped * 0x8000) : Math.round(clipped * 0x7fff)
}

export function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
