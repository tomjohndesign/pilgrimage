import { describe, expect, it } from "vitest"
import sharp from "sharp"
import * as THREE from "three"
import manifest from "../../../public/textures/transport/v24/manifest.json"
import { BASE_PERSON, PERSON_CLIPS, WALK_CLIP_STRIDES, legPose } from "../base-person/pose"
import { personRecipe } from "../base-person/design"
import { personWalkStride } from "../base-person/gait"
import { populationDesign } from "../base-person/population"
import { TRAVELER_TYPES } from "../travelers"
import { pullingVisual } from "./visual"
import { populationVisual } from "../base-person/population-assets"
import { DRIVER_CLIP } from "./driver"
import { COATS } from "./coats"
import { CARGO, CART, CART_WIDTH_SCALE, SHOP, CART_MODES, TRANSPORT, CART_COLUMNS, ANIMAL_COLUMNS, ANIMAL_PROFILES, ANIMAL_RIG_VERSION, cartColumn, cartLoadout, animalBody, animalStride, animalProfile, animalWalkSpeed, vendorSpeedScale, RIG_TO_WORLD, pullingDesign } from "./assets"
import { animalLeg, animalBoneLengths, animalMotion } from "./animal-pose"
import { createAnimalRig, createCartRig } from "./rig"
import { DEFAULT_WALK_SPEED } from "../base-person/gait"

describe("transport sheet contract", () => {
  it("retains sleeping and other activities while replacing pulling locomotion", () => {
    for (let variant = 0; variant < 6; variant++) {
      const visual = pullingVisual(variant), regular = populationVisual("vendor", variant, null)
      const { wearyWalk, ...rest } = visual.actions
      const { wearyWalk: regularWeary, ...regularRest } = regular.actions
      expect(rest).toEqual(regularRest)
      expect(wearyWalk.url).toContain("/transport/")
      expect(wearyWalk.url).not.toBe(regularWeary?.url)
      expect(wearyWalk.columns).toBe(PERSON_CLIPS.wearyWalk.frames)
      expect(visual.actions.sleeping?.columns).toBeGreaterThan(1)
      expect(visual.walk.url).toContain("/transport/")
      expect(visual.walkStride).toBe(regular.walkStride)
      expect(visual.rowOffset).toBe(regular.rowOffset)
    }
  })
  it("keeps exports on the current rig and the character pixel grid", () => {
    expect(manifest.version).toBe(TRANSPORT.version)
    expect(manifest.cartWidthScale).toBe(CART_WIDTH_SCALE)
    expect(manifest.driverClip).toEqual(DRIVER_CLIP)
    expect(manifest.puller.templateVersion).toBe(BASE_PERSON.version)
    expect(manifest.puller.frames).toBe(PERSON_CLIPS.walk.frames)
    expect(manifest.puller.strides).toBe(WALK_CLIP_STRIDES)
    expect(manifest.puller.designs).toEqual(Array.from({ length: 6 }, (_, i) => pullingDesign(i)))
    expect(manifest.directions).toEqual(BASE_PERSON.directions)
    expect(manifest.cellSize).toBe(TRANSPORT.cellSize)
    expect(manifest.anchor).toEqual(TRANSPORT.anchor)
    expect(manifest.camera.viewSize).toBe(TRANSPORT.viewSize)
    expect(manifest.animalProfiles).toEqual(ANIMAL_PROFILES)
    expect(manifest.animalRigVersion).toBe(ANIMAL_RIG_VERSION)
    expect(manifest.horseVariants).toEqual({ common: { rowOffset: 0 }, noble: { rowOffset: 8 } })
    expect(TRANSPORT.scale / TRANSPORT.cellSize).toBeCloseTo(0.74 / 48, 12)
    expect(TRANSPORT.viewSize / TRANSPORT.cellSize).toBeCloseTo(BASE_PERSON.camera.viewSize / BASE_PERSON.cellSize, 12)
  })

  it("has complete, separate, binary-alpha frames with safe margins", async () => {
    const sheets: Array<[string, number, number, number]> = [
      ...CARGO.flatMap(cargo => CART_MODES.map(mode => [`cart-${cargo}-${mode}`, mode === "shop" ? TRANSPORT.shopFrames : CART_COLUMNS, CART.directions, mode === "shop" ? SHOP.cellSize : CART.cellSize] as [string, number, number, number])),
      ...CARGO.map(cargo => [`cart-${cargo}-shop-mirrored`, TRANSPORT.shopFrames, CART.directions, SHOP.cellSize] as [string, number, number, number]),
      ...(["horse", "donkey"] as const).flatMap(kind => COATS[kind].flatMap(coat => [false, true].map(hitched => [`${kind}-${coat.id}${hitched ? "-hitched" : ""}`, ANIMAL_COLUMNS, kind === "horse" ? 16 : 8, TRANSPORT.cellSize] as [string, number, number, number]))),
      ["puller-walk", manifest.puller.frames, manifest.puller.rows, manifest.puller.cellSize], ["puller-wearyWalk", PERSON_CLIPS.wearyWalk.frames, manifest.puller.rows, manifest.puller.cellSize], ["puller-idle", 1, manifest.puller.rows, manifest.puller.cellSize],
      ["merchant-setup", manifest.merchantSetupFrames, manifest.puller.rows, manifest.puller.cellSize],
      ["merchant-selling", manifest.keeperColumns, manifest.puller.rows, manifest.puller.cellSize],
      ...CARGO.map(cargo => [`cart-${cargo}-driver`, DRIVER_CLIP.variants, CART.directions, CART.cellSize] as [string, number, number, number]),
      ...CARGO.flatMap(cargo => ["", "-mirrored"].map(mirror => [`cart-${cargo}-shop-small${mirror}`, TRANSPORT.shopFrames, CART.directions, SHOP.cellSize] as [string, number, number, number])),
    ]
    for (const [name, columns, rows, size] of sheets) {
      const { data, info } = await sharp(`public/textures/transport/${TRANSPORT.version}/${name}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      expect([info.width, info.height]).toEqual([columns * size, rows * size])
      const occupied = new Set<number>()
      let invalid = 0, cropped = 0
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const alpha = data[(y * info.width + x) * 4 + 3]
        if (alpha !== 0 && alpha !== 255) invalid++
        if (!alpha) continue
        occupied.add(Math.floor(y / size) * columns + Math.floor(x / size))
        if (Math.min(x % size, y % size, size - 1 - x % size, size - 1 - y % size) < 4) cropped++
      }
      expect({ name, invalid, cropped, frames: occupied.size }).toEqual({ name, invalid: 0, cropped: 0, frames: columns * rows })
    }
  }, 60000)

  it("keeps longer rolling loops in separate, GPU-sized cargo sheets", () => {
    expect(TRANSPORT.wheelFrames).toBeGreaterThanOrEqual(24)
    expect(CART_COLUMNS * CART.cellSize).toBeLessThanOrEqual(4096)
    for (const cargo of CARGO) for (const mode of CART_MODES) for (const phase of [-0.2, 0, 0.25, 0.999, 1, 18.1]) {
      const column = cartColumn(cargo, mode, phase)
      expect(column).toBeGreaterThanOrEqual(0)
      expect(column).toBeLessThan(mode === "shop" ? TRANSPORT.shopFrames : TRANSPORT.wheelFrames)
    }
    expect(new Set(Array.from({ length: 48 }, (_, id) => { const { cargo, puller } = cartLoadout(id); return `${cargo}:${puller}` })).size).toBe(12)
    expect(manifest.coats).toEqual(COATS)
    expect(manifest.shop.footprint).toEqual([3, 2])
    expect(manifest.animalClips.graze.frames).toBeGreaterThan(1)
  })

})

describe("transport ground contacts", () => {
  it("walks with four separate footfalls and two or three supporting hooves", () => {
    // Lateral walk sequence: left fore, right hind, right fore, left hind.
    // https://horses.extension.org/horse-walk/
    const legs = [["left", false], ["right", true], ["right", false], ["left", true]] as const
    for (const [kind, variant] of [["donkey", "common"], ["horse", "common"], ["horse", "noble"]] as const) {
      for (let beat = 0; beat < 4; beat++) {
        const phase = beat / 4
        const landing = legs.filter(([side, rear]) => !animalLeg(kind, side, rear, phase - 0.001, true, variant).planted && animalLeg(kind, side, rear, phase + 0.001, true, variant).planted)
        expect(landing).toEqual([legs[beat]])
      }
      for (let f = 0; f < 100; f++) {
        const supports = legs.filter(([side, rear]) => animalLeg(kind, side, rear, f / 100, true, variant).planted).length
        expect(supports).toBeGreaterThanOrEqual(2)
        expect(supports).toBeLessThanOrEqual(3)
      }
    }
  })

  it("folds swinging hooves without penetrating the ground or tipping planted soles", () => {
    for (const [kind, variant] of [["donkey", "common"], ["horse", "common"], ["horse", "noble"]] as const) {
      const rig = createAnimalRig(kind, variant)
      try {
        for (let f = 0; f <= 40; f++) {
          const phase = f / 40
          rig.pose(phase, true); rig.root.updateMatrixWorld(true)
          for (const rear of [false, true]) for (const side of ["left", "right"] as const) {
            const pose = animalLeg(kind, side, rear, phase, true, variant)
            const hoof = rig.root.getObjectByName(`${side}-${rear ? "hind" : "fore"}-hoof`) as THREE.Mesh
            const positions = hoof.geometry.attributes.position
            let floor = Infinity
            for (let i = 0; i < positions.count; i++) floor = Math.min(floor, new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(hoof.matrixWorld).y)
            expect(floor).toBeGreaterThanOrEqual(-1e-7)
            if (pose.planted) {
              expect(hoof.rotation.x).toBe(0)
              expect(floor).toBeCloseTo(0, 7)
            } else expect(hoof.rotation.x).toBeGreaterThan(0)
          }
        }
      } finally { rig.dispose() }
    }
  })

  it("preserves every bone length, planted hoof and loop closure across all three animal profiles", () => {
    const length = (a: number[], b: number[]) => Math.hypot(...a.map((x, i) => x - b[i]))
    for (const [kind, variant] of [["donkey", "common"], ["horse", "common"], ["horse", "noble"]] as const) for (const rear of [false, true]) for (const side of ["left", "right"] as const) {
      const body = animalBody(kind, variant), bones = animalBoneLengths(kind, rear, variant)
      for (let f = 0; f <= 100; f++) {
        const p = animalLeg(kind, side, rear, f / 100, true, variant)
        expect(length(p.hip, p.upperJoint)).toBeCloseTo(bones.upper, 10)
        expect(length(p.upperJoint, p.knee)).toBeCloseTo(bones.middle, 10)
        expect(length(p.knee, p.ankle)).toBeCloseTo(bones.cannon, 10)
        if (p.planted) {
          expect(p.ankle[1]).toBe(body.ankleHeight)
          if (!rear) {
            const upper = new THREE.Vector3(...p.upperJoint).sub(new THREE.Vector3(...p.knee)).normalize()
            const lower = new THREE.Vector3(...p.ankle).sub(new THREE.Vector3(...p.knee)).normalize()
            expect(upper.angleTo(lower) * 180 / Math.PI).toBeGreaterThan(168)
          }
        }
      }
      const first = animalLeg(kind, side, rear, 0, true, variant), last = animalLeg(kind, side, rear, 1, true, variant)
      for (const joint of ["hip", "upperJoint", "knee", "ankle"] as const) first[joint].forEach((v, i) => expect(v).toBeCloseTo(last[joint][i], 10))
      for (const scale of [1, 1.5, 2]) {
        // During stance, backwards hoof displacement cancels forward world travel.
        const a = animalLeg(kind, side, rear, (side === "right" ? 0.5 : 0) - (rear ? 0.25 : 0) + 0.1, true, variant)
        const b = animalLeg(kind, side, rear, (side === "right" ? 0.5 : 0) - (rear ? 0.25 : 0) + 0.2, true, variant)
        expect((b.ankle[2] - a.ankle[2]) * RIG_TO_WORLD * scale + animalStride(kind, scale, variant) * 0.1).toBeCloseTo(0, 10)
      }
    }
  })

  it("stands on extended forelegs instead of permanently crouching", () => {
    for (const [kind, variant] of [["donkey", "common"], ["horse", "common"], ["horse", "noble"]] as const) {
      const p = animalLeg(kind, "left", false, 0, false, variant)
      const upper = new THREE.Vector3(...p.upperJoint).sub(new THREE.Vector3(...p.knee)).normalize()
      const lower = new THREE.Vector3(...p.ankle).sub(new THREE.Vector3(...p.knee)).normalize()
      expect(upper.angleTo(lower) * 180 / Math.PI).toBeGreaterThan(168)
    }
  })

  it("moves the shaped trunk, neck and head as well as the legs, and closes the cycle", () => {
    for (const [kind, variant] of [["donkey", "common"], ["horse", "common"], ["horse", "noble"]] as const) for (const hitched of [false, true]) {
      const rig = createAnimalRig(kind, variant, undefined, hitched)
      try {
        let spheres = 0
        rig.root.traverse(o => { if (o instanceof THREE.Mesh && o.geometry.type === "SphereGeometry") spheres++ })
        expect(spheres).toBe(0)
        const trunk = rig.root.getObjectByName("ribcage-and-pelvis") as THREE.Mesh
        const head = rig.root.getObjectByName("articulated-head")!
        const snapshot = (phase: number) => {
          rig.pose(phase, true); rig.root.updateMatrixWorld(true)
          return { torso: Array.from(trunk.geometry.attributes.position.array), head: head.matrixWorld.elements.slice() }
        }
        const start = snapshot(0), next = snapshot(0.3), end = snapshot(1)
        expect(next.torso).not.toEqual(start.torso)
        expect(next.head).not.toEqual(start.head)
        for (const key of ["torso", "head"] as const) start[key].forEach((n, i) => expect(end[key][i]).toBeCloseTo(n, 6))
        expect(animalMotion(kind, 0.2, true, variant).bob).not.toBe(animalMotion(kind, 0.45, true, variant).bob)
      } finally { rig.dispose() }
    }
  })

  it("gives the donkey a slower plod and slows the convoy without sliding feet", () => {
    expect(animalProfile("donkey").cyclesPerSecond).toBeLessThan(animalProfile("horse", "common").cyclesPerSecond)
    expect(animalProfile("horse", "common").cyclesPerSecond).toBeLessThan(animalProfile("horse", "noble").cyclesPerSecond)
    for (const scale of [1, 1.5, 2]) {
      expect(animalWalkSpeed("donkey", scale) / animalStride("donkey", scale)).toBeCloseTo(0.82)
      const id = Array.from({ length: 32 }, (_, i) => i).find(i => cartLoadout(i).puller === "donkey")!
      expect(vendorSpeedScale(id, scale, 2) * DEFAULT_WALK_SPEED).toBeCloseTo(animalWalkSpeed("donkey", scale))
      expect(vendorSpeedScale(id, scale, 0.1)).toBeCloseTo(0.1 / 1.15)
    }
  })

  it("changes only the arms of each pulling outfit, preserving population stride and foot poses", () => {
    for (let variant = 0; variant < 6; variant++) {
      const regular = populationDesign(TRAVELER_TYPES.vendor, variant), puller = pullingDesign(variant)
      expect(personWalkStride(puller)).toBe(personWalkStride(regular))
      for (let f = 0; f < BASE_PERSON.framesPerCycle; f++) for (const side of ["left", "right"] as const) {
        expect(legPose(side, f / BASE_PERSON.framesPerCycle, "walk", personRecipe(puller).body)).toEqual(legPose(side, f / BASE_PERSON.framesPerCycle, "walk", personRecipe(regular).body))
      }
    }
  })
})

it("has solid circular wheel faces, with no spoke openings", () => {
  const rig = createCartRig("produce", "hand")
  try {
    rig.pose(0); rig.root.updateMatrixWorld(true)
    const wheel = rig.root.getObjectByName("solid-wood-wheel")!
    const origin = wheel.getWorldPosition(new THREE.Vector3()), ray = new THREE.Raycaster()
    // Offset the grid from the triangle fan's exact shared edges.
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
      const y = (i + 0.21) * 0.09, z = (j + 0.17) * 0.09
      if (Math.hypot(y, z) > TRANSPORT.wheelRadius * 0.9) continue
      ray.set(new THREE.Vector3(origin.x + 1, origin.y + y, origin.z + z), new THREE.Vector3(-1, 0, 0))
      expect(ray.intersectObject(wheel, true).length, `wheel face at ${y}, ${z}`).toBeGreaterThan(0)
    }
    ray.set(new THREE.Vector3(origin.x + 1, origin.y + TRANSPORT.wheelRadius + 0.04, origin.z), new THREE.Vector3(-1, 0, 0))
    expect(ray.intersectObject(wheel, true)).toHaveLength(0)
  } finally { rig.dispose() }
})

it("keeps draught leaders with the animal through independent cart turns, removing them when unhitched", () => {
  for (const kind of ["horse", "donkey"] as const) {
    const animal = createAnimalRig(kind, "common", undefined, true), loose = createAnimalRig(kind)
    const cart = createCartRig("produce", kind)
    try {
      animal.pose(0, false); loose.pose(0, false); cart.pose(0)
      const shafts = animal.root.getObjectByName("draught-shafts")!
      expect(shafts).toBeDefined()
      expect(loose.root.getObjectByName("draught-shafts")).toBeUndefined()
      // No duplicate leaders extending beyond the cart's front footboard.
      expect(new THREE.Box3().setFromObject(cart.root).max.z).toBeLessThan(2)
      const rear = new THREE.Vector3(0, 0.6, 0.5)
      const start = shafts.localToWorld(rear.clone())
      cart.root.rotation.y = Math.PI / 2
      animal.pose(0.3, true)
      expect(shafts.localToWorld(rear.clone()).distanceTo(start)).toBeLessThan(1e-8)
      animal.root.rotation.y = Math.PI / 2
      const turned = shafts.localToWorld(rear.clone())
      expect(turned.x).toBeCloseTo(start.z, 8)
      expect(turned.z).toBeCloseTo(-start.x, 8)
    } finally { animal.dispose(); loose.dispose(); cart.dispose() }
  }
  const hand = createCartRig("produce", "hand")
  try { expect(new THREE.Box3().setFromObject(hand.root).max.z).toBeGreaterThan(2.18) }
  finally { hand.dispose() }
})
