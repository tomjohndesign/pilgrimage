import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { reinCurve, reinPixels, reinViewPoint } from "./reins"
import { animalBit } from "./bridle"
import { BASE_PERSON } from "../base-person/pose"

describe("pixel driving reins", () => {
  it("keeps both cords outside the torso and attached to the bit through the walk", () => {
    for (const kind of ["horse", "donkey"] as const) for (const variant of ["common", "noble"] as const) {
      for (const side of [-1, 1]) for (const phase of [0, 0.25, 0.5, 0.75]) {
        const hand: [number, number, number] = [side * 0.23, 1.68, -1.42]
        const bit = animalBit(kind, variant, phase, true, side)
        const curve = reinCurve(hand, bit, side, kind, variant)
        expect(curve.getPoint(0).toArray()).toEqual(hand)
        curve.getPoint(1).toArray().forEach((value, i) => expect(value).toBeCloseTo(bit[i], 10))
        for (const p of curve.getPoints(100)) if (p.z > -0.8 && p.z < 0.6) {
          expect(p.x * side).toBeGreaterThan(kind === "horse" && variant === "noble" ? 0.42 : 0.32)
        }
      }
    }
  })
  it("matches the baked camera projection and swaps near/far depth on opposite turns", () => {
    const pitch = BASE_PERSON.camera.pitch * Math.PI / 180
    const camera = new THREE.OrthographicCamera()
    camera.position.set(0, 10 * Math.sin(pitch), 10 * Math.cos(pitch)); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true)
    const origin = new THREE.Vector3().applyMatrix4(camera.matrixWorldInverse)
    for (let row = 0; row < 16; row++) {
      const point = new THREE.Vector3(0.46, 1.4, 0.2)
      const expected = point.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -row * Math.PI / 8)
        .applyMatrix4(camera.matrixWorldInverse).sub(origin)
      expect(reinViewPoint(point, row, 16).distanceTo(expected)).toBeLessThan(1e-12)
    }
    for (const row of [2, 6]) {
      const left = reinViewPoint(new THREE.Vector3(0.46, 1.4, 0), row, 8)
      const right = reinViewPoint(new THREE.Vector3(-0.46, 1.4, 0), row, 8)
      expect(Math.sign(left.z - right.z)).toBe(row === 2 ? 1 : -1)
    }
  })
  it("rasterizes a connected native-pixel cord without discarding its depth", () => {
    const pixels = reinPixels([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0.4, 2)], 0.1)
    expect(pixels.length).toBeGreaterThanOrEqual(11)
    pixels.forEach((p, i) => {
      expect(p.x / 0.1 - 0.5).toBeCloseTo(Math.round(p.x / 0.1 - 0.5), 10)
      expect(p.y / 0.1 - 0.5).toBeCloseTo(Math.round(p.y / 0.1 - 0.5), 10)
      if (i) {
        expect(Math.abs(p.x - pixels[i - 1].x)).toBeLessThanOrEqual(0.100001)
        expect(Math.abs(p.y - pixels[i - 1].y)).toBeLessThanOrEqual(0.100001)
        expect(p.z).toBeGreaterThan(pixels[i - 1].z)
      }
    })
  })
})
