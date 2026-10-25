import { beforeEach, describe, expect, it, vi } from "vitest"

const ensureDemoQueue = vi.fn()
const getSupabaseClient = vi.fn()
const readSupabaseState = vi.fn()

vi.mock("./queueApi.ts", () => ({
  ensureDemoQueue: (...args: unknown[]) => ensureDemoQueue(...args),
}))

vi.mock("./client.ts", () => ({
  getSupabaseClient: (...args: unknown[]) => getSupabaseClient(...args),
  readSupabaseState: (...args: unknown[]) => readSupabaseState(...args),
}))

describe("ensureDemoQueueOnce", () => {
  beforeEach(() => {
    vi.resetModules()
    ensureDemoQueue.mockReset()
    getSupabaseClient.mockReset()
    readSupabaseState.mockReset()
    readSupabaseState.mockReturnValue({ status: "ready" })
    getSupabaseClient.mockReturnValue({ rpc: vi.fn() })
    ensureDemoQueue.mockResolvedValue({ data: { action: "noop" }, error: null })
  })

  it("calls the RPC once inside the cooldown window", async () => {
    const { ensureDemoQueueOnce } = await import("./ensureDemo.ts")
    await ensureDemoQueueOnce()
    await ensureDemoQueueOnce()
    expect(ensureDemoQueue).toHaveBeenCalledTimes(1)
  })
})
