import { expect, it } from "vitest"
import * as THREE from "three"
import { SORT_RAIL_OFFSET, sortRailDistance, sortRailId, sortRailOffset } from "./sort-rail"

it("projects a sub-pixel path normal through every isometric view and continuous bend", () => {
  const camera = new THREE.OrthographicCamera(), world = new THREE.Matrix4().makeTranslation(12, 2, 30)
  for (let view = 0; view < 16; view++) for (let direction = 0; direction < 64; direction++) {
    const yaw = view * Math.PI / 8, heading = direction * Math.PI / 32
    camera.position.set(Math.sin(yaw) * 10, 5, Math.cos(yaw) * 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
    const offset = sortRailOffset(123)
    const expected = new THREE.Vector3(12 + Math.cos(heading) * offset, 2, 30 - Math.sin(heading) * offset).applyMatrix4(camera.matrixWorldInverse)
    expect(sortRailDistance(world.elements, camera.matrixWorldInverse.elements, heading, 123)).toBeCloseTo(-expected.z, 8)
    expect(Math.abs(offset)).toBeLessThanOrEqual(SORT_RAIL_OFFSET)
    expect(world.elements.slice(12, 15)).toEqual([12, 2, 30])
  }
})

it("assigns independent stable identities to every part sharing a selection ID", () => {
  const id = new THREE.Vector3(1 / 255, 2 / 255, 3 / 255)
  const parts = Array.from({ length: 10 }, (_, part) => sortRailId(id, part))
  expect(new Set(parts).size).toBe(10)
  expect(new Set(parts.map(sortRailOffset)).size).toBe(10)
  expect(sortRailId(id.clone(), 3)).toBe(parts[3])
})

it("retains exact cardinal ties and follows sloped ground", () => {
  const world = new THREE.Matrix4(), camera = new THREE.OrthographicCamera()
  camera.position.set(0, 5, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
  const view = camera.matrixWorldInverse.elements
  expect(sortRailDistance(world.elements, view, 0, 1)).toBe(sortRailDistance(world.elements, view, Math.PI, 2))
  const seat = { x: 0, z: 1 }, ground = new THREE.Vector4(0, 1, -.2, 0)
  const expected = new THREE.Vector3(sortRailOffset(1), .2, 1).applyMatrix4(camera.matrixWorldInverse)
  expect(sortRailDistance(world.elements, view, 0, 1, seat, ground)).toBeCloseTo(-expected.z, 8)
})

it("projects body height as well as seat position without moving artwork or flattening slopes", () => {
  const world = new THREE.Matrix4().makeTranslation(2, 3, -4), camera = new THREE.OrthographicCamera()
  const seat = { x: -.2, y: .8, z: .5 }, ground = new THREE.Vector4(-.1, 1, -.2, 0)
  for (let i = 0; i < 16; i++) {
    const heading = i * Math.PI / 8
    camera.position.set(10 * Math.sin(heading + .7), 5, 10 * Math.cos(heading + .7)); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
    const rail = sortRailOffset(19), dx = (seat.x + rail) * Math.cos(heading) + seat.z * Math.sin(heading)
    const dz = -(seat.x + rail) * Math.sin(heading) + seat.z * Math.cos(heading)
    const expected = new THREE.Vector3(2 + dx, 3 + seat.y + .1 * dx + .2 * dz, -4 + dz).applyMatrix4(camera.matrixWorldInverse)
    expect(sortRailDistance(world.elements, camera.matrixWorldInverse.elements, heading, 19, seat, ground)).toBeCloseTo(-expected.z, 8)
    expect(world.elements.slice(12, 15)).toEqual([2, 3, -4])
  }
})
