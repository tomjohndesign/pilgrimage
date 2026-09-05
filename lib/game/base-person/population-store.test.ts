import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_DESIGN } from "./design"
import { DEFAULT_POPULATION } from "./population-assets"
import type { PopulationPack } from "./population"

const { bake } = vi.hoisted(() => ({ bake: vi.fn() }))
vi.mock("./bake-population", () => ({ bakePopulation: bake }))

function pendingPack() {
  let resolve!: (pack: PopulationPack) => void
  const promise = new Promise<PopulationPack>(done => { resolve = done })
  return { promise, resolve }
}

describe("population replacement", () => {
  beforeEach(() => { vi.resetModules(); bake.mockReset() })

  it("keeps the latest edit when an older bake completes later", async () => {
    const first = pendingPack(), second = pendingPack()
    bake.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { usePopulationStore: store } = await import("./population-store")
    const oldRequest = store.getState().prepare(DEFAULT_DESIGN)
    await vi.waitFor(() => expect(bake).toHaveBeenCalledTimes(1))
    const newRequest = store.getState().prepare({ ...DEFAULT_DESIGN, head: 1.3 })
    await vi.waitFor(() => expect(bake).toHaveBeenCalledTimes(2))
    expect(bake.mock.calls[0][2]()).toBe(true)
    const latest = { ...DEFAULT_POPULATION, templateVersion: 999 }
    second.resolve(latest)
    await newRequest
    first.resolve(DEFAULT_POPULATION)
    await oldRequest
    expect(store.getState().pack).toBe(latest)
    expect(store.getState().building).toBe(false)
  })

  it("restores shipped defaults while a custom bake is pending", async () => {
    const pending = pendingPack()
    bake.mockReturnValue(pending.promise)
    const { usePopulationStore: store } = await import("./population-store")
    const request = store.getState().prepare(DEFAULT_DESIGN)
    await vi.waitFor(() => expect(bake).toHaveBeenCalledTimes(1))
    await store.getState().prepare(null)
    bake.mock.calls[0][1](0.8)
    pending.resolve(DEFAULT_POPULATION)
    await request
    expect(store.getState()).toMatchObject({ pack: null, progress: 0, building: false, error: "" })
  })

  it("reuses unchanged foundations and retains the crowd if replacement fails", async () => {
    bake.mockResolvedValueOnce(DEFAULT_POPULATION).mockRejectedValueOnce(new Error("Bake failed"))
    const { usePopulationStore: store } = await import("./population-store")
    await store.getState().prepare(DEFAULT_DESIGN)
    await store.getState().prepare({ ...DEFAULT_DESIGN })
    expect(bake).toHaveBeenCalledTimes(1)
    const edited = { ...DEFAULT_DESIGN, head: 1.3 }
    await store.getState().prepare(edited)
    expect(store.getState()).toMatchObject({ pack: DEFAULT_POPULATION, building: false, error: "Bake failed" })
    bake.mockResolvedValueOnce(DEFAULT_POPULATION)
    await store.getState().prepare(edited)
    expect(bake).toHaveBeenCalledTimes(3)
    expect(store.getState().error).toBe("")
  })
})
