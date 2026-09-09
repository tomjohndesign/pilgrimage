import { expect, it } from "vitest"
import { Scene, OrthographicCamera } from "three"
import { FrameQualityController, frameQuality, frameQualityControl, updateFrameQuality } from "./frame-quality"
import { updateSceneryDetail, sceneryDetailStatus } from "./scenery-detail"

it("reduces sustained slow frames, holds in background tabs, and recovers slowly", () => {
  const control = new FrameQualityController()
  for (let i = 0; i < 10; i++) control.update(3, true)
  expect(control.level).toBe(0)
  for (let i = 0; i < 50; i++) control.update(1 / 25)
  expect(control.level).toBe(2)
  for (let i = 0; i < 180; i++) control.update(1 / 60)
  expect(control.level).toBe(2)
  for (let i = 0; i < 180; i++) control.update(1 / 60)
  expect(control.level).toBe(1)
  for (let i = 0; i < 600; i++) control.update(1 / 60, false, false)
  expect(control.level).toBe(1)
})

it("responds to sustained sub-five-FPS frames without reacting to a single loading stall", () => {
  const control = new FrameQualityController()
  control.update(3)
  expect(control.level).toBe(0)
  for (let i = 0; i < 20; i++) control.update(.5)
  expect(control.level).toBe(2)
})

it("holds through gestures, keeps scene state separate and resets diagnostic overrides", () => {
  const scene = new Scene(), preview = new Scene()
  for (let i = 0; i < 100; i++) updateFrameQuality(scene, .05, true)
  expect(frameQuality(scene)).toBe(0)
  for (let i = 0; i < 50; i++) updateFrameQuality(scene, .05, false)
  expect(frameQuality(scene)).toBe(2)
  expect(frameQuality(preview)).toBe(0)
  frameQualityControl.enabled = false
  expect(updateFrameQuality(scene, .05, false)).toBe(0)
  frameQualityControl.enabled = true
  expect(frameQuality(scene)).toBe(0)
})

it("allows FPS pressure to lower close-view scenery while preserving the zoom quiet period", () => {
  const scene = new Scene(), camera = new OrthographicCamera(-18, 18, 18, -18)
  expect(updateSceneryDetail(scene, camera, 900, 0, 36)).toBe(0)
  expect(updateSceneryDetail(scene, camera, 900, .1, 36, "desktop", 2)).toBe(0)
  expect(updateSceneryDetail(scene, camera, 900, .3, 36, "desktop", 2)).toBe(2)
  expect(sceneryDetailStatus(scene)).toMatchObject({ zooming: false, fade: 0 })
  expect(updateSceneryDetail(scene, camera, 900, 1, 36, "desktop", 0)).toBe(0)
})
