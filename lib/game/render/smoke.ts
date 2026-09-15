import * as THREE from "three"
import { CHARACTER_PIXEL_SIZE } from "./pixel-scale"
import { pixelOpacityShader } from "./pixel-opacity"

export const SMOKE_PUFFS = 5
const SIZE = 24
const data = new Uint8Array(SIZE * SIZE * 4)
let left = SIZE, bottom = SIZE, right = 0, top = 0
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
  const inside = Math.hypot(x - 10, y - 12) < 8 || Math.hypot(x - 15, y - 9) < 6 || Math.hypot(x - 7, y - 8) < 5
  const i = (y * SIZE + x) * 4
  data[i] = data[i + 1] = data[i + 2] = 255
  data[i + 3] = inside ? 210 : 0
  if (inside) { left = Math.min(left, x); bottom = Math.min(bottom, y); right = Math.max(right, x + 1); top = Math.max(top, y + 1) }
}

// All chimneys share this immutable mask and material for the app's lifetime.
const map = new THREE.DataTexture(data, SIZE, SIZE)
map.magFilter = map.minFilter = THREE.NearestFilter
map.generateMipmaps = false
map.needsUpdate = true
export const smokeMaterial = new THREE.MeshBasicMaterial({ map, color: "#b9b7ab", transparent: true, depthWrite: false, toneMapped: false })
smokeMaterial.onBeforeCompile = shader => {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nattribute vec3 smokeOffset; attribute vec2 smokeCoverage; varying vec2 vSmokeCoverage;")
    .replace("#include <project_vertex>", `
      vSmokeCoverage = smokeCoverage;
      vec4 mvPosition = modelViewMatrix * vec4(smokeOffset, 1.0);
      vec2 scale = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
      mvPosition.xy += position.xy * scale;
      gl_Position = projectionMatrix * mvPosition;`)
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying vec2 vSmokeCoverage;")
    .replace("#include <alphatest_fragment>", "diffuseColor.a *= vSmokeCoverage.x;\n#include <alphatest_fragment>")
  pixelOpacityShader(shader, { value: new THREE.Vector2(SIZE, SIZE) }, "floor(vSmokeCoverage.y + 0.5)")
}
smokeMaterial.customProgramCacheKey = () => "instanced-smoke-coverage-v1"

/** One draw per chimney, with UVs and bounds cropped to the nonempty mask.
 * Native texel coordinates stay unchanged so the dither does not stretch. */
export function smokeGeometry() {
  const plane = new THREE.PlaneGeometry((right - left) * CHARACTER_PIXEL_SIZE, (top - bottom) * CHARACTER_PIXEL_SIZE)
  plane.translate(((left + right) / 2 - SIZE / 2) * CHARACTER_PIXEL_SIZE, ((bottom + top) / 2 - SIZE / 2) * CHARACTER_PIXEL_SIZE, 0)
  const uv = plane.getAttribute("uv")
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (left + uv.getX(i) * (right - left)) / SIZE, (bottom + uv.getY(i) * (top - bottom)) / SIZE)
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.index = plane.index
  geometry.attributes = plane.attributes
  geometry.instanceCount = SMOKE_PUFFS
  geometry.setAttribute("smokeOffset", new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_PUFFS * 3), 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute("smokeCoverage", new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_PUFFS * 2), 2).setUsage(THREE.DynamicDrawUsage))
  // Includes the full rise, horizontal drift and camera-facing quad at any yaw.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(.17, .675, 0), 1.15)
  return geometry
}

export function updateSmoke(geometry: THREE.InstancedBufferGeometry, elapsed: number, phase: number) {
  const offset = geometry.getAttribute("smokeOffset"), coverage = geometry.getAttribute("smokeCoverage")
  for (let i = 0; i < SMOKE_PUFFS; i++) {
    const t = (elapsed * .23 + i / SMOKE_PUFFS + phase) % 1
    offset.setXYZ(i, Math.round((t * .33 + Math.sin(t * 6 + i) * .055) / CHARACTER_PIXEL_SIZE) * CHARACTER_PIXEL_SIZE, t * 1.35, 0)
    coverage.setXY(i, Math.sin(Math.PI * t) * .32, i * 37)
  }
  offset.needsUpdate = coverage.needsUpdate = true
}
