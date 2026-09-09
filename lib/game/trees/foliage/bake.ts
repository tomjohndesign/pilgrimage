import * as THREE from "three"
import { ISO_PITCH } from "../../render/iso"
import { addSurfaceLighting } from "../../render/lighting"
import { spriteDepthBaker } from "../../render/bake-depth"
import { createFoliageModel } from "./model"
import { BARK_PALETTE, FOLIAGE_PALETTE, FOLIAGE_FRAME, FOLIAGE_SPECIES, type FoliageAtlas, type FoliageDesigns } from "./design"

/** Native pixels and paired geometry depth; no cast shadows or silhouette inflation. */
export async function bakeFoliage(designs: FoliageDesigns, cancelled: () => boolean = () => false): Promise<FoliageAtlas> {
  const { cellSize: size, extent, anchor, directions, variants, rows } = FOLIAGE_FRAME
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1); renderer.setSize(size, size); renderer.setClearColor(0, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const depth = spriteDepthBaker(renderer), scene = new THREE.Scene()
  addSurfaceLighting(scene)
  const y = (anchor[1] / size - 0.5) * extent / Math.cos(ISO_PITCH)
  const camera = new THREE.OrthographicCamera(-extent / 2, extent / 2, extent / 2, -extent / 2, 0.1, 30)
  camera.position.set(0, y + Math.sin(ISO_PITCH) * 10, Math.cos(ISO_PITCH) * 10); camera.lookAt(0, y, 0)
  const canvas = () => { const c = document.createElement("canvas"); c.width = size * directions; c.height = size * rows; return c }
  const color = canvas(), depths = canvas(), ctx = color.getContext("2d")!, zctx = depths.getContext("2d")!
  const frame = document.createElement("canvas"); frame.width = frame.height = size
  const fctx = frame.getContext("2d", { willReadFrequently: true })!
  const colorsOf = (ramp: string[]) => ramp.map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)))
  const foliagePalette = colorsOf(FOLIAGE_PALETTE), barkPalette = colorsOf(BARK_PALETTE)
  let safePadding: number = size
  try {
    for (const state of [0, 1, 2]) for (const [speciesIndex, species] of FOLIAGE_SPECIES.entries()) for (let variant = 0; variant < variants; variant++) {
      if (state === 2 && speciesIndex > 0) continue
      const oldGrowth = state > 0
      const model = createFoliageModel(species, variant, designs[species], oldGrowth, state === 2); scene.add(model.root)
      try {
        for (let view = 0; view < directions; view++) {
          if (cancelled()) throw new DOMException("Superseded foliage design", "AbortError")
          model.root.rotation.y = -view * Math.PI * 2 / directions
          renderer.render(scene, camera)
          fctx.clearRect(0, 0, size, size); fctx.drawImage(renderer.domElement, 0, 0)
          const pixels = fctx.getImageData(0, 0, size, size)
          for (let i = 0; i < pixels.data.length; i += 4) {
            if (pixels.data[i + 3] < 128) { pixels.data.fill(0, i, i + 4); continue }
            const rgb = pixels.data.subarray(i, i + 3)
            const palette = rgb[1] > rgb[0] ? foliagePalette : barkPalette
            let best = palette[0], distance = Infinity
            for (const candidate of palette) {
              const d = candidate.reduce((sum, v, c) => sum + (v - rgb[c]) ** 2, 0)
              if (d < distance) { distance = d; best = candidate }
            }
            pixels.data.set([...best, 255], i)
            const x = i / 4 % size, y = Math.floor(i / 4 / size)
            safePadding = Math.min(safePadding, x, y, size - x - 1, size - y - 1)
          }
          if (renderer.getContext().isContextLost() || !pixels.data.some((v, i) => i % 4 === 3 && v === 255)) {
            throw new Error(`Tree bake lost its WebGL context or produced an empty frame (${state}/${species}/${variant}/${view}).`)
          }
          const row = (state * FOLIAGE_SPECIES.length * variants) + speciesIndex * variants + variant
          zctx.drawImage(depth.render(scene, camera, size, extent, pixels.data, pixels.data), view * size, row * size)
          fctx.putImageData(pixels, 0, 0); ctx.drawImage(frame, view * size, row * size)
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      } finally { scene.remove(model.root); model.dispose() }
    }
    if (safePadding < 4) throw new Error(`Tree exceeds its frame (${safePadding}px margin). Reduce height or crown spread.`)
    return { frame: FOLIAGE_FRAME, color: color.toDataURL(), depth: depths.toDataURL(), designs: structuredClone(designs), safePadding }
  } finally { depth.dispose(); renderer.dispose() }
}
