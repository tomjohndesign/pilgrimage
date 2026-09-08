import * as THREE from "three"
import { BASE_PERSON, type Point3 } from "../base-person/pose"
import { type Animal, type HorseVariant } from "./assets"

/** Guide the leather outside the ribcage before it narrows to the bit.
 * Coordinates are relative to the animal, including the driver's hand. */
export function reinCurve(hand: Point3, bit: Point3, side: number, kind: Animal, variant: HorseVariant) {
  const width = kind === "horse" && variant === "noble" ? 0.57 : 0.46
  const height = (z: number) => {
    const t = THREE.MathUtils.clamp((z - hand[2]) / (bit[2] - hand[2]), 0, 1)
    return THREE.MathUtils.lerp(hand[1], bit[1], t) - Math.sin(t * Math.PI) * 0.09
  }
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(...hand), new THREE.Vector3(side * width, height(-0.85), -0.85),
    new THREE.Vector3(side * width, height(0.65), 0.65), new THREE.Vector3(...bit),
  ])
}

/** Sprites retain the bake camera's pitch even when the world camera changes.
 * Reconstruct the same screen position AND encoded depth for attached geometry. */
export function reinViewPoint(point: THREE.Vector3, row: number, directions: number) {
  const pitch = BASE_PERSON.camera.pitch * Math.PI / 180
  return point.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -row * Math.PI * 2 / directions)
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), pitch)
}

/** Native square pixels in camera space, retaining interpolated surface depth. */
export function reinPixels(points: THREE.Vector3[], texel: number) {
  const pixels: THREE.Vector3[] = []
  let lastX = NaN, lastY = NaN
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / texel * 2))
    for (let j = 0; j <= steps; j++) {
      const p = a.clone().lerp(b, j / steps)
      const x = (Math.floor(p.x / texel) + 0.5) * texel, y = (Math.floor(p.y / texel) + 0.5) * texel
      if (x === lastX && y === lastY) continue
      pixels.push(new THREE.Vector3(x, y, p.z)); lastX = x; lastY = y
    }
  }
  return pixels
}
