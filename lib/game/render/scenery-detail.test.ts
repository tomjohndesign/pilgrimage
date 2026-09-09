import { expect, it } from "vitest"
import * as THREE from "three"
import { buildingDetail, chooseSceneryDetail, updateSceneryDetail, sceneryDetailStatus, sceneryCloseOpacity, sceneryFadeProgress, scenerySourceVisible, treeEdgeOpacity } from "./scenery-detail"
import { indexFlatGeometry } from "./flat-geometry"
import { StaticInstanceBatch } from "./static-instances"
import { coarseCrown } from "../trees/coarse-crown"

it("restores full detail on zoom in and does not oscillate near either threshold", () => {
  let detail = chooseSceneryDetail(8, 0)
  expect(detail).toBe(2)
  for (const density of [9, 10, 9, 10.9]) detail = chooseSceneryDetail(density, detail)
  expect(detail).toBe(2)
  detail = chooseSceneryDetail(13, detail)
  expect(detail).toBe(1)
  for (const density of [15, 16, 17, 18]) detail = chooseSceneryDetail(density, detail)
  expect(detail).toBe(1)
  expect(chooseSceneryDetail(22, detail)).toBe(0)
})

it("drops detail 15 percent earlier on desktop and more aggressively on coarse-pointer mobile views", () => {
  expect(chooseSceneryDetail(18.3, 0)).toBe(1)
  expect(chooseSceneryDetail(18.5, 0)).toBe(0)
  expect(chooseSceneryDetail(10.3, 1)).toBe(2)
  expect(chooseSceneryDetail(10.4, 1)).toBe(1)
  expect(chooseSceneryDetail(25.5, 0, "mobile")).toBe(1)
  expect(chooseSceneryDetail(25.7, 0, "mobile")).toBe(0)
  expect(chooseSceneryDetail(14.3, 1, "mobile")).toBe(2)
  expect(chooseSceneryDetail(14.5, 1, "mobile")).toBe(1)
  expect(chooseSceneryDetail(17.5, 2, "mobile")).toBe(2)
  expect(chooseSceneryDetail(30.5, 1, "mobile")).toBe(0)
})

it("keeps building zoom thresholds independent of FPS pressure, including on initial load", () => {
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-22.5, 22.5, 22.5, -22.5)
  expect(buildingDetail(scene)).toBe(0)
  // 20 pixels/unit is close when entering from full detail, but would stay
  // simplified if buildings inherited the performance level's hysteresis.
  updateSceneryDetail(scene, camera, 900, 0, 45, "desktop", 2)
  updateSceneryDetail(scene, camera, 900, .3, 45, "desktop", 2)
  expect(buildingDetail(scene)).toBe(0)
  expect(sceneryDetailStatus(scene)?.current).toBe(2)
})

it("still closes and reopens interiors with settled zoom while FPS detail stays reduced", () => {
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-18, 18, 18, -18)
  const update = (view: number, time: number) => {
    camera.top = view / 2; camera.bottom = -view / 2
    updateSceneryDetail(scene, camera, 900, time, view, "desktop", 2)
    expect(sceneryDetailStatus(scene)?.current).toBe(2)
    return buildingDetail(scene)
  }
  expect(update(36, 0)).toBe(0)
  expect(update(60, .3)).toBe(0)
  expect(update(60, .5)).toBe(1)
  expect(update(140, .8)).toBe(1)
  expect(update(140, 1)).toBe(2)
  expect(update(36, 1.3)).toBe(2)
  expect(update(36, 1.5)).toBe(0)
})

it("defers layer changes until zoom input and the camera tween settle, including reversals", () => {
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-18, 18, 18, -18)
  let time = 0
  const update = (view: number, target: number, dt = 1 / 60) => {
    time += dt; camera.top = view / 2; camera.bottom = -view / 2
    return updateSceneryDetail(scene, camera, 900, time, target)
  }
  expect(update(36, 36)).toBe(0)
  // Cross both thresholds, then reverse before the gesture ends.
  for (const view of [50, 80, 110, 140, 110, 80, 50, 36]) expect(update(view, view + 2, .1)).toBe(0)
  expect(update(36, 36, .1)).toBe(0)
  expect(update(36, 36, .2)).toBe(0)
  // A pause in wheel events does not commit while the camera is still easing.
  for (const view of [60, 90, 125, 138, 139.8]) expect(update(view, 140, .25)).toBe(0)
  expect(sceneryDetailStatus(scene)).toMatchObject({ current: 0, pending: 2, zooming: true })
  expect(update(140, 140)).toBe(0)
  expect(update(140, 140, .2)).toBe(2)
  expect(sceneryFadeProgress(scene)).toBe(0)
  expect(sceneryCloseOpacity(scene)).toBe(1)
  update(140, 140, .12)
  expect(sceneryFadeProgress(scene)).toBeCloseTo(.5)
  expect(sceneryCloseOpacity(scene)).toBeCloseTo(.5)
  expect(sceneryDetailStatus(scene)).toMatchObject({ current: 2, pending: 2, zooming: false })
  // Zooming back in keeps the resident coarse layers until the final view.
  for (const view of [120, 85, 60, 36]) {
    expect(update(view, 36, .1)).toBe(2)
    expect(sceneryFadeProgress(scene)).toBe(1)
  }
  expect(update(36, 36, .2)).toBe(0)
  // Scene-local state does not delay initial loading at a wide view.
  camera.top = 70; camera.bottom = -70
  expect(updateSceneryDetail(new THREE.Scene(), camera, 900, 0, 140)).toBe(2)
})

it("switches resident scenery geometry without changing transforms, IDs or the picking source", () => {
  const geometry = indexFlatGeometry(new THREE.IcosahedronGeometry(1, 1))
  const material = new THREE.MeshBasicMaterial(), source = new THREE.InstancedMesh(geometry, material, 1)
  source.setMatrixAt(0, new THREE.Matrix4().makeTranslation(3, 4, 5))
  source.setColorAt(0, new THREE.Color().setRGB(3 / 255, 0, 0))
  source.userData.sceneryDetail = "canopy"
  const batch = new StaticInstanceBatch()
  batch.write([source])
  const full = batch.mesh!.geometry, matrices = batch.mesh!.instanceMatrix, colors = batch.mesh!.instanceColor
  for (let i = 0; i < 3; i++) {
    batch.setSimplified(true)
    expect(batch.mesh!.geometry.index!.count).toBe(60)
    expect(batch.mesh!.instanceMatrix).toBe(matrices)
    expect(batch.mesh!.instanceColor).toBe(colors)
    expect(source.geometry).toBe(geometry)
    batch.setSimplified(false)
    expect(batch.mesh!.geometry).toBe(full)
    expect(full.index!.count).toBe(240)
  }
  expect(scenerySourceVisible(source, 1)).toBe(true)
  expect(scenerySourceVisible(source, 2)).toBe(false)
  source.userData.sceneryDetail = "coarse"
  expect(scenerySourceVisible(source, 1)).toBe(false)
  expect(scenerySourceVisible(source, 2)).toBe(true)
  batch.dispose(); source.dispose(); geometry.dispose(); material.dispose()
})

it("preserves the canopy's spread and height when combining rotated lobes", () => {
  const parts = [
    { x: -1, y: 2, z: 0, rx: 2, ry: 1, rz: 1, yaw: Math.PI / 2 },
    { x: 1, y: 3, z: 1, rx: 1, ry: 2, rz: 1, yaw: 0 },
  ]
  expect(coarseCrown(parts)).toEqual({ x: 0, y: 3, z: 0, rx: 2, ry: 2, rz: 2, yaw: 0 })
  expect(coarseCrown([parts[0]])).toEqual(parts[0])
})

it("fades only the tree ink using the actual display camera", () => {
  const camera = new THREE.OrthographicCamera(-70, 70, 70, -70)
  expect(treeEdgeOpacity(camera, 900)).toBe(0)
  camera.zoom = 4
  expect(treeEdgeOpacity(camera, 900)).toBe(1)
})
