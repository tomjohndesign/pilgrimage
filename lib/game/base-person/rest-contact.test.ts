import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { PERSON_PRESETS, personRecipe } from "./design"
import { BASE_PERSON, PERSON_CLIPS } from "./pose"
import { createBasePersonRig } from "./rig"
import { POPULATION_PROFILES, populationDesign } from "./population"
import { TRAVELER_TYPES } from "../travelers"
import { restContacts, restContactOrigin } from "./rest-contact"
import { structureParts } from "../building-art/structure"
import { BUILD_CATALOG } from "../balance"
import { BASE_CHARACTER_SCALE, PERSON_SPRITE_SCALE } from "./gait"

const designs = [...POPULATION_PROFILES.map((_, variant) => populationDesign(TRAVELER_TYPES.peasant, variant)), PERSON_PRESETS.Monk]

describe("furniture pose registration", () => {
  it("fits the reclining population on the authored beds at the shared character scale", () => {
    const beds = ["house", "shelter", "monk-shelter"].flatMap(type => {
      const building = BUILD_CATALOG.find(b => b.id === type)!
      return structureParts({ ...building, buildType: type }).filter(part => part.name.startsWith("straw-bed-"))
    })
    expect(beds.length).toBeGreaterThan(0)
    for (const design of designs) {
      const rig = createBasePersonRig(personRecipe(design))
      try {
        rig.pose(0, "sleeping")
        rig.root.scale.setScalar(PERSON_SPRITE_SCALE * BASE_CHARACTER_SCALE / BASE_PERSON.camera.viewSize)
        rig.root.updateMatrixWorld(true)
        const bounds = new THREE.Box3()
        for (const name of [design.garment === "Robe" ? "robe" : design.bodyType === "Female" ? "sleeveless-dress" : "shirt", "head-shape", "left-foot", "right-foot"]) {
          bounds.expandByObject(rig.root.getObjectByName(name)!, true)
        }
        for (const bed of beds) {
          expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(bed.size![0])
          expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(bed.size![2])
        }
      } finally { rig.dispose() }
    }
  })

  it("rests every population profile and monk outfit on the surface throughout both animations", () => {
    const pitch = Math.tan(BASE_PERSON.camera.pitch * Math.PI / 180)
    for (const design of designs) {
      const rig = createBasePersonRig(personRecipe(design))
      try {
        for (const clip of ["sitting", "sleeping"] as const) {
          const frames = PERSON_CLIPS[clip].frames
          const contacts = restContacts(design, clip, frames)
          for (let frame = 0; frame < frames; frame++) {
            const scale = .427, target = { x: 3, y: .3, z: -2 }
            const origin = restContactOrigin(target, contacts[frame], 0, 0, pitch, scale)
            rig.root.position.set(origin.x, origin.y, origin.z)
            rig.root.scale.setScalar(scale)
            rig.pose(frame / frames, clip)
            rig.root.updateMatrixWorld(true)
            const torso = rig.root.getObjectByName(design.garment === "Robe" ? "robe" : design.bodyType === "Female" ? "sleeveless-dress" : "shirt")!
            expect(new THREE.Box3().setFromObject(torso, true).min.y).toBeCloseTo(target.y, 6)
            if (clip === "sitting") {
              const hips = rig.root.getObjectByName("pelvis")!.getWorldPosition(new THREE.Vector3())
              expect(hips.x).toBeCloseTo(target.x, 6)
              expect(hips.z).toBeCloseTo(target.z, 6)
            }
          }
        }
      } finally { rig.dispose() }
    }
  })

  it("keeps the baked contact's screen position and depth on rotated furniture at different zooms and pitches", () => {
    const bakedPitch = BASE_PERSON.camera.pitch * Math.PI / 180
    const point: [number, number, number] = [.08, .16, -.22]
    for (const scale of [.28, .427, .7]) for (const yaw of [0, .23, Math.PI / 2, Math.PI]) {
      for (const pitch of [.45, Math.tan(bakedPitch), 1.3]) for (let row = 0; row < 8; row++) {
        const target = new THREE.Vector3(3, .3, -2)
        const origin = restContactOrigin(target, point, row, yaw, pitch, scale)
        const camera = new THREE.OrthographicCamera(-3, 3, 3, -3, .1, 30)
        camera.position.set(10 * Math.sin(yaw), 10 * pitch, 10 * Math.cos(yaw))
        camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true)
        // Sprite pixels and depth are camera-relative baked coordinates.
        const baked = new THREE.Vector3(...point).multiplyScalar(scale)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), -row * Math.PI / 4)
          .applyAxisAngle(new THREE.Vector3(1, 0, 0), bakedPitch)
        const registered = new THREE.Vector3(origin.x, origin.y, origin.z).applyMatrix4(camera.matrixWorldInverse).add(baked)
        const expected = target.clone().applyMatrix4(camera.matrixWorldInverse)
        expect(registered.distanceTo(expected)).toBeLessThan(1e-8)
      }
    }
  })

  it("uses the selected clip's frame count and caches contacts only for the same design", () => {
    const design = PERSON_PRESETS.Stout
    const contacts = restContacts(design, "sleeping", 12)
    expect(contacts).toHaveLength(12)
    expect(restContacts(design, "sleeping", 12)).toBe(contacts)
    expect(restContacts(design, "sleeping", 16)).toHaveLength(16)
    expect(restContacts({ ...design, build: .8 }, "sleeping", 12)).not.toEqual(contacts)
  })
})
