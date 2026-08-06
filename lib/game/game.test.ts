import { describe, expect, it } from "vitest"

import { PROTOTYPE_MAP } from "./map/prototype-map"
import { TERRAIN } from "./map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ } from "./map/types"
import {
  CAM_DISTANCE,
  cameraOffset,
  clampViewSize,
  DEFAULT_VIEW_SIZE,
  ISO_PITCH,
  MAX_VIEW_SIZE,
  MIN_VIEW_SIZE,
  normalizeViewIndex,
  panDelta,
  screenBasis,
  worldPerPixel,
  yawForView,
} from "./render/iso"
import { makeRng } from "./rng"

const DEG = 180 / Math.PI
const TRUE_ISO_DEGREES = 35.264389682754654
const VIEWS = [0, 1, 2, 3]

describe("prototype map", () => {
  it("parses to a full 32x32 grid", () => {
    expect(PROTOTYPE_MAP.width).toBe(32)
    expect(PROTOTYPE_MAP.depth).toBe(32)
    expect(PROTOTYPE_MAP.tiles).toHaveLength(1024)
    expect(PROTOTYPE_MAP.tiles.every(Boolean)).toBe(true)
  })

  it("carries a road from the west edge, through the plaza, to the east edge", () => {
    const isPath = (x: number, z: number) => tileAt(PROTOTYPE_MAP, x, z) === "path"
    expect(isPath(0, 17)).toBe(true)

    // Flood fill the western run of road from the entry point.
    const seen = new Set<string>()
    const queue: Array<[number, number]> = [[0, 17]]
    while (queue.length) {
      const [x, z] = queue.pop()!
      const key = `${x},${z}`
      if (seen.has(key) || !isPath(x, z)) continue
      seen.add(key)
      queue.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1])
    }

    // The plaza's bare earth bridges the road at z=12, so the eastern leg is a
    // separate run of path tiles. Both legs must terminate where expected.
    expect(seen.has("16,12")).toBe(true)
    expect(isPath(24, 12)).toBe(true)
    expect(isPath(31, 12)).toBe(true)
  })

  it("places every building on buildable ground, clear of the road", () => {
    for (const building of PROTOTYPE_MAP.buildings) {
      for (let dz = 0; dz < building.d; dz++) {
        for (let dx = 0; dx < building.w; dx++) {
          const terrain = tileAt(PROTOTYPE_MAP, building.x + dx, building.z + dz)
          expect(terrain, `${building.id} is in bounds`).toBeTruthy()
          expect(terrain, `${building.id} is off the road`).not.toBe("path")
          expect(TERRAIN[terrain!].buildable, `${building.id} is on buildable ground`).toBe(true)
        }
      }
    }
  })

  it("has no overlapping building footprints", () => {
    const occupied = new Set<string>()
    for (const building of PROTOTYPE_MAP.buildings) {
      for (let dz = 0; dz < building.d; dz++) {
        for (let dx = 0; dx < building.w; dx++) {
          const key = `${building.x + dx},${building.z + dz}`
          expect(occupied.has(key), `overlap at ${key}`).toBe(false)
          occupied.add(key)
        }
      }
    }
  })

  it("round trips every tile through world space", () => {
    for (let z = 0; z < PROTOTYPE_MAP.depth; z++) {
      for (let x = 0; x < PROTOTYPE_MAP.width; x++) {
        expect(worldToTileX(PROTOTYPE_MAP, tileToWorldX(PROTOTYPE_MAP, x))).toBe(x)
        expect(worldToTileZ(PROTOTYPE_MAP, tileToWorldZ(PROTOTYPE_MAP, z))).toBe(z)
      }
    }
  })
})

describe("isometric camera", () => {
  it("uses a true isometric pitch", () => {
    expect(ISO_PITCH * DEG).toBeCloseTo(TRUE_ISO_DEGREES, 6)
  })

  it("keeps one pitch and one distance across all four views", () => {
    for (const view of VIEWS) {
      const [ox, oy, oz] = cameraOffset(yawForView(view))
      expect(Math.atan2(oy, Math.hypot(ox, oz)) * DEG).toBeCloseTo(TRUE_ISO_DEGREES, 6)
      expect(Math.hypot(ox, oy, oz)).toBeCloseTo(CAM_DISTANCE, 6)
    }
  })

  it("snaps views to 90 degree steps and wraps the index both ways", () => {
    for (const view of VIEWS) {
      expect((yawForView(view + 1) - yawForView(view)) * DEG).toBeCloseTo(90, 9)
    }
    expect(normalizeViewIndex(4)).toBe(0)
    expect(normalizeViewIndex(-1)).toBe(3)
    expect(normalizeViewIndex(7)).toBe(3)
  })

  it("derives an orthonormal screen basis at every view", () => {
    for (const view of VIEWS) {
      const b = screenBasis(yawForView(view))
      expect(b.rightX * b.fwdX + b.rightZ * b.fwdZ).toBeCloseTo(0, 9)
      expect(Math.hypot(b.rightX, b.rightZ)).toBeCloseTo(1, 9)
      expect(Math.hypot(b.fwdX, b.fwdZ)).toBeCloseTo(1, 9)
    }
  })

  it("clamps zoom to its range", () => {
    expect(clampViewSize(1)).toBe(MIN_VIEW_SIZE)
    expect(clampViewSize(9999)).toBe(MAX_VIEW_SIZE)
    expect(clampViewSize(DEFAULT_VIEW_SIZE)).toBe(DEFAULT_VIEW_SIZE)
  })
})

describe("drag to pan", () => {
  /**
   * Screen-space position of a ground point, derived independently of panDelta
   * so the two can be checked against each other. Screen y grows downward.
   */
  function project(
    pointX: number,
    pointZ: number,
    targetX: number,
    targetZ: number,
    yaw: number,
    wpp: number,
  ) {
    const b = screenBasis(yaw)
    const rx = pointX - targetX
    const rz = pointZ - targetZ
    return {
      sx: (rx * b.rightX + rz * b.rightZ) / wpp,
      sy: -((rx * b.fwdX + rz * b.fwdZ) * Math.sin(ISO_PITCH)) / wpp,
    }
  }

  const DRAGS: Array<[number, number]> = [
    [120, 0],
    [0, 90],
    [0, -90],
    [-64, 37],
    [200, -150],
  ]

  it("moves the ground exactly with the cursor, at every view and zoom", () => {
    for (const view of VIEWS) {
      const yaw = yawForView(view)
      for (const [dxPixels, dyPixels] of DRAGS) {
        for (const viewSize of [MIN_VIEW_SIZE, DEFAULT_VIEW_SIZE, MAX_VIEW_SIZE]) {
          const wpp = worldPerPixel(viewSize, 800)
          let targetX = 3.5
          let targetZ = -2.25
          const landmarkX = 7
          const landmarkZ = 5

          const before = project(landmarkX, landmarkZ, targetX, targetZ, yaw, wpp)
          const delta = panDelta(yaw, dxPixels, dyPixels, wpp)
          targetX += delta.dx
          targetZ += delta.dz
          const after = project(landmarkX, landmarkZ, targetX, targetZ, yaw, wpp)

          expect(after.sx - before.sx).toBeCloseTo(dxPixels, 6)
          expect(after.sy - before.sy).toBeCloseTo(dyPixels, 6)
        }
      }
    }
  })
})

describe("seeded rng", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(42)
    const b = makeRng(42)
    for (let i = 0; i < 500; i++) expect(a()).toBe(b())
  })

  it("stays within [0, 1)", () => {
    const rng = makeRng(7)
    for (let i = 0; i < 20000; i++) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})
