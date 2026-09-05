"use client"

import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"

/** Keep the ground visible even while a texture request is slow or fails. */
export function useTerrainTexture(url: string, fallbackColor: string) {
  const fallback = useMemo(() => {
    const color = new THREE.Color(fallbackColor).getRGB(new THREE.Color(), THREE.SRGBColorSpace)
    const texture = new THREE.DataTexture(new Uint8Array([
      Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255), 255,
    ]), 1, 1)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true
    return texture
  }, [fallbackColor])
  const [loaded, setLoaded] = useState<{ url: string; texture: THREE.Texture } | null>(null)

  useEffect(() => {
    let active = true
    const texture = new THREE.TextureLoader().load(url, (texture) => {
      if (!active) { texture.dispose(); return }
      texture.colorSpace = THREE.SRGBColorSpace
      setLoaded({ url, texture })
    }, undefined, () => {
      // The colored surface remains usable when an asset is unavailable.
    })
    return () => { active = false; texture.dispose() }
  }, [url])
  useEffect(() => () => fallback.dispose(), [fallback])

  return loaded?.url === url ? loaded.texture : fallback
}
