import { existsSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { PROTOTYPE_MAP, parseAsciiMap } from "./map/prototype-map"
import {
  clampRoadTier,
  DEFAULT_ROAD_TIER,
  MAX_ROAD_TIER,
  ROAD_TIERS,
  isRoadTerrain,
  roadEdge,
  roadTint,
  roadWear,
  TRAFFIC_FOR_BARE_ROAD,
} from "./map/road"
import { TERRAIN } from "./map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ } from "./map/types"
import {
  CAM_DISTANCE,
  cameraOffset,
  clampViewSize,
  DEFAULT_VIEW_SIZE,
  ISO_PITCH,
  MAX_VIEW_SIZE,
  maxViewSizeForMap,
  MIN_VIEW_SIZE,
  normalizeViewIndex,
  LIGHT_HEIGHT,
  LIGHT_HORIZONTAL_DISTANCE,
  LIGHT_RELATIVE_YAW,
  lightOffsetForYaw,
  panDelta,
  screenBasis,
  yawFromForward,
  worldPerPixel,
  yawForView,
} from "./render/iso"
import {
  buildingObjectId,
  decodeObjectId,
  encodeObjectId,
  MAX_OBJECT_ID,
  nextOutlineMode,
  OUTLINE_MODES,
  treeObjectId,
  type OutlineMode,
} from "./render/outline"
import { TEXTURES } from "./render/textures"
import { SITE_MENU } from "../site-menu"
import { DEFAULT_WORLD_SEED, deriveSeed, makeRng, parseSeed, SEED_STREAM } from "./rng"

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

  it("caps zoom-out per map, but never past the fixed ceiling", () => {
    // The ceiling is what bounds visible tiles — and render cost — on big maps,
    // so it must not grow with the map.
    expect(maxViewSizeForMap(512, 512)).toBe(MAX_VIEW_SIZE)
    expect(maxViewSizeForMap(128, 128)).toBe(MAX_VIEW_SIZE)
    // Smaller maps cap proportionally lower (140 framed a 128 map).
    expect(maxViewSizeForMap(64, 64)).toBeCloseTo(70, 6)
    expect(maxViewSizeForMap(32, 32)).toBeCloseTo(35, 6)
    // Rectangular maps frame their longer edge.
    expect(maxViewSizeForMap(32, 128)).toBe(MAX_VIEW_SIZE)
    // Degenerate maps still leave room to zoom.
    expect(maxViewSizeForMap(1, 1)).toBe(MIN_VIEW_SIZE)
    // clampViewSize honours a per-map cap.
    expect(clampViewSize(9999, maxViewSizeForMap(64, 64))).toBeCloseTo(70, 6)
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

describe("outline ids", () => {
  it("round-trips ids through 8-bit-per-channel quantisation", () => {
    const readback = (v: number) => Math.round(v * 255) / 255
    for (const id of [0, 1, 2, 255, 256, 257, 1024, MAX_OBJECT_ID]) {
      const [r, g] = encodeObjectId(id)
      expect(decodeObjectId(readback(r), readback(g))).toBe(id)
    }
  })

  it("rejects ids the two channels cannot hold", () => {
    expect(() => encodeObjectId(-1)).toThrow()
    expect(() => encodeObjectId(MAX_OBJECT_ID + 1)).toThrow()
    expect(() => encodeObjectId(1.5)).toThrow()
  })

  it("gives every building and tree a distinct id, none using the reserved 0", () => {
    const buildingCount = PROTOTYPE_MAP.buildings.length
    const treeCount = PROTOTYPE_MAP.tiles.filter((t) => t === "forest").length
    const ids = new Set<number>()
    for (let i = 0; i < buildingCount; i++) ids.add(buildingObjectId(i))
    for (let i = 0; i < treeCount; i++) ids.add(treeObjectId(buildingCount, i))
    expect(ids.has(0)).toBe(false)
    expect(ids.size).toBe(buildingCount + treeCount)
    expect(Math.max(...ids)).toBeLessThanOrEqual(MAX_OBJECT_ID)
  })

  it("cycles through every mode and wraps back to the first", () => {
    let mode: OutlineMode = OUTLINE_MODES[0]
    const seen = new Set<OutlineMode>([mode])
    for (let i = 1; i < OUTLINE_MODES.length; i++) {
      mode = nextOutlineMode(mode)
      seen.add(mode)
    }
    expect(seen.size).toBe(OUTLINE_MODES.length)
    expect(nextOutlineMode(mode)).toBe(OUTLINE_MODES[0])
  })
})

describe("camera-relative light", () => {
  it("reproduces the original fixed sun in view 0", () => {
    const [x, y, z] = lightOffsetForYaw(yawForView(0))
    expect(x).toBeCloseTo(26, 10)
    expect(y).toBe(LIGHT_HEIGHT)
    expect(z).toBeCloseTo(18, 10)
  })

  it("holds the sun at the same yaw relative to the camera in every view", () => {
    for (const view of VIEWS) {
      const yaw = yawForView(view)
      const [x, y, z] = lightOffsetForYaw(yaw)
      expect(y).toBe(LIGHT_HEIGHT)
      let relative = Math.atan2(x, z) - yaw
      while (relative > Math.PI) relative -= 2 * Math.PI
      while (relative < -Math.PI) relative += 2 * Math.PI
      expect(relative).toBeCloseTo(LIGHT_RELATIVE_YAW, 10)
      expect(Math.hypot(x, z)).toBeCloseTo(LIGHT_HORIZONTAL_DISTANCE, 10)
    }
  })

  it("recovers the camera yaw from its forward direction", () => {
    for (const view of VIEWS) {
      const yaw = yawForView(view)
      const [ox, , oz] = cameraOffset(yaw)
      // The camera sits at target + offset and looks back at the target.
      const recovered = yawFromForward(-ox, -oz)
      const diff = Math.atan2(Math.sin(recovered - yaw), Math.cos(recovered - yaw))
      expect(diff).toBeCloseTo(0, 10)
    }
  })
})

describe("texture manifest", () => {
  it("has unique ids and urls under /textures/", () => {
    const ids = new Set(TEXTURES.map((t) => t.id))
    expect(ids.size).toBe(TEXTURES.length)
    for (const t of TEXTURES) expect(t.url).toMatch(/^\/textures\//)
  })

  it("points every entry at a file that exists in public/", () => {
    for (const t of TEXTURES) {
      expect(existsSync(join(process.cwd(), "public", t.url)), t.url).toBe(true)
    }
  })
})

describe("site menu", () => {
  it("has unique hrefs and nests sub-pages under their parent route", () => {
    const hrefs = SITE_MENU.flatMap((item) => [item.href, ...(item.children ?? []).map((c) => c.href)])
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const item of SITE_MENU) {
      for (const child of item.children ?? []) {
        expect(child.href.startsWith(`${item.href}/`), child.href).toBe(true)
      }
    }
  })

  it("lists textures and characters under assets", () => {
    const assets = SITE_MENU.find((item) => item.label === "Assets")
    expect(assets?.children?.map((c) => c.label)).toEqual(["Textures", "Characters"])
  })
})

describe("road tiers", () => {
  it("runs from least to most developed, each weathering less than the last", () => {
    ROAD_TIERS.forEach((tier, i) => expect(tier.tier).toBe(i))
    for (let i = 1; i < ROAD_TIERS.length; i++) {
      expect(ROAD_TIERS[i].weathering).toBeLessThan(ROAD_TIERS[i - 1].weathering)
    }
    expect(clampRoadTier(DEFAULT_ROAD_TIER)).toBe(DEFAULT_ROAD_TIER)
  })

  it("registers every tier's texture in the manifest", () => {
    const urls = new Set(TEXTURES.map((t) => t.url))
    for (const tier of ROAD_TIERS) expect(urls.has(tier.textureUrl), tier.id).toBe(true)
  })

  it("clamps junk settings to a real tier", () => {
    expect(clampRoadTier(-5)).toBe(0)
    expect(clampRoadTier(99)).toBe(MAX_ROAD_TIER)
    expect(clampRoadTier(1.4)).toBe(1)
    expect(clampRoadTier(Number.NaN)).toBe(DEFAULT_ROAD_TIER)
  })
})

describe("road weathering", () => {
  // One road, three stretches of surroundings: forest, open grass, bare earth.
  const map = parseAsciiMap([
    "FFF...,,,",
    "=========",
    "FFF...,,,",
  ])
  const luminance = ([r, g, b]: [number, number, number]) => (r + g + b) / 3

  it("leaves a road surrounded by road untouched", () => {
    const paved = parseAsciiMap(["===", "===", "==="])
    expect(roadTint(paved, 1, 1, 0)).toEqual([1, 1, 1])
  })

  it("mosses the road under forest, darker and greener than in the open", () => {
    const inForest = roadTint(map, 1, 1, 0)
    const inOpen = roadTint(map, 4, 1, 0)
    expect(luminance(inForest)).toBeLessThan(luminance(inOpen))
    // Green holds up while red and blue drop — the mossy cast.
    expect(inForest[1]).toBeGreaterThan(inForest[0])
    expect(inForest[0]).toBeGreaterThan(inForest[2])
  })

  it("dusts the road lighter beside bare earth", () => {
    const byDirt = roadTint(map, 7, 1, 0)
    expect(byDirt[0]).toBeGreaterThan(1)
    expect(luminance(byDirt)).toBeGreaterThan(luminance(roadTint(map, 1, 1, 0)))
  })

  it("frays the trail more than gravel, and cuts paved tiers straight", () => {
    expect(ROAD_TIERS[0].edgeWear).toBeGreaterThan(ROAD_TIERS[1].edgeWear)
    expect(ROAD_TIERS[1].edgeWear).toBeGreaterThan(0)
    for (const tier of ROAD_TIERS) {
      expect(tier.paved).toBe(tier.edgeWear === 0)
    }
    expect(ROAD_TIERS.filter((t) => t.paved).map((t) => t.id)).toEqual(["cobble", "flagstone"])
  })

  it("weathers developed roads less than the trail", () => {
    const drift = (tier: number) => {
      const [r, g, b] = roadTint(map, 1, 1, tier)
      return Math.abs(1 - r) + Math.abs(1 - g) + Math.abs(1 - b)
    }
    for (let tier = 1; tier < ROAD_TIERS.length; tier++) {
      expect(drift(tier)).toBeLessThan(drift(tier - 1))
    }
  })
})

describe("road wear", () => {
  it("widens the ruts both ways the more feet pass", () => {
    let last = roadWear(0)
    for (const traffic of [3, 6, 12, 24, TRAFFIC_FOR_BARE_ROAD]) {
      const wear = roadWear(traffic)
      expect(wear.edge).toBeLessThan(last.edge)
      expect(wear.inner).toBeGreaterThan(last.inner)
      last = wear
    }
  })

  it("leaves an empty road as two ruts with grass between and beside, and a busy one bare to its sides", () => {
    const empty = roadWear(0)
    expect(empty.edge).toBeGreaterThan(0)
    expect(empty.inner).toBeGreaterThan(empty.edge)
    expect(empty.inner).toBeLessThan(0.5)
    const busy = roadWear(TRAFFIC_FOR_BARE_ROAD)
    expect(busy.edge).toBe(0)
    expect(busy.inner).toBeGreaterThan(0.5)
    // The surface never leaves the road's own tiles.
    for (const traffic of [0, 5, 12, 30, 60, 1000]) expect(roadWear(traffic).edge).toBeGreaterThanOrEqual(0)
  })

  it("lays a paved road edge to edge with no ruts, whatever the traffic", () => {
    for (const tier of ROAD_TIERS.filter((t) => t.paved)) {
      for (const traffic of [0, 12, 60]) {
        const wear = roadWear(traffic, tier.tier)
        expect(wear.edge).toBe(0)
        expect(wear.inner).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it("wears no further past the point the road is bare, and shrugs off junk", () => {
    expect(roadWear(TRAFFIC_FOR_BARE_ROAD * 3)).toEqual(roadWear(TRAFFIC_FOR_BARE_ROAD))
    expect(roadWear(Number.NaN)).toEqual(roadWear(0))
    expect(roadWear(-5)).toEqual(roadWear(0))
  })
})

describe("road edges", () => {
  it("opens only the sides that face land on a straight run", () => {
    // Grass above the road, bare earth below.
    const map = parseAsciiMap(["...", "===", ",,,"])
    const edge = roadEdge(map, 1, 1)
    expect(edge.open).toEqual([0, 0, 1, 1]) // +x, -x, +z, -z
  })

  it("runs seamlessly into the track to the relic, and the track into it", () => {
    // The branch forks south off the road: no verge is eroded between the
    // fork tile and the track, or between the track and the road, so the
    // two read as one way.
    const map = parseAsciiMap(["...", "===", ".-.", ".-."])
    expect(isRoadTerrain("track")).toBe(true)
    expect(roadEdge(map, 1, 1).open).toEqual([0, 0, 0, 1])
    expect(roadEdge(map, 1, 2).open).toEqual([1, 1, 0, 0])
    // Off-map counts as road, so the last track tile is open only sideways.
    expect(roadEdge(map, 1, 3).open).toEqual([1, 1, 0, 0])
  })

  it("treats off-map as road, so the road exits the world squarely", () => {
    const map = parseAsciiMap(["...", "===", "..."])
    expect(roadEdge(map, 0, 1).open).toEqual([0, 0, 1, 1])
    expect(roadEdge(map, 2, 1).open).toEqual([0, 0, 1, 1])
  })

  it("keeps every side closed inside a paved plaza", () => {
    const map = parseAsciiMap(["===", "===", "==="])
    expect(roadEdge(map, 1, 1).open).toEqual([0, 0, 0, 0])
  })

  it("opens the outside of a bend", () => {
    const map = parseAsciiMap(["=..", "==.", ".=."])
    // The bend tile: road continues west and south; grass east and north-east.
    expect(roadEdge(map, 1, 1).open).toEqual([1, 0, 0, 1])
  })
})

describe("world seed", () => {
  it("derives deterministic, distinct streams from one seed", () => {
    expect(deriveSeed(123, SEED_STREAM.tileJitter)).toBe(deriveSeed(123, SEED_STREAM.tileJitter))
    expect(deriveSeed(123, SEED_STREAM.tileJitter)).not.toBe(deriveSeed(123, SEED_STREAM.trees))
    expect(deriveSeed(123, SEED_STREAM.trees)).not.toBe(deriveSeed(124, SEED_STREAM.trees))
    for (const stream of Object.values(SEED_STREAM)) {
      const derived = deriveSeed(DEFAULT_WORLD_SEED, stream)
      expect(Number.isInteger(derived)).toBe(true)
      expect(derived).toBeGreaterThanOrEqual(0)
      expect(derived).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it("parses pasted seed input, rejecting anything that is not digits", () => {
    expect(parseSeed("123")).toBe(123)
    expect(parseSeed("  42  ")).toBe(42)
    expect(parseSeed("0")).toBe(0)
    expect(parseSeed("4294967297")).toBe(1) // wraps into uint32 space
    expect(parseSeed("")).toBeNull()
    expect(parseSeed("12.5")).toBeNull()
    expect(parseSeed("-7")).toBeNull()
    expect(parseSeed("abc")).toBeNull()
  })
})
