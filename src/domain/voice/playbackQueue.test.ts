import { describe, expect, it, vi } from "vitest"
import { createPlaybackQueue } from "./playbackQueue.ts"

describe("playback queue", () => {
  it("clears queued audio on stop without throwing", () => {
    const queue = createPlaybackQueue()
    queue.stop()
    queue.dispose()
    expect(queue.playing).toBe(false)
  })

  it("does not treat buffered mp3 as idle until markComplete", () => {
    const onIdle = vi.fn()
    const queue = createPlaybackQueue(onIdle)
    void queue.enqueue(new Uint8Array([1, 2, 3, 4]).buffer, "audio/mpeg")
    expect(onIdle).not.toHaveBeenCalled()
    expect(queue.pending).toBe(1)
    queue.markComplete()
    // markComplete schedules decode; idle may be async — pending clears sync for mp3 parts moved into play
    queue.stop()
    queue.dispose()
  })

  it("fires idle after markComplete with empty pcm queue", () => {
    const onIdle = vi.fn()
    const queue = createPlaybackQueue(onIdle)
    queue.markComplete()
    expect(onIdle).toHaveBeenCalledTimes(1)
    queue.dispose()
  })
})
