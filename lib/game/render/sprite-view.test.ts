import { expect, it } from "vitest"
import { OrthographicCamera } from "three"
import { spriteView } from "./sprite-view"

it("retains contact orientation through pan/zoom but refreshes on same-frame camera turns", () => {
  const camera = new OrthographicCamera(-5, 5, 5, -5, .1, 100)
  camera.rotation.set(-.7, 0, 0, "YXZ"); camera.updateMatrixWorld()
  const shared = spriteView(camera), first = { ...shared }
  camera.position.set(25, 10, -12); camera.zoom = 2; camera.updateProjectionMatrix(); camera.updateMatrixWorld()
  expect(spriteView(camera)).toBe(shared)
  expect(shared).toEqual(first)
  camera.rotation.set(-.4, .8, 0, "YXZ"); camera.updateMatrixWorld()
  const turned = spriteView(camera)
  expect(turned.key).not.toBe(first.key)
  expect(turned.yaw).toBeCloseTo(.8)
  expect(turned.pitch).toBeCloseTo(Math.tan(.4))
  const second = camera.clone(); second.rotation.y = -.5; second.updateMatrixWorld()
  expect(spriteView(second).yaw).toBeCloseTo(-.5)
  expect(spriteView(camera).yaw).toBeCloseTo(.8)
})
