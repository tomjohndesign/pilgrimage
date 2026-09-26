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

/** `reinCurve(...).getPoints(divisions)` with three's centripetal Catmull-Rom
 * arithmetic, computing each segment's cubic once rather than for every sample. */
export function reinCurvePoints(hand: Point3, bit: Point3, side: number, kind: Animal, variant: HorseVariant, divisions: number) {
  const control = reinCurve(hand, bit, side, kind, variant).points, count = control.length
  const segments: number[][] = []
  const points: THREE.Vector3[] = []
  for (let d = 0; d <= divisions; d++) {
    const p = (count - 1) * (d / divisions)
    let segment = Math.floor(p), weight = p - segment
    if (weight === 0 && segment === count - 1) { segment = count - 2; weight = 1 }
    const c = segments[segment] ??= segmentCubic(control, segment)
    const t2 = weight * weight, t3 = t2 * weight
    points.push(new THREE.Vector3(c[0] + c[1] * weight + c[2] * t2 + c[3] * t3,
      c[4] + c[5] * weight + c[6] * t2 + c[7] * t3, c[8] + c[9] * weight + c[10] * t2 + c[11] * t3))
  }
  return points
}

/** CatmullRomCurve3's open, centripetal segment set-up, as x/y/z coefficient quadruples. */
function segmentCubic(points: THREE.Vector3[], segment: number) {
  const count = points.length, p1 = points[segment], p2 = points[segment + 1]
  const p0 = segment > 0 ? points[segment - 1] : new THREE.Vector3().subVectors(points[0], points[1]).add(points[0])
  const p3 = segment + 2 < count ? points[segment + 2] : new THREE.Vector3().subVectors(points[count - 1], points[count - 2]).add(points[count - 1])
  let dt0 = Math.pow(p0.distanceToSquared(p1), .25), dt1 = Math.pow(p1.distanceToSquared(p2), .25), dt2 = Math.pow(p2.distanceToSquared(p3), .25)
  if (dt1 < 1e-4) dt1 = 1.0
  if (dt0 < 1e-4) dt0 = dt1
  if (dt2 < 1e-4) dt2 = dt1
  const cubic = (x0: number, x1: number, x2: number, x3: number) => {
    let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1
    let t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2
    t1 *= dt1; t2 *= dt1
    return [x1, t1, -3 * x1 + 3 * x2 - 2 * t1 - t2, 2 * x1 - 2 * x2 + t1 + t2]
  }
  return [...cubic(p0.x, p1.x, p2.x, p3.x), ...cubic(p0.y, p1.y, p2.y, p3.y), ...cubic(p0.z, p1.z, p2.z, p3.z)]
}

/** Sprites retain the bake camera's pitch even when the world camera changes.
 * Reconstruct the same screen position AND encoded depth for attached geometry.
 * Each row's two rotations are the quaternions `applyAxisAngle` would build. */
export function reinViewPoint(point: THREE.Vector3, row: number, directions: number) {
  const key = `${row}:${directions}`
  let turn = viewTurns.get(key)
  if (!turn) {
    turn = [new THREE.Quaternion().setFromAxisAngle(Y_AXIS, -row * Math.PI * 2 / directions),
      new THREE.Quaternion().setFromAxisAngle(X_AXIS, BASE_PERSON.camera.pitch * Math.PI / 180)]
    viewTurns.set(key, turn)
  }
  return point.clone().applyQuaternion(turn[0]).applyQuaternion(turn[1])
}
const X_AXIS = new THREE.Vector3(1, 0, 0), Y_AXIS = new THREE.Vector3(0, 1, 0)
const viewTurns = new Map<string, [THREE.Quaternion, THREE.Quaternion]>()

/** Native square pixels in camera space, retaining interpolated surface depth. */
export function reinPixels(points: THREE.Vector3[], texel: number) {
  const pixels: THREE.Vector3[] = []
  forEachReinPixel(points, texel, (x, y, z) => { pixels.push(new THREE.Vector3(x, y, z)) })
  return pixels
}

/** `reinPixels` without allocating: stops early when `visit` returns false. */
export function forEachReinPixel(points: THREE.Vector3[], texel: number, visit: (x: number, y: number, z: number) => boolean | void) {
  let lastX = NaN, lastY = NaN
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / texel * 2))
    for (let j = 0; j <= steps; j++) {
      // Vector3.lerp's arithmetic.
      const alpha = j / steps
      const px = a.x + (b.x - a.x) * alpha, py = a.y + (b.y - a.y) * alpha, pz = a.z + (b.z - a.z) * alpha
      const x = (Math.floor(px / texel) + 0.5) * texel, y = (Math.floor(py / texel) + 0.5) * texel
      if (x === lastX && y === lastY) continue
      if (visit(x, y, pz) === false) return
      lastX = x; lastY = y
    }
  }
}
