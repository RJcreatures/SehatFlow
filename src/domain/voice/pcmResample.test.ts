import { describe, expect, it } from "vitest"
import { floatTo16kPcm, TARGET_PCM_RATE } from "./pcmResample.ts"

describe("pcm resample", () => {
  it("does not merely relabel 48 kHz as 16 kHz", () => {
    const inputRate = 48_000
    const seconds = 0.1
    const input = new Float32Array(Math.floor(inputRate * seconds))
    for (let i = 0; i < input.length; i += 1) {
      input[i] = Math.sin((2 * Math.PI * 440 * i) / inputRate)
    }
    const out = floatTo16kPcm(input, inputRate, TARGET_PCM_RATE)
    expect(out.length).toBe(Math.floor(input.length / (inputRate / TARGET_PCM_RATE)))
    expect(out.length).toBeLessThan(input.length / 2)
    expect(out.some((sample) => sample !== 0)).toBe(true)
  })

  it("rejects empty input safely", () => {
    expect(floatTo16kPcm(new Float32Array(0), 48_000).length).toBe(0)
  })
})
