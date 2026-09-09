import { expect, it } from "vitest"
import * as THREE from "three"
import { DEFAULT_DESIGN } from "../base-person/design"
import { BASE_PERSON } from "../base-person/pose"
import { crossedWalkSupport, personWalkStride, walkContact } from "../base-person/gait"
import { walkingSurface } from "../map/walking-surface"
import { DEFAULT_ELEVATION } from "../map/elevation"
import type { GameMap } from "../map/types"
import { spriteRow } from "../character-assets"
import { spriteGait } from "./sprite-gait"
import { spriteView } from "./sprite-view"
import type { CharacterBatchEntry } from "./character-batch"
import { updateCrowdWalk, type CrowdWalk } from "./crowd-walk"

function fixture() {
  const map: GameMap = { width: 1, depth: 1, tiles: ["grass"], buildings: [],
    elevation: { settings: DEFAULT_ELEVATION, height: [.2], corners: [0, .2, .3, .6], slope: [0], cliffs: [0] } }
  const parent = new THREE.Group(), pose = new THREE.Group(), sprite = new THREE.Sprite(), ids = new THREE.Sprite()
  parent.add(pose); pose.add(sprite, ids)
  parent.userData = { initialized: true, phase: .137, moving: true, playbackRate: 6, heading: 0,
    distance: 0, activity: "walking", carrying: 0, weary: false }
  const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, .1, 100)
  const entry: CharacterBatchEntry = { sprite, ids, ground: { value: new THREE.Vector4() },
    depth: { map: { value: null }, enabled: { value: false } }, id: new THREE.Vector3(1, 0, 0) }
  const walk: CrowdWalk = {
    map, walk: { url: "walk", columns: 40, rows: 8, stillFrame: 0, strides: 2 },
    weary: { url: "weary", columns: 20, rows: 8, stillFrame: 0 }, wearyIndex: 2,
    sources: [new THREE.Texture(), new THREE.Texture(), new THREE.Texture()],
    depths: new Map([[0, new THREE.Texture()], [2, new THREE.Texture()]]),
    rowOffset: 0, size: 1.48, stride: personWalkStride(DEFAULT_DESIGN, 1.48),
    authoredStride: personWalkStride(DEFAULT_DESIGN, 1.48), fps: 18, rig: spriteGait(DEFAULT_DESIGN),
    state: { phase: 0, actionTime: 0, clip: "", seeded: false, plant: null, texture: null, frame: -1, row: -1 },
    inverse: new THREE.Matrix4(), origin: new THREE.Vector3(), contact: new THREE.Vector3(), corrected: new THREE.Vector3(),
    planted: { plant: { key: "", anchor: { x: 0, y: 0, z: 0 }, origin: { x: 0, y: 0, z: 0 } }, offset: { x: 0, y: 0, z: 0 } },
    groundAt: (x, z) => walkingSurface(map, x, z).height,
    key: { action: "", detail: -1, direction: -1, view: "", size: -1, left: "", right: "" }, uv: new THREE.Vector4(),
  }
  return { walk, entry, parent, pose, camera }
}

it.each([1, 2, 3, 6])("keeps the displayed foot planted through turns, slopes, detail changes and pauses at %sx", speed => {
  const { walk, entry, parent, pose, camera } = fixture()
  let phase = parent.userData.phase
  for (let tick = 0; tick < 400; tick++) {
    const dt = [1 / 60, .034, .1][tick % 3], paused = tick % 31 < 3
    const distance = paused ? 0 : dt * speed * walk.stride * 1.15
    const motion = parent.userData
    motion.playbackRate = paused ? 0 : speed; motion.distance = distance
    motion.heading = Math.floor(tick / 29) * .4; motion.weary = tick % 40 >= 20; motion.motionReset = tick % 53 === 0
    parent.position.set(Math.sin(tick * .01) * .2, .3, Math.cos(tick * .01) * .2)
    parent.rotation.y = motion.heading; parent.updateWorldMatrix(true, false)
    camera.position.set(Math.sin(Math.floor(tick / 71)) * 10, 6 + Math.floor(tick / 71), 10)
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
    const previous = walk.state.plant && { key: walk.state.plant.key, anchor: { ...walk.state.plant.anchor } }
    const beforePhase = phase
    phase = (phase + distance / walk.stride) % 2
    const detail = Math.floor(tick / 47) % 3 as 0 | 1 | 2
    expect(updateCrowdWalk(walk, parent, pose, entry, spriteView(camera), detail, dt)).toBe(true)
    expect(walk.state.phase).toBeCloseTo(phase, 12)
    const clip = motion.weary ? walk.weary! : walk.walk, strides = clip.strides ?? 1
    const displayed = entry.sprite.userData.displayedFrame
    const foot = walkContact(displayed / (clip.columns / strides), clip.columns, walk.rig.body, strides)
    const view = spriteView(camera), direction = spriteRow(motion.heading, view.yaw)
    const angle = -direction * Math.PI / 4, scale = walk.size / BASE_PERSON.camera.viewSize
    const localX = (foot.x * Math.cos(angle) + foot.z * Math.sin(angle)) * scale
    const localZ = (-foot.x * Math.sin(angle) + foot.z * Math.cos(angle)) * scale * view.depthScale
    const worldFoot = new THREE.Vector3(localX * view.cosYaw + localZ * view.sinYaw, 0, -localX * view.sinYaw + localZ * view.cosYaw)
      .add(new THREE.Vector3().setFromMatrixPosition(pose.matrixWorld))
    const plant = walk.state.plant!
    expect(worldFoot.x).toBeCloseTo(plant.anchor.x, 12)
    expect(worldFoot.y).toBeCloseTo(plant.anchor.y!, 12)
    expect(worldFoot.z).toBeCloseTo(plant.anchor.z, 12)
    expect(worldFoot.y).toBeCloseTo(walk.groundAt(worldFoot.x, worldFoot.z), 12)
    if (previous?.key === plant.key && !motion.motionReset && !crossedWalkSupport(beforePhase, distance / walk.stride, clip.columns, strides)) {
      expect(plant.anchor).toEqual(previous.anchor)
    }
    expect(entry.color).toBe(walk.sources[motion.weary ? 2 : 0])
    expect(entry.depth.map.value).toBe(walk.depths.get(motion.weary ? 2 : 0))
    expect(entry.uv?.z).toBe(displayed / clip.columns)
    expect(entry.uv?.w).toBe((clip.rows - 1 - direction) / clip.rows)
    const at = new THREE.Vector3().setFromMatrixPosition(pose.matrixWorld), plane = entry.ground.value
    expect(-plane.x * at.x - plane.z * at.z - plane.w).toBeCloseTo(walk.groundAt(at.x, at.z), 12)
  }
})

it("leaves work, carrying, special clips and unsupported depth to the full pose without changing its state", () => {
  const { walk, entry, parent, pose, camera } = fixture()
  for (const motion of [{ moving: false }, { activity: "flying" }, { activity: "performing" },
    { activity: "praying" }, { activity: "procession" }, { activity: "hoisting" }, { carrying: 1 }]) {
    parent.userData = { moving: true, activity: "walking", ...motion }
    const before = { ...walk.state }
    expect(updateCrowdWalk(walk, parent, pose, entry, spriteView(camera), 2, .1)).toBe(false)
    expect(walk.state).toEqual(before)
  }
  parent.userData = { moving: true, activity: "walking" }; walk.depths = new Map()
  expect(updateCrowdWalk(walk, parent, pose, entry, spriteView(camera), 0, .1)).toBe(false)
  expect(walk.state.seeded).toBe(false)
})
