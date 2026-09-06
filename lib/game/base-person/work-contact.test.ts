import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { PERSON_PRESETS, personRecipe } from "./design"
import { BASE_PERSON, PERSON_CLIPS } from "./pose"
import { POPULATION_PROFILES, populationDesign } from "./population"
import { createBasePersonRig } from "./rig"
import { woodcuttingProfile } from "./woodcutting"
import { workContacts, workContactOffset, workContactOrigin, trunkContact } from "./work-contact"
import { TRAVELER_TYPES } from "../travelers"
import { generateTree, TREE_SPECIES, TREE_SPECIES_ORDER } from "../trees/species"
import { makeRng } from "../rng"
import { PERSON_SPRITE_SCALE, BASE_CHARACTER_SCALE } from "./gait"
import { EDGE_SIZE_SCALE } from "../trees/placement"

const designs = [...POPULATION_PROFILES.map((_, variant) => populationDesign(TRAVELER_TYPES.peasant, variant)), PERSON_PRESETS.Monk]

describe("world chopping contacts", () => {
  it("puts the rendered axe and upright log on the same fixed tree for every facing and body profile", () => {
    const pitch = Math.tan(BASE_PERSON.camera.pitch * Math.PI / 180)
    for (const design of designs) {
      const contacts = workContacts(design)
      const rig = createBasePersonRig(personRecipe(design))
      try {
        for (const clip of ["treeFelling", "woodcutting"] as const) {
          for (const scale of [0.28, 0.427, 0.7]) for (const yaw of [0, 0.23, Math.PI / 2, Math.PI]) for (let row = 0; row < 8; row++) {
            const offset = workContactOffset(contacts[clip], row, yaw, pitch, scale)
            rig.root.position.set(3 - offset.x, 0.4, -2 - offset.z)
            rig.root.scale.setScalar(scale)
            rig.view(row)
            rig.root.rotation.y += yaw
            rig.pose(clip === "treeFelling" ? Math.ceil(woodcuttingProfile(design).strikeEnd * PERSON_CLIPS.treeFelling.frames) / PERSON_CLIPS.treeFelling.frames : 0, clip)
            rig.root.updateMatrixWorld(true)
            const point = clip === "treeFelling"
              ? rig.root.getObjectByName("axe-head")!.localToWorld(new THREE.Vector3(0, 0, 0.2))
              : rig.root.getObjectByName("woodcutting-log")!.getWorldPosition(new THREE.Vector3())
            expect(point.x).toBeCloseTo(3, 6)
            expect(point.z).toBeCloseTo(-2, 6)
            if (clip === "woodcutting") expect(point.y).toBeCloseTo(0.4 + 0.32 * scale, 6)
            expect(rig.root.getObjectByName("chopping-block")!.visible).toBe(false)
          }
        }
      } finally { rig.dispose() }
    }
  })

  it("keeps both feet grounded and the log registered on sloping ground", () => {
    const pitch = Math.tan(BASE_PERSON.camera.pitch * Math.PI / 180), scale = 0.427
    const ground = (x: number, z: number) => 0.3 + x * 0.08 - z * 0.05
    const target = { x: 3, y: ground(3, -2), z: -2 }
    const design = designs[0], rig = createBasePersonRig(personRecipe(design))
    const point = workContacts(design).woodcutting
    try {
      for (const yaw of [0, 0.2, Math.PI / 2, Math.PI, Math.PI * 1.5]) for (let row = 0; row < 8; row++) {
        const origin = workContactOrigin(target, point, row, yaw, pitch, scale, ground)
        rig.root.position.set(origin.x, origin.y, origin.z)
        rig.root.scale.setScalar(scale); rig.view(row); rig.root.rotation.y += yaw; rig.pose(0, "woodcutting")
        rig.root.updateMatrixWorld(true)
        const camera = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 30)
        camera.position.set(10 * Math.sin(yaw), 10 * pitch, 10 * Math.cos(yaw)); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
        const log = rig.root.getObjectByName("woodcutting-log")!.getWorldPosition(new THREE.Vector3()).project(camera)
        const stumpTop = new THREE.Vector3(target.x, target.y + point[1] * scale, target.z).project(camera)
        expect(origin.y).toBeCloseTo(ground(origin.x, origin.z), 8)
        expect(log.x).toBeCloseTo(stumpTop.x, 6)
        expect(log.y).toBeCloseTo(stumpTop.y, 6)
      }
    } finally { rig.dispose() }
  })

  it("targets the axis of a leaning trunk at the height of the axe", () => {
    const shape = { ...generateTree(TREE_SPECIES.beech, makeRng(4)), leanAngle: 0.16, leanYaw: 0.7 }
    const tree = { species: "beech" as const, x: 2, y: 0.3, z: -4, shape }
    const height = 0.45
    const target = trunkContact(tree, height)
    const axis = new THREE.Vector3(Math.sin(shape.leanYaw), 0, -Math.cos(shape.leanYaw))
    const centre = new THREE.Vector3(0, height / Math.cos(shape.leanAngle), 0).applyAxisAngle(axis, shape.leanAngle)
    expect(target.x).toBeCloseTo(tree.x + centre.x)
    expect(target.z).toBeCloseTo(tree.z + centre.z)
    expect(trunkContact(tree, 0)).toEqual({ x: tree.x, y: tree.y, z: tree.z })
  })

  it("leaves standing trunk at axe height even on the smallest forest-edge trees", () => {
    const scale = PERSON_SPRITE_SCALE * BASE_CHARACTER_SCALE / BASE_PERSON.camera.viewSize
    const strike = Math.max(...designs.map(design => workContacts(design).treeFelling[1])) * scale
    for (const id of TREE_SPECIES_ORDER) expect(TREE_SPECIES[id].trunk.height.min * EDGE_SIZE_SCALE).toBeGreaterThan(strike)
  })
})
