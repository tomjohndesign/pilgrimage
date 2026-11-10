import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { useLoader } from "@react-three/fiber"
import { suspend } from "suspend-react"
import { ASSET_RETRY_MAX_MS, assetRetryDelay, candidateLoaderKeys, failedAssetUrl, forgetFailedLoads, noteLoaderError, noteLoaderUrl } from "./scene-assets"

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

/** Whether suspend-react still holds a settled rejection for these `useLoader` keys. */
function cachedRejection(urls: string[]) {
  try {
    suspend(() => new Promise(() => {}), [THREE.TextureLoader, ...urls])
  } catch (thrown) {
    return thrown instanceof Error
  }
  return false
}

describe("scene asset failures", () => {
  it("names the URL from fiber's useLoader rejection", () => {
    noteLoaderUrl("/textures/a: b.png")
    expect(failedAssetUrl(new Error("Could not load /textures/a: b.png: undefined"))).toBe("/textures/a: b.png")
    expect(failedAssetUrl(new Error("Could not load /textures/x.png: 404"))).toBe("/textures/x.png")
    expect(failedAssetUrl(new Error("The source width is 0."))).toBeNull()
  })

  it("finds the whole URL list a failed call was cached under", async () => {
    await flush()
    noteLoaderUrl("/other.png")
    noteLoaderUrl("/walk.png"); noteLoaderUrl("/idle.png"); noteLoaderUrl("/depth-walk.png")
    await flush()
    const keys = candidateLoaderKeys("/idle.png").map(list => list.join(","))
    expect(keys).toContain("/walk.png,/idle.png,/depth-walk.png")
    expect(keys).toContain("/idle.png")
    expect(keys.every(list => list.split(",").includes("/idle.png"))).toBe(true)
  })

  it("evicts the cached rejection so a later mount refetches", async () => {
    await flush()
    const urls = ["/color.png", "/depth.png"]
    urls.forEach(noteLoaderUrl)
    // Without a DOM the image loader throws, which caches a rejection like a failed fetch.
    useLoader.preload(THREE.TextureLoader, urls)
    await flush(); await flush()
    expect(cachedRejection(urls)).toBe(true)
    forgetFailedLoads(new Error("Could not load /depth.png: undefined"))
    expect(cachedRejection(urls)).toBe(false)
  })

  it("also evicts lists whose image failed without naming it in the error", async () => {
    await flush()
    const urls = ["/foliage-color.png", "/foliage-depth.png"]
    urls.forEach(noteLoaderUrl)
    useLoader.preload(THREE.TextureLoader, urls)
    await flush(); await flush()
    noteLoaderError("/foliage-depth.png")
    forgetFailedLoads(new Error("Failed to execute 'getImageData': The source width is 0."))
    expect(cachedRejection(urls)).toBe(false)
  })

  it("backs off retries exponentially up to a cap", () => {
    expect([1, 2, 3, 4].map(assetRetryDelay)).toEqual([2000, 4000, 8000, 16000])
    expect(assetRetryDelay(50)).toBe(ASSET_RETRY_MAX_MS)
  })
})
