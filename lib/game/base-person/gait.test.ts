import { POPULATION_PROFILES } from "./population"
import { SETTLEMENT_JOBS, jobDesign, type SettlementJob } from "../jobs/design"
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { BASE_CHARACTER_SCALE, DEFAULT_WALK_SPEED, DEFAULT_WALK_STRIDE, PERSON_SPRITE_SCALE, personWalkStride, walkSpeedScale, walkContact, plantFoot, type FootPlant } from "./gait"
import { BASE_PERSON, legPose, PERSON_CLIPS, WALK_CLIP_STRIDES, WALK_FRAMES_PER_STRIDE } from "./pose"
import { DEFAULT_DESIGN, PERSON_PRESETS, personRecipe } from "./design"
import { DEFAULT_POPULATION, populationVisual } from "./population-assets"
import { CHARACTER_ASSETS, characterVisual } from "../character-assets"
import { MONK_VISUAL, monkVisual, monkWalkSpeed, MONK_WALK_TUNING } from "./monk-assets"

const WALKING_DESIGNS = [
  ...(Object.keys(SETTLEMENT_JOBS) as SettlementJob[]).flatMap(job => POPULATION_PROFILES.map((_, variant) => jobDesign(job, variant))),
  ...DEFAULT_POPULATION.callings.peasant.designs, ...DEFAULT_POPULATION.callings.beggar.designs, ...Object.values(PERSON_PRESETS),
]

describe("walking at the rendered person's scale", () => {
  it("ships the current rig and walk frame count in every active character family", () => {
    const base = characterVisual(CHARACTER_ASSETS.peasant, "base")
    const manifests = [base.walk.url.replace("-walk.png", ".json"), MONK_VISUAL.walk.url.replace("walk.png", "manifest.json"), monkVisual(40).walk.url.replace("walk.png", "manifest.json")]
    for (const url of manifests) {
      const metadata = JSON.parse(readFileSync(`${process.cwd()}/public${url}`, "utf8"))
      expect(metadata.templateVersion ?? Number(String(metadata.version).replace(/^v/, ""))).toBe(BASE_PERSON.version)
      expect(metadata.frameCount).toBe(PERSON_CLIPS.walk.frames)
      for (const clip of ["carrying", "procession", "hoisting"] as const) {
        expect(metadata.clips[clip].length / metadata.directions.length).toBe(PERSON_CLIPS[clip].frames)
      }
    }
    expect(DEFAULT_POPULATION.templateVersion).toBe(BASE_PERSON.version)
    expect(DEFAULT_POPULATION.frameCounts?.walk).toBe(PERSON_CLIPS.walk.frames)
    expect(DEFAULT_POPULATION.frameCounts?.carrying).toBe(PERSON_CLIPS.carrying.frames)
  })

  it("uses the monk's actual leg reach and rendered size for both travel and steps", () => {
    expect(MONK_VISUAL.walkStride).toBeCloseTo(personWalkStride(PERSON_PRESETS.Monk))
    for (const characterScale of [0.75, BASE_CHARACTER_SCALE, 2]) {
      const stride = MONK_VISUAL.walkStride * characterScale
      expect(monkWalkSpeed(characterScale) / stride * 120).toBeCloseTo(138)
    }
    expect(monkWalkSpeed(2)).toBeCloseTo(monkWalkSpeed(1) * 2)
    expect(MONK_WALK_TUNING).toEqual({ sync: true, stride: DEFAULT_WALK_STRIDE })
  })

  it("preserves both leg lengths and forward knee bend for every preset and body profile", () => {
    for (const design of WALKING_DESIGNS) {
      const body = personRecipe(design).body
      for (const clip of ["walk", "carrying", "procession"] as const) for (const side of ["left", "right"] as const) {
        for (let tick = 0; tick < 120; tick++) {
          const leg = legPose(side, tick / 120, clip, body)
          const distance = (a: number[], b: number[]) => Math.hypot(...a.map((value, i) => value - b[i]))
          expect(distance(leg.hip, leg.knee)).toBeCloseTo(body.thighLength, 10)
          expect(distance(leg.knee, leg.ankle)).toBeCloseTo(body.shinLength, 10)
          // The knee must lie forward of the straight hip-to-ankle line.
          const fraction = (leg.knee[1] - leg.hip[1]) / (leg.ankle[1] - leg.hip[1])
          expect(leg.knee[2]).toBeGreaterThan(leg.hip[2] + (leg.ankle[2] - leg.hip[2]) * fraction)
          if (leg.planted) expect(leg.ankle[1]).toBe(body.ankleHeight)
        }
      }
    }
  })
  it("stands upright with softly extended knees in every population profile", () => {
    for (const design of WALKING_DESIGNS) {
      const body = personRecipe(design).body
      for (const side of ["left", "right"] as const) {
        const leg = legPose(side, 0, "idle", body)
        const distanceSquared = (leg.hip[1] - leg.ankle[1]) ** 2
        const bend = Math.acos((distanceSquared - body.thighLength ** 2 - body.shinLength ** 2)
          / (2 * body.thighLength * body.shinLength)) * 180 / Math.PI
        expect(bend).toBeCloseTo(8, 8)
      }
    }
  })

  it.each(WALKING_DESIGNS)("locks the rendered support foot without accumulating drift (body %#)", (design) => {
    for (const scale of [0.75, 1.5, 2]) {
      const body = personRecipe(design).body
      const stride = personWalkStride(design) * scale
      const rigScale = PERSON_SPRITE_SCALE * scale / BASE_PERSON.camera.viewSize
      let plant: FootPlant | null = null
      let lastKey = "", lastZ = 0
      for (let tick = 0; tick < 1200; tick++) {
        const phase = (tick / 120) % WALK_CLIP_STRIDES
        const foot = walkContact(phase, PERSON_CLIPS.walk.frames, body, WALK_CLIP_STRIDES)
        const pose = legPose(foot.side, Math.floor(phase * WALK_FRAMES_PER_STRIDE + 1e-9) / WALK_FRAMES_PER_STRIDE, "walk", body)
        expect(pose.planted).toBe(true)
        const origin = { x: 0, z: tick / 120 * stride }
        const offset = { x: foot.x * rigScale, z: foot.z * rigScale }
        const result = plantFoot(plant, foot.side, origin, offset)
        const worldZ = origin.z + result.offset.z + offset.z
        if (lastKey === foot.side) expect(worldZ).toBeCloseTo(lastZ, 10)
        expect(Math.abs(result.offset.z)).toBeLessThanOrEqual(stride / WALK_FRAMES_PER_STRIDE + 1e-8)
        plant = result.plant; lastKey = foot.side; lastZ = worldZ
      }
    }
  })

  it("releases a foot plant when changing support or teleporting", () => {
    const first = plantFoot(null, "left", { x: 0, z: 0 }, { x: 0.1, z: 0.2 })
    const next = plantFoot(first.plant, "right", { x: 0, z: 0.2 }, { x: -0.1, z: 0.2 })
    expect(next.offset).toEqual({ x: 0, y: 0, z: 0 })
    const teleported = plantFoot(first.plant, "left", { x: 20, z: 0 }, { x: 0.1, z: 0.2 })
    expect(teleported.offset.x).toBeCloseTo(0)
    expect(teleported.offset.z).toBeCloseTo(0)
  })

  it("keeps the supporting foot at its planted height while the body climbs a slope", () => {
    const first = plantFoot(null, "left", { x: 0, y: 0.5, z: 0 }, { x: 0.1, z: 0.2 })
    const next = plantFoot(first.plant, "left", { x: 0, y: 0.52, z: 0.03 }, { x: 0.1, z: 0.2 })
    expect(0.52 + next.offset.y).toBeCloseTo(0.5)
    expect(0.03 + 0.2 + next.offset.z).toBeCloseTo(0.2)
  })
  it("keeps planted feet fixed in world space across body designs, sizes and carrying poses", () => {
    const designs = [...WALKING_DESIGNS,
      { ...DEFAULT_DESIGN, stride: 1.1, legs: 0.85 },
      { ...DEFAULT_DESIGN, stride: 0.75, legs: 1.15 }]
    for (const design of designs) for (const scale of [0.75, 1.5, 2]) {
      const body = personRecipe(design).body
      const stride = personWalkStride(design) * scale
      const rigToWorld = PERSON_SPRITE_SCALE * scale / BASE_PERSON.camera.viewSize
      for (const clip of ["walk", "carrying", "procession"] as const) for (const side of ["left", "right"] as const) {
        let plantedZ: number | undefined
        for (let frame = 0; frame < 8; frame++) {
          const phase = frame / 8
          const leg = legPose(side, phase, clip, body)
          if (!leg.planted) { plantedZ = undefined; continue }
          const worldZ = phase * stride + leg.ankle[2] * rigToWorld
          if (plantedZ !== undefined) expect(worldZ).toBeCloseTo(plantedZ, 10)
          plantedZ = worldZ
        }
      }
    }
  })

  it("uses a 138-step baseline and preserves cadence when the visible person is resized", () => {
    expect(DEFAULT_WALK_STRIDE).toBeCloseTo(0.353, 3)
    expect(DEFAULT_WALK_SPEED).toBeCloseTo(0.406, 3)
    const stride = personWalkStride(DEFAULT_DESIGN)
    expect(walkSpeedScale(stride, BASE_CHARACTER_SCALE)).toBe(1)
    for (const scale of [0.75, 1.5, 2]) {
      const speed = DEFAULT_WALK_SPEED * walkSpeedScale(stride, scale)
      expect(speed / (stride * scale) * 120).toBeCloseTo(138)
    }
  })

  it("calibrates both the shipped population and the standalone base from their designs", () => {
    const base = characterVisual(CHARACTER_ASSETS.peasant, "base")
    expect(base.walkStride).toBeCloseTo(personWalkStride(DEFAULT_DESIGN))
    for (let variant = 0; variant < 6; variant++) {
      const visual = populationVisual("peasant", variant, null)
      expect(visual.walkStride).toBeCloseTo(personWalkStride(visual.design))
    }
    const enlarged = characterVisual({ ...CHARACTER_ASSETS.peasant, scale: 1.48 }, "callings")
    expect(enlarged.walkStride).toBeCloseTo(0.88)
  })
})
