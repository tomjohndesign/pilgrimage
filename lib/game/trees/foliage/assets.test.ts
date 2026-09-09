import { describe, expect, it } from "vitest"
import sharp from "sharp"
import * as THREE from "three"
import { DEFAULT_FOLIAGE_ATLAS } from "./assets"
import { BARK_PALETTE, DEFAULT_FOLIAGE, FOLIAGE_FRAME, FOLIAGE_PALETTE, FOLIAGE_SPECIES } from "./design"
import { createFoliageModel } from "./model"
import { TREE_SPECIES_ORDER } from "../species"
import { CHARACTER_PIXEL_SIZE } from "../../render/pixel-scale"

describe("published foliage prototype", () => {
  it("keeps native character pixels, the editable defaults, and valid paired depth in every view", async () => {
    const atlas = DEFAULT_FOLIAGE_ATLAS, frame = FOLIAGE_FRAME
    expect(FOLIAGE_SPECIES).toEqual(TREE_SPECIES_ORDER)
    expect(atlas.designs).toEqual(DEFAULT_FOLIAGE)
    expect(frame.extent / frame.cellSize).toBe(CHARACTER_PIXEL_SIZE)
    const color = await sharp(`public${atlas.color}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const depth = await sharp(`public${atlas.depth}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect([color.info.width, color.info.height]).toEqual([frame.cellSize * frame.directions, frame.cellSize * frame.rows])
    expect(depth.info).toEqual(color.info)
    const palette = new Set([...FOLIAGE_PALETTE, ...BARK_PALETTE].map(hex => parseInt(hex.slice(1), 16)))
    const counts = Array(frame.rows * frame.directions).fill(0), minima = Array(frame.rows * frame.directions).fill(65535), maxima = Array(frame.rows * frame.directions).fill(0)
    let missing = 0, offPalette = 0, translucent = 0
    let padding: number = frame.cellSize
    for (let i = 0; i < color.data.length; i += 4) {
      const alpha = color.data[i + 3]
      if (alpha !== 0 && alpha !== 255) translucent++
      if (!alpha) continue
      const x = i / 4 % color.info.width, y = Math.floor(i / 4 / color.info.width)
      const cell = Math.floor(y / frame.cellSize) * frame.directions + Math.floor(x / frame.cellSize)
      const px = x % frame.cellSize, py = y % frame.cellSize
      padding = Math.min(padding, px, py, frame.cellSize - 1 - px, frame.cellSize - 1 - py)
      const z = depth.data[i] * 256 + depth.data[i + 1]
      if (depth.data[i + 2] !== 255 || depth.data[i + 3] !== 255 || z === 0 || z === 65535) missing++
      if (!palette.has(color.data[i] * 65536 + color.data[i + 1] * 256 + color.data[i + 2])) offPalette++
      counts[cell]++; minima[cell] = Math.min(minima[cell], z); maxima[cell] = Math.max(maxima[cell], z)
    }
    expect({ missing, offPalette, translucent }).toEqual({ missing: 0, offPalette: 0, translucent: 0 })
    expect(padding).toBe(atlas.safePadding)
    expect(padding).toBeGreaterThanOrEqual(4)
    counts.forEach((count, i) => {
      expect(count, `view ${i} coverage`).toBeGreaterThan(500)
      expect(maxima[i] - minima[i], `view ${i} geometry depth`).toBeGreaterThan(1000)
    })
  })

  it("bakes bare snags with real branch depth and no leaf instances", () => {
    const model = createFoliageModel("oak", 1, DEFAULT_FOLIAGE.oak, true, true)
    try {
      expect(model.leafCount).toBe(0)
      expect(model.root.children.filter(c => c instanceof THREE.Mesh).length).toBeGreaterThan(40)
      expect(new THREE.Box3().setFromObject(model.root).max.y).toBeGreaterThan(2)
    } finally { model.dispose() }
  })

  it("reproduces editable branch and leaf geometry without cast shadows", () => {
    for (const oldGrowth of [false, true]) for (const species of FOLIAGE_SPECIES) {
      const a = createFoliageModel(species, 1, DEFAULT_FOLIAGE[species], oldGrowth)
      const b = createFoliageModel(species, 1, DEFAULT_FOLIAGE[species], oldGrowth)
      const c = createFoliageModel(species, 2, DEFAULT_FOLIAGE[species], oldGrowth)
      try {
        const leaves = (root: THREE.Group) => root.children.find(child => child instanceof THREE.InstancedMesh) as THREE.InstancedMesh
        expect(leaves(a.root).instanceMatrix.array).toEqual(leaves(b.root).instanceMatrix.array)
        expect(leaves(a.root).instanceMatrix.array).not.toEqual(leaves(c.root).instanceMatrix.array)
        a.root.traverse(object => expect(object.castShadow).toBe(false))
        expect(a.leafCount).toBeGreaterThan(100)
        // Flared ancient roots bury their lower faces slightly in the ground.
        expect(new THREE.Box3().setFromObject(a.root).min.y).toBeGreaterThan(oldGrowth ? -0.11 : -0.01)
      } finally { a.dispose(); b.dispose(); c.dispose() }
    }
  }, 30_000)
})
