import { describe, expect, it } from "vitest"
import sharp from "sharp"
import * as THREE from "three"
import manifest from "../../../public/textures/knights/v7/manifest.json"
import { BASE_PERSON, PERSON_CLIPS } from "../base-person/pose"
import { personRecipe } from "../base-person/design"
import { personWalkStride } from "../base-person/gait"
import { createBasePersonRig } from "../base-person/rig"
import { COATS } from "../transport/coats"
import { TRANSPORT, ANIMAL_RIG_VERSION, animalProfile } from "../transport/assets"
import { KNIGHT, knightDesign, squireDesign } from "./design"
import { equipKnight, seatKnight } from "./rig"
import { equipSquire } from "./squire-rig"
import { knightVisual, squireVisual } from "./visual"

describe("knight assets", () => {
  it("uses the current shared template, authored gait and uniform pixels", () => {
    expect(manifest.templateVersion).toBe(BASE_PERSON.version)
    expect(manifest.version).toBe(KNIGHT.version)
    expect(manifest.designs).toEqual(Array.from({ length: KNIGHT.variants }, (_, i) => knightDesign(i)))
    expect(manifest.scale / manifest.cellSize).toBeCloseTo(0.74 / 48, 12)
    expect(manifest.camera.viewSize / manifest.cellSize).toBeCloseTo(BASE_PERSON.camera.viewSize / BASE_PERSON.cellSize, 12)
    expect(manifest.camera.viewSize).toBe(TRANSPORT.viewSize)
    expect(manifest.animalRigVersion).toBe(ANIMAL_RIG_VERSION)
    expect(manifest.horseProfile).toEqual(animalProfile("horse", "noble"))
    const attendant = squireVisual()
    expect(manifest.squire.design).toEqual(squireDesign())
    expect(attendant.walkStride).toBe(personWalkStride(squireDesign()))
    expect(attendant.walk.columns).toBe(PERSON_CLIPS.walk.frames)
    expect(attendant.idle.columns).toBe(1)
    expect(attendant.scale / manifest.squire.cellSize).toBeCloseTo(manifest.scale / manifest.cellSize, 12)
    for (let variant = 0; variant < 6; variant++) {
      const visual = knightVisual(variant)
      expect(visual.walkStride).toBe(personWalkStride(knightDesign(variant)))
      expect(visual.walk.columns).toBe(PERSON_CLIPS.walk.frames)
      expect(visual.actions.praying.columns).toBe(PERSON_CLIPS.praying.frames)
      expect(visual.actions.seatedPrayer.columns).toBe(PERSON_CLIPS.seatedPrayer.frames)
    }
  })

  it("carries the shield, cloak and provisions through the walk without changing grounded legs", () => {
    const rig = createBasePersonRig(personRecipe(squireDesign())), gear = equipSquire(rig)
    try {
      const shield = rig.root.getObjectByName("carried-kite-shield")!
      const cloak = rig.root.getObjectByName("rolled-wool-cloak")!
      const satchel = rig.root.getObjectByName("squire-supply-satchel")!
      expect(shield.parent).toBe(rig.sockets.leftHand)
      expect(cloak.parent).toBe(rig.sockets.back)
      expect(satchel.parent).toBe(rig.sockets.rightHip)
      const snapshots: number[][] = []
      for (let f = 0; f <= 20; f++) {
        rig.pose(f / 20, "walk")
        const before = rig.joints()
        gear.pose()
        const after = rig.joints()
        for (const joint of ["leftHip", "rightHip", "leftKnee", "rightKnee", "leftFoot", "rightFoot"] as const) expect(after[joint]).toEqual(before[joint])
        expect(new THREE.Box3().setFromObject(shield).min.y).toBeGreaterThan(0.1)
        expect(satchel.visible).toBe(true)
        snapshots.push([shield, cloak, satchel].flatMap(item => item.getWorldPosition(new THREE.Vector3()).toArray()))
      }
      expect(snapshots[5]).not.toEqual(snapshots[0])
      snapshots[0].forEach((value, i) => expect(snapshots[20][i]).toBeCloseTo(value, 10))
      rig.pose(0, "idle"); gear.pose()
      expect(satchel.visible).toBe(true)
      expect(new THREE.Box3().setFromObject(shield).min.y).toBeGreaterThan(0.1)
    } finally { gear.dispose(); rig.dispose() }
  })

  it("keeps armour attached without changing walking joints; mounted legs retain their bone lengths", () => {
    for (let variant = 0; variant < KNIGHT.variants; variant++) {
      const recipe = personRecipe(knightDesign(variant)), rig = createBasePersonRig(recipe)
      rig.pose(0.25, "walk")
      const before = rig.joints(), gear = equipKnight(rig, variant)
      expect(rig.joints()).toEqual(before)
      expect(rig.root.getObjectByName("nasal-helmet")?.parent?.name).toBe("head-pivot")
      expect(rig.root.getObjectByName("sheathed-sword")?.parent).toBe(rig.sockets.leftHip)
      for (let f = 0; f <= 20; f++) {
        seatKnight(rig, variant, f / 20, true)
        const joints = rig.joints()
        for (const side of ["left", "right"] as const) {
          const length = (a: number[], b: number[]) => new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b))
          expect(length(joints[`${side}Hip`]!, joints[`${side}Knee`]!)).toBeCloseTo(recipe.body.thighLength, 8)
          expect(length(joints[`${side}Knee`]!, joints[`${side}Foot`]!)).toBeCloseTo(recipe.body.shinLength, 8)
          expect(joints[`${side}Foot`]![1]).toBeGreaterThan(1)
        }
      }
      gear.dispose(); rig.dispose()
    }
  })

  it("exports every direction and action with binary alpha and safe margins", async () => {
    const sheets: [string, number, number, number][] = [
      ...Object.entries(PERSON_CLIPS).map(([name, clip]) => [`knight-${name}`, clip.frames, KNIGHT.variants * 8, BASE_PERSON.cellSize] as [string, number, number, number]),
      ...COATS.horse.flatMap(coat => ["mounted", "saddled"].map(kind => [`${kind}-${coat.id}`, KNIGHT.frames + 1, kind === "mounted" ? KNIGHT.variants * 8 : 8, KNIGHT.cellSize] as [string, number, number, number])),
      ...(["walk", "idle"] as const).map(clip => [`squire-${clip}`, manifest.squire.frameCounts[clip], manifest.squire.rows, manifest.squire.cellSize] as [string, number, number, number]),
    ]
    for (const [name, columns, rows, size] of sheets) {
      const { data, info } = await sharp(`public/textures/knights/${KNIGHT.version}/${name}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      expect([info.width, info.height]).toEqual([columns * size, rows * size])
      const occupied = new Set<number>(); let invalid = 0, cropped = 0
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
})
