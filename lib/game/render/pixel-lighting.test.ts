import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { foliageMaterial } from "../trees/foliage/material"
import { patchPixelLighting } from "./pixel-lighting"
import { buildingSurfaceMaterial } from "./building-surface"
import { surfaceAppearanceUniforms } from "./pixel-surface"

function compile(material: THREE.Material, library: "basic" | "lambert" | "standard") {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib[library].vertexShader, fragmentShader: THREE.ShaderLib[library].fragmentShader }
  material.onBeforeCompile(shader as Parameters<THREE.Material["onBeforeCompile"]>[0], {} as THREE.WebGLRenderer)
  return shader
}

describe("shared pixel lighting", () => {
  it("keeps foliage's atlas shading when the global material wrapper runs", () => {
    const texture = new THREE.Texture()
    const material = foliageMaterial(texture, texture, { value: 0 }, { value: 0 })
    patchPixelLighting(material)
    patchPixelLighting(material)
    const shader = compile(material, "basic")
    expect(shader.fragmentShader.match(/vec3 surfaceDitherColor\(/g)).toHaveLength(1)
    expect(shader.fragmentShader).toContain("foliageGrain")
    expect(shader.fragmentShader).not.toContain("vec2 artSurface")
    expect(shader.uniforms).toMatchObject(surfaceAppearanceUniforms)
    material.dispose(); texture.dispose()
  })
  it("keeps one building lighting treatment under the global wrapper", () => {
    const material = buildingSurfaceMaterial()
    patchPixelLighting(material)
    const shader = compile(material, "lambert")
    expect(shader.fragmentShader.match(/SurfaceSample materialSurface =/g)).toHaveLength(1)
    expect(shader.fragmentShader).not.toContain("pixelSurfaceLight")
    expect(shader.fragmentShader.match(/float surfaceDitherLight\(/g)).toHaveLength(1)
    expect(shader.fragmentShader).toContain("buildingShading")
    material.dispose()
  })
  it("leaves untextured identity materials unchanged", () => {
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
    const original = material.onBeforeCompile
    patchPixelLighting(material)
    expect(material.onBeforeCompile).toBe(original)
    material.dispose()
  })
  it("dithers the combined lighting on standard materials too", () => {
    const material = new THREE.MeshStandardMaterial()
    patchPixelLighting(material)
    const shader = compile(material, "standard")
    expect(shader.fragmentShader).toContain("outgoingLight = surfaceDitherColor(outgoingLight")
    expect(shader.vertexShader).toContain("vSurfaceWorld =")
    material.dispose()
  })
})
