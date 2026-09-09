import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { parseAsciiMap } from "../map/prototype-map"
import { tileToWorldX, tileToWorldZ, type GameMap } from "../map/types"
import { CHARACTER_PIXEL_SIZE } from "../render/pixel-scale"
import { depthBandCorners } from "../map/depth-field"
import { waterDepthCorners } from "../map/water-depth-corners"
import { treeCanopyDepth, treeShadowDepth, treeGroundField, TREE_GROUND_ATLAS, TREE_GROUND_FRAME } from "./ground"
import type { TreePlacement } from "./placement"

const tree = (map: GameMap, x: number, z: number): TreePlacement => ({ x: tileToWorldX(map, x), y: 0.2, z: tileToWorldZ(map, z), species: "oak" })
const woods = (size: number) => parseAsciiMap(Array.from({ length: size }, (_, z) =>
  z === 0 || z === size - 1 ? ".".repeat(size) : "." + "F".repeat(size - 2) + "."))
const stand = (map: GameMap) => map.tiles.flatMap((t, i) => t === "forest" ? [tree(map, i % map.width, Math.floor(i / map.width))] : [])

describe("forest depth shadow tiles", () => {
  it("packs both authored floor sprites without recoloring or changing their native size", async () => {
    for (const [left, file] of [[0, "forest-floor-v1.png"], [128, "dark-forest-floor-v2.png"]] as const) {
      const source = await sharp(`public/textures/${file}`).ensureAlpha().raw().toBuffer()
      const packed = await sharp("public/textures/forest-floors-v2.png").extract({ left, top: 0, width: 128, height: 128 }).ensureAlpha().raw().toBuffer()
      expect(packed.equals(source)).toBe(true)
    }
  })

  it("keeps dead snags from casting leafy canopy shade and darkens a grove's open heart", () => {
    const map = woods(13)
    expect(treeCanopyDepth(map, [{ ...tree(map, 6, 6), dead: true }]).every(v => v === 0)).toBe(true)
    map.tiles = map.tiles.map(t => t === "forest" ? "darkwood" : t)
    const clearing = []
    for (let z = 3; z <= 9; z++) for (let x = 3; x <= 9; x++) {
      map.tiles[z * 13 + x] = "clearing"; clearing.push({ x, z })
    }
    map.darkForests = [{ center: { x: 6, z: 6 }, clearing, approach: [] }]
    const field = treeGroundField(map, [])
    expect(field.data[(6 * 13 + 6) * 4]).toBe(0)
    expect(field.data[(6 * 13 + 6) * 4 + 1]).toBe(255)
  })

  it("deepens monotonically inward like water depth, with a dim fringe outside", () => {
    const map = woods(9), trees = stand(map)
    const depths = treeCanopyDepth(map, trees), shadows = treeShadowDepth(map, trees)
    expect(Array.from(depths.slice(4 * 9, 5 * 9))).toEqual([0, 1, 2, 3, 3, 3, 2, 1, 0])
    expect(Array.from(shadows.slice(4 * 9, 5 * 9))).toEqual([1, 1, 2, 3, 3, 3, 2, 1, 1])
  })

  it("keeps isolated trees dim regardless of the number of trunks on that tile", () => {
    const map = woods(9), single = [tree(map, 4, 4)]
    expect(treeCanopyDepth(map, single)[4 * 9 + 4]).toBe(1)
    expect(treeCanopyDepth(map, [...single, ...single, ...single])).toEqual(treeCanopyDepth(map, single))
    expect(Math.max(...treeShadowDepth(map, single))).toBe(1)
  })

  it("closes a small crown gap but brightens an actual clearing after felling", () => {
    const map = woods(13), trees = stand(map)
    const hidden = new Set<number>()
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i]
      if (Math.abs(t.x) <= 3 && Math.abs(t.z) <= 3) hidden.add(i)
    }
    const depths = treeCanopyDepth(map, trees, hidden)
    expect(depths[6 * 13 + 6]).toBe(0)
    expect(depths[6 * 13 + 4]).toBe(1)
    expect(treeShadowDepth(map, trees, hidden)[6 * 13 + 6]).toBe(0)
    const center = trees.findIndex(t => t.x === 0 && t.z === 0)
    expect(treeCanopyDepth(map, trees, new Set([center]))[6 * 13 + 6]).toBe(3)
    expect(treeGroundField(map, trees, new Set(trees.map((_, i) => i))).data.every(v => v === 0)).toBe(true)
  })

  it.each(["path", "track"] as const)("casts dim shade onto a nearby %s without using it as forest interior", (path) => {
    const map = woods(9), trees = stand(map).filter(t => t.x < 0)
    for (let z = 0; z < 9; z++) map.tiles[z * 9 + 4] = path
    const canopy = treeCanopyDepth(map, trees), shadows = treeShadowDepth(map, trees)
    expect(canopy[4 * 9 + 4]).toBe(0)
    expect(shadows[4 * 9 + 4]).toBe(1)
    expect(shadows[4 * 9 + 5]).toBe(0)
    expect(treeShadowDepth(map, [], undefined)[4 * 9 + 4]).toBe(0)
    map.tiles[4 * 9 + 4] = "water"
    expect(treeShadowDepth(map, trees)[4 * 9 + 4]).toBe(0)
  })

  it("keeps sprite choice independent of the seed and individual trunk positions", () => {
    const map = woods(9), single = [tree(map, 4, 4)]
    expect(treeGroundField(map, single)).toEqual(treeGroundField({ ...map, seed: 981 }, [{ ...single[0], x: 0.3, z: -0.3, species: "birch" }]))
  })

  it("uses the same diagonal joins as water depth tiles", () => {
    const map = woods(9), depths = Array.from(treeCanopyDepth(map, stand(map)))
    const waterMap: GameMap = { ...map, tiles: depths.map(d => d ? "water" : "grass"), water: { depth: depths, surface: depths.map(() => -.05), flow: {} } }
    expect(depthBandCorners(waterMap, depths)).toEqual(waterDepthCorners(waterMap))
    expect(Array.from(depthBandCorners(map, depths)).some(corner => corner >= 0)).toBe(true)
  })

  it("keeps a continuous dark interior when trunks are spaced through a forest", () => {
    const map = woods(21)
    const spaced = stand(map).filter(t => (Math.round(t.x) % 3 === 0 && Math.round(t.z) % 3 === 0))
    const depths = treeCanopyDepth(map, spaced)
    for (let z = 4; z < 17; z++) for (let x = 4; x < 17; x++) expect(depths[z * map.width + x]).toBe(3)
    const clearing = new Set(spaced.flatMap((t, i) => Math.abs(t.x) <= 4 && Math.abs(t.z) <= 4 ? [i] : []))
    expect(treeShadowDepth(map, spaced, clearing)[10 * map.width + 10]).toBe(0)
  })

  it("ships solid sprites with no baked border lines and a discrete palette", async () => {
    const { data, info } = await sharp(`public${TREE_GROUND_ATLAS}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const frame = TREE_GROUND_FRAME
    expect([info.width, info.height]).toEqual([frame.pixels * frame.columns, frame.pixels * frame.rows])
    expect(frame.pixels).toBe(Math.ceil(1 / CHARACTER_PIXEL_SIZE))
    const shade = new Set<number>(), dirt = new Set<number>(), alpha = new Set<number>()
    for (let i = 0; i < data.length; i += 4) { shade.add(data[i]); dirt.add(data[i + 1]); alpha.add(data[i + 3]) }
    expect([...shade].sort((a, b) => a - b)).toEqual([0, 38, 100, 158])
    expect([...dirt].sort((a, b) => a - b)).toEqual([0, 65, 190, 245])
    expect([...alpha]).toEqual([255])
    // Every pixel of every equal-depth frame must be identical, including
    // corners and boundaries that previously gained pale stippled grid lines.
    for (let depth = 0; depth < 4; depth++) for (let shape = 0; shape < 5; shape++) {
      const tile = (depth * 4 + depth) * 5 + shape
      for (let y = 0; y < frame.pixels; y++) for (let x = 0; x < frame.pixels; x++) {
        const i = ((Math.floor(tile / frame.columns) * frame.pixels + y) * info.width
          + tile % frame.columns * frame.pixels + x) * 4
        expect(data[i]).toBe([0, 38, 100, 158][depth])
      }
    }
  })
})
