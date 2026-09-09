import { existsSync } from "node:fs"
import { Cache, ImageLoader } from "three"
import { describe, expect, it, vi } from "vitest"
import { openingAssetUrls, preloadGameAssets } from "./preload-assets"

describe("opening scene preloads", () => {
  for (const model of ["base", "callings"] as const) it(`only requests published ${model} assets`, () => {
    const urls = openingAssetUrls(model)
    expect(urls.length).toBeGreaterThan(100)
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls.filter(url => !existsSync(`public${url}`))).toEqual([])
  })
  it("bounds background requests, reuses successes and retries failed images", async () => {
    const urls = openingAssetUrls()
    const retryUrl = urls[0]
    let active = 0, peak = 0, attempts = 0
    const cached = Cache.enabled
    const load = vi.spyOn(ImageLoader.prototype, "loadAsync").mockImplementation(async url => {
      peak = Math.max(peak, ++active)
      await Promise.resolve()
      active--
      if (url === retryUrl && ++attempts === 1) throw new Error("Temporary network failure")
      return {} as HTMLImageElement
    })
    try {
      await preloadGameAssets()
      expect(peak).toBeLessThanOrEqual(4)
      expect(load).toHaveBeenCalledTimes(urls.length)
      await preloadGameAssets()
      expect(load).toHaveBeenCalledTimes(urls.length + 1)
      expect(attempts).toBe(2)
      expect(Cache.enabled).toBe(true)
    } finally {
      load.mockRestore()
      Cache.enabled = cached
    }
  })
})
