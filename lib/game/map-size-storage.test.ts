import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_MAP_WIDTH, MIN_MAP_SIZE } from "./map/generate-map"
import { loadDefaultMapSize, MAX_MAP_SIZE, saveDefaultMapSize } from "./map-size-storage"

let saved: Map<string, string>
beforeEach(() => {
  saved = new Map()
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe("default map size", () => {
  it("uses the original default until a size is saved", () => {
    expect(loadDefaultMapSize()).toBe(DEFAULT_MAP_WIDTH)
    for (const size of [MIN_MAP_SIZE, 256, MAX_MAP_SIZE]) {
      expect(saveDefaultMapSize(size)).toBe(true)
      expect(loadDefaultMapSize()).toBe(size)
    }
  })

  it.each([0, MIN_MAP_SIZE - 1, MAX_MAP_SIZE + 1, 192.5, NaN, Infinity])(
    "rejects invalid size %s without overwriting the preference", size => {
      saveDefaultMapSize(256)
      expect(saveDefaultMapSize(size)).toBe(false)
      expect(loadDefaultMapSize()).toBe(256)
      saved.set("pilgrimage.map-size", String(size))
      expect(loadDefaultMapSize()).toBe(DEFAULT_MAP_WIDTH)
    },
  )

  it("recovers from corrupt or inaccessible storage and server rendering", () => {
    saved.set("pilgrimage.map-size", "broken")
    expect(loadDefaultMapSize()).toBe(DEFAULT_MAP_WIDTH)
    vi.stubGlobal("window", { get localStorage() { throw new Error("blocked") } })
    expect(loadDefaultMapSize()).toBe(DEFAULT_MAP_WIDTH)
    expect(saveDefaultMapSize(256)).toBe(false)
    vi.stubGlobal("window", undefined)
    expect(loadDefaultMapSize()).toBe(DEFAULT_MAP_WIDTH)
    expect(saveDefaultMapSize(256)).toBe(false)
  })
})
