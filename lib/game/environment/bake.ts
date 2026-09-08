import * as THREE from "three"
import { ISO_PITCH } from "../render/iso"
import { addSurfaceLighting } from "../render/lighting"
import { spriteDepthBaker } from "../render/bake-depth"
import { BOULDER_SIZES, ENVIRONMENT_KINDS, type BoulderSize, type EnvironmentKind } from "./elements"
import { BOULDER_FRAME, ENVIRONMENT_FRAME, type EnvironmentSpriteFrame } from "./sprites"
import { environmentModel } from "./model"

/** Bake existing plants once: upright color/depth sprites and unlit top-down tile stamps. */
export async function bakeEnvironment() {
  const small = await bakeSet(ENVIRONMENT_FRAME, ENVIRONMENT_KINDS.map(kind => ({ kind })))
  const boulders = await bakeSet(BOULDER_FRAME, BOULDER_SIZES.map(boulderSize => ({ kind: "boulder", boulderSize })))
  return { ...small, boulders }
}

async function bakeSet(layout: EnvironmentSpriteFrame, specimens: { kind: EnvironmentKind; boulderSize?: BoulderSize }[]) {
  const { cellSize: size, extent, anchor, directions, variants, rows } = layout
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false })
  renderer.setPixelRatio(1); renderer.setSize(size, size); renderer.setClearColor(0, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const depth = spriteDepthBaker(renderer), scene = new THREE.Scene()
  addSurfaceLighting(scene)
  const y = (anchor[1] / size - .5) * extent / Math.cos(ISO_PITCH)
  const camera = new THREE.OrthographicCamera(-extent / 2, extent / 2, extent / 2, -extent / 2, .1, 30)
  camera.position.set(0, y + Math.sin(ISO_PITCH) * 10, Math.cos(ISO_PITCH) * 10); camera.lookAt(0, y, 0)
  const canvas = (width: number, height: number) => Object.assign(document.createElement("canvas"), { width, height })
  const color = canvas(size * directions, size * rows), depths = canvas(size * directions, size * rows)
  const topdown = canvas(size * variants, size * specimens.length)
  const frame = canvas(size, size), ctx = frame.getContext("2d", { willReadFrequently: true })!
  try {
    for (const [index, { kind, boulderSize }] of specimens.entries()) for (let variant = 0; variant < variants; variant++) {
      const seed = 42 + index * 31 + variant * 7
      const model = environmentModel(kind, seed, false, boulderSize)
      // Size variation belongs to the bake, preserving native pixel size in game.
      const scale = boulderSize ? .96 + variant * .02 : .75 + variant * .1
      model.root.scale.setScalar(scale)
      scene.add(model.root)
      try {
        for (let view = 0; view < directions; view++) {
          model.root.rotation.y = -view * Math.PI * 2 / directions
          renderer.render(scene, camera)
          ctx.clearRect(0, 0, size, size); ctx.drawImage(renderer.domElement, 0, 0)
          const pixels = ctx.getImageData(0, 0, size, size)
          const row = index * variants + variant
          depths.getContext("2d")!.drawImage(depth.render(scene, camera, size, extent, pixels.data, pixels.data), view * size, row * size)
          color.getContext("2d")!.drawImage(frame, view * size, row * size)
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      } finally { scene.remove(model.root); model.dispose() }
      const flat = environmentModel(kind, seed, true, boulderSize)
      flat.root.scale.setScalar(scale)
      scene.add(flat.root)
      const overhead = camera.clone(); overhead.position.set(0, 10, 0); overhead.up.set(0, 0, -1); overhead.lookAt(0, 0, 0)
      renderer.render(scene, overhead)
      topdown.getContext("2d")!.drawImage(renderer.domElement, variant * size, index * size)
      scene.remove(flat.root); flat.dispose()
    }
    return { frame: layout, color: color.toDataURL(), depth: depths.toDataURL(), topdown: topdown.toDataURL() }
  } finally { depth.dispose(); renderer.dispose() }
}
