import { expect, it, vi } from "vitest"
import * as THREE from "three"
import { registerSurfaceLighting } from "./surface-registration"
import { pixelNoiseData, PIXEL_NOISE_SIZE } from "./pixel-noise"

it("keeps repeatable grain and balanced dither coverage in the shared lookup", () => {
  const data = pixelNoiseData()
  expect(data).toEqual(pixelNoiseData())
  const counts = new Uint32Array(256)
  for (let i = 3; i < data.length; i += 4) counts[data[i]]++
  expect(new Set(counts)).toEqual(new Set([PIXEL_NOISE_SIZE ** 2 / 256]))
  for (let y = 0; y < PIXEL_NOISE_SIZE; y++) for (let x = 0; x < PIXEL_NOISE_SIZE; x++) {
    const i = (y * PIXEL_NOISE_SIZE + x) * 4
    for (const [channel, width] of [[1, 3], [2, 6]]) {
      const origin = (Math.floor(y / 2) * 2 * PIXEL_NOISE_SIZE + Math.floor(x / width) * width) * 4
      expect(data[i + channel]).toBe(data[origin + channel])
    }
  }
})

it("registers late subtrees and replacement materials and restores object callbacks", () => {
  const scene = new THREE.Scene(), group = new THREE.Group()
  const material = new THREE.MeshLambertMaterial(), replacement = new THREE.MeshStandardMaterial()
  const mesh: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(), material)
  const draw = vi.fn()
  mesh.onBeforeRender = draw
  const restore = registerSurfaceLighting(scene)
  const original = material.onBeforeCompile
  group.add(mesh); scene.add(group)
  expect(material.onBeforeCompile).not.toBe(original)
  const replacementCompile = replacement.onBeforeCompile
  mesh.material = replacement
  mesh.onBeforeRender({} as THREE.WebGLRenderer, scene, new THREE.Camera(), mesh.geometry, replacement, group)
  expect(replacement.onBeforeCompile).not.toBe(replacementCompile)
  expect(draw).toHaveBeenCalledOnce()
  scene.remove(group)
  expect(mesh.onBeforeRender).toBe(draw)
  scene.add(group)
  restore()
  expect(mesh.onBeforeRender).toBe(draw)
  const late = new THREE.MeshLambertMaterial(), compile = late.onBeforeCompile
  scene.add(new THREE.Mesh(mesh.geometry, late))
  expect(late.onBeforeCompile).toBe(compile)
  mesh.geometry.dispose(); material.dispose(); replacement.dispose(); late.dispose()
})
