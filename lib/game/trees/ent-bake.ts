import * as THREE from "three"
import { addSurfaceLighting } from "../render/lighting"
import { spriteDepthBaker } from "../render/bake-depth"
import { BARK_PALETTE, FOLIAGE_SPECIES, type FoliageSpecies } from "./foliage/design"
import { createEntRig, entCamera, ENT_FRAME, ENT_FRAMES, type EntDesign } from "./ent-rig"

export interface EntAtlas { color: string; depth: string }
export const DEFAULT_ENT_ATLAS: EntAtlas = { color: "/textures/trees/ents/v1/color.png", depth: "/textures/trees/ents/v1/depth.png" }
/** Only the articulated roots need a new bake. Existing crowns retain every species,
 * variant and ancient-tree shape, attached to this rig's pelvis in the renderer. */
export async function bakeEnts(designs: Partial<Record<FoliageSpecies, EntDesign>> = {}, cancelled = () => false): Promise<EntAtlas> {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true })
  const { cellSize: size, directions, rows, extent } = ENT_FRAME
  renderer.setPixelRatio(1); renderer.setSize(size, size); renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene(), camera = entCamera(), depth = spriteDepthBaker(renderer)
  addSurfaceLighting(scene)
  const canvas = () => { const c = document.createElement("canvas"); c.width = size * directions; c.height = size * rows; return c }
  const color = canvas(), depths = canvas(), ctx = color.getContext("2d")!, zctx = depths.getContext("2d")!
  const frame = document.createElement("canvas"); frame.width = frame.height = size
  const fctx = frame.getContext("2d", { willReadFrequently: true })!
  const palette = BARK_PALETTE.map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)))
  try {
    for (const [speciesIndex, species] of FOLIAGE_SPECIES.entries()) {
      const rig = createEntRig(species, designs[species]); scene.add(rig.root)
      try {
        for (let pose = 0; pose <= ENT_FRAMES; pose++) {
          rig.pose(pose / ENT_FRAMES, pose < ENT_FRAMES)
          for (let view = 0; view < directions; view++) {
            if (cancelled()) throw new DOMException("Superseded Ent design", "AbortError")
            rig.root.rotation.y = -view * Math.PI / 4
            renderer.render(scene, camera)
            fctx.clearRect(0, 0, size, size); fctx.drawImage(renderer.domElement, 0, 0)
            const pixels = fctx.getImageData(0, 0, size, size)
            for (let i = 0; i < pixels.data.length; i += 4) {
              if (pixels.data[i + 3] < 128) { pixels.data.fill(0, i, i + 4); continue }
              const x = i / 4 % size, y = Math.floor(i / 4 / size)
              if (x < 2 || x >= size - 2 || y < 2 || y >= size - 2) throw new Error(`Ent roots exceed their frame: ${species}/${pose}/${view}`)
              let best = palette[0], distance = Infinity
              for (const candidate of palette) {
                const d = candidate.reduce((sum, v, c) => sum + (v - pixels.data[i + c]) ** 2, 0)
                if (d < distance) { distance = d; best = candidate }
              }
              pixels.data.set([...best, 255], i)
            }
            if (renderer.getContext().isContextLost() || !pixels.data.some((v, i) => i % 4 === 3 && v === 255)) throw new Error("Ent bake produced an empty frame.")
            const row = speciesIndex * (ENT_FRAMES + 1) + pose
            zctx.drawImage(depth.render(scene, camera, size, extent, pixels.data, pixels.data), view * size, row * size)
            fctx.putImageData(pixels, 0, 0); ctx.drawImage(frame, view * size, row * size)
          }
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      } finally { scene.remove(rig.root); rig.dispose() }
    }
    return { color: color.toDataURL(), depth: depths.toDataURL() }
  } finally { depth.dispose(); renderer.dispose(); renderer.forceContextLoss() }
}
