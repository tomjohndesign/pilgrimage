import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { DEFAULT_DESIGN, HAIR_STYLES, PERSON_PRESETS, personRecipe, validatePersonDesign, withBodyType } from "./design"
import { createBasePersonRig } from "./rig"
import { populationDesign } from "./population"
import { staffMotion } from "./staff-motion"
import { TRAVELER_TYPES } from "../travelers"

describe("road outfits", () => {
  it("migrates saved designs and rejects malformed accessory options", () => {
    const { hat: _hat, tunicStyle: _style, satchel: _satchel, walkingStick: _stick,
      guitar: _guitar, accentColor: _accent, ...legacy } = DEFAULT_DESIGN
    expect(validatePersonDesign(legacy)).toEqual(DEFAULT_DESIGN)
    expect(validatePersonDesign({ ...legacy, bodyType: "Female" }).hat).toBe("Coif")
    expect(withBodyType(PERSON_PRESETS.Minstrel, "Female").hat).toBe("Minstrel hat")
    for (const change of [{ hat: "Unknown" }, { tunicStyle: "Unknown" }, { guitar: 1 },
      { walkingStick: "yes" }, { satchel: null }, { accentColor: "gold" }]) {
      expect(() => validatePersonDesign({ ...DEFAULT_DESIGN, ...change })).toThrow()
    }
    for (const hairStyle of HAIR_STYLES) expect(validatePersonDesign({ ...legacy, hairStyle }).hairStyle).toBe(hairStyle)
  })

  it("gives male peasants staffs and all minstrels their outfit across both bodies", () => {
    for (let variant = 0; variant < 6; variant++) {
      const peasant = populationDesign(TRAVELER_TYPES.peasant, variant)
      expect(peasant.walkingStick).toBe(variant < 3)
      const minstrel = populationDesign(TRAVELER_TYPES.minstrel, variant)
      expect(minstrel.guitar).toBe(true)
      expect(minstrel.hat).toBe("Minstrel hat")
      expect(minstrel.tunicStyle).toBe("Particolour")
    }
    const crowd = Array.from({ length: 6 }, (_, i) => populationDesign(TRAVELER_TYPES.peasant, i))
    expect(new Set(crowd.map(p => p.hairStyle)).size).toBeGreaterThan(4)
    expect(new Set(crowd.map(p => p.hat)).size).toBe(3)
    expect(new Set(crowd.map(p => p.satchel)).size).toBe(2)
  })

  it("keeps equipment attached through every facing without changing the walking legs", () => {
    const design = { ...PERSON_PRESETS.Minstrel, walkingStick: true, satchel: true }
    const rig = createBasePersonRig(personRecipe(design))
    const plain = createBasePersonRig(personRecipe({ ...design, walkingStick: false, satchel: false, guitar: false }))
    const staff = rig.root.getObjectByName("walking-staff")!
    expect(staff.parent).toBe(rig.sockets.rightHand)
    expect(rig.root.getObjectByName("road-guitar")!.parent).toBe(rig.sockets.back)
    expect(rig.root.getObjectByName("road-satchel")!.parent).toBe(rig.sockets.leftHip)
    expect(rig.root.getObjectByName("road-hat")!.parent).toBe(rig.sockets.head)
    for (let row = 0; row < 8; row++) for (let frame = 0; frame < 20; frame++) {
      rig.view(row); plain.view(row); rig.pose(frame / 20); plain.pose(frame / 20)
      for (const side of ["left", "right"]) {
        expect(rig.root.getObjectByName(`${side}-foot`)!.getWorldPosition(new THREE.Vector3()).toArray())
          .toEqual(plain.root.getObjectByName(`${side}-foot`)!.getWorldPosition(new THREE.Vector3()).toArray())
      }
      const shaft = staff.children[0] as THREE.Mesh<THREE.CylinderGeometry>
      const tip = new THREE.Vector3(0, -shaft.geometry.parameters.height / 2, 0).applyMatrix4(shaft.matrixWorld)
      const expected = rig.root.localToWorld(new THREE.Vector3(...staffMotion(frame / 20, personRecipe(design).body).tip))
      expect(tip.distanceTo(expected)).toBeLessThan(1e-8)
      const hand = rig.root.getObjectByName("right-hand")!.getWorldPosition(new THREE.Vector3())
      expect(hand.y - rig.sockets.rightHand.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(0.026)
      expect(staff.visible).toBe(true)
    }
    for (const clip of ["sleeping", "sitting", "carrying", "praying", "woodcutting", "gathering"] as const) {
      rig.pose(0.3, clip)
      for (const name of ["walking-staff", "road-guitar", "road-satchel"]) expect(rig.root.getObjectByName(name)!.visible).toBe(false)
    }
    rig.pose(0, "idle"); expect(staff.visible).toBe(true)
    expect(rig.root.getObjectByName("road-hat")!.visible).toBe(true)
    rig.pose(0, "sleeping"); expect(rig.root.getObjectByName("road-hat")!.visible).toBe(false)
    rig.dispose(); plain.dispose()
  })

  it("keeps walking-staff tips above ground for every authored peasant body", () => {
    for (let variant = 0; variant < 6; variant++) {
      const rig = createBasePersonRig(personRecipe({ ...populationDesign(TRAVELER_TYPES.peasant, variant), walkingStick: true }))
      const staff = rig.root.getObjectByName("walking-staff")!
      const shaft = staff.children[0] as THREE.Mesh<THREE.CylinderGeometry>
      for (let frame = 0; frame < 20; frame++) {
        rig.pose(frame / 20)
        const tip = new THREE.Vector3(0, -shaft.geometry.parameters.height / 2, 0).applyMatrix4(shaft.matrixWorld)
        expect(tip.y).toBeGreaterThanOrEqual(0)
        expect(tip.distanceTo(new THREE.Vector3(...staffMotion(frame / 20, personRecipe({ ...populationDesign(TRAVELER_TYPES.peasant, variant), walkingStick: true }).body).tip))).toBeLessThan(1e-8)
      }
      rig.dispose()
    }
  })
})
