import * as THREE from "three"
import { addSurfaceLighting } from "../render/lighting"
import { ISO_PITCH } from "../render/iso"
import { inkPersonFrame } from "../base-person/ink"
import { personRecipe } from "../base-person/design"
import { BUILDING_STYLE } from "../building-art/style"
import { resourceIconModel } from "./model"
import { ICON_SIZES, ICON_THEMES, ILLUSTRATED_ICONS, type IconTheme, type IconDesign, type IconSize, type IllustratedIcon } from "./design"
import { themeIconEdges } from "./theme"
import { glowIcon } from "./glow"

export type IconSheet = Record<IllustratedIcon, Record<IconSize, string>>

export type IconAtlas = Record<IconTheme, IconSheet>

/** Transparent native-pixel bakes: shared camera pitch, lighting, palette and one-pixel ink. */
export function bakeResourceIcons(design: IconDesign): IconAtlas {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false })
  renderer.setPixelRatio(1); renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.localClippingEnabled = true
  const scene = new THREE.Scene(); addSurfaceLighting(scene)
  const palette = [...new Set([BUILDING_STYLE.palette.ink, ...personRecipe().renderPalette,
    ...Object.values(BUILDING_STYLE.palette), "#91600c", "#b47a10", "#c38a16", "#dca522", "#ffcf40", "#ffe891", "#fff4bd",
    "#64251f", "#8d382e", "#b94e42", "#de8069", "#e2b795", "#fff2ce",
    "#55584e", "#73766a", "#84897f", "#a4a89a", "#b5b9ac", "#dddbca", "#e8d4a0", "#c6ad78", "#f2d28a", "#315847", "#203a2c", "#684818"
  ])].map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)))
  const atlas = { light: {}, dark: {} } as IconAtlas
  try {
    for (const { id } of ILLUSTRATED_ICONS) {
      const model = resourceIconModel(id); scene.add(model.root)
      try {
        model.root.rotation.y = model.root.userData.frontFacing ? 0 : Math.PI / 4 + design.view * Math.PI / 2
        model.root.updateMatrixWorld(true)
        const bounds = new THREE.Box3()
        model.root.traverseVisible(object => {
          if (object instanceof THREE.Mesh) {
            object.geometry.computeBoundingBox()
            bounds.union(object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld))
          }
        })
        const center = bounds.getCenter(new THREE.Vector3())
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 30)
        camera.position.copy(center).add(new THREE.Vector3(0, Math.sin(ISO_PITCH) * 10, Math.cos(ISO_PITCH) * 10))
        camera.lookAt(center); camera.updateMatrixWorld(true)
        // Fit the projected bounds with enough space for a full native-pixel contour.
        const projected = new THREE.Box3()
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse))
        const glowing = id === "faith" || id === "renown"
        const extent = Math.max(projected.max.x - projected.min.x, projected.max.y - projected.min.y) * (glowing ? 1.45 : 1.3)
        camera.left = camera.bottom = -extent / 2; camera.right = camera.top = extent / 2; camera.updateProjectionMatrix()
        for (const theme of ICON_THEMES) atlas[theme][id] = {} as Record<IconSize, string>
        for (const size of ICON_SIZES) {
          renderer.setSize(size, size, false); renderer.render(scene, camera)
          const canvas = Object.assign(document.createElement("canvas"), { width: size, height: size })
          const context = canvas.getContext("2d")!
          context.drawImage(renderer.domElement, 0, 0)
          const pixels = context.getImageData(0, 0, size, size)
          if (renderer.getContext().isContextLost() || !pixels.data.some((v, i) => i % 4 === 3 && v > 0)) throw new Error("The icon renderer could not produce an image. Try generating again.")
          // One part mask preserves surface shading without inventing internal seams.
          const inked = inkPersonFrame(pixels.data, new Uint8ClampedArray(pixels.data.length), size, palette, design.ink).pixels
          for (const theme of ICON_THEMES) {
            const themed = themeIconEdges(inked, pixels.data, size, theme)
            const output = glowing ? glowIcon(themed, size, design.glow * .5, Math.max(1, Math.round(size * .055))) : themed
            context.putImageData(new ImageData(new Uint8ClampedArray(output), size, size), 0, 0)
            atlas[theme][id][size] = canvas.toDataURL("image/png")
          }
        }
      } finally { scene.remove(model.root); model.dispose() }
    }
    return atlas
  } finally { renderer.dispose(); renderer.forceContextLoss() }
}
