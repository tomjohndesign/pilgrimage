import * as THREE from "three"
import { spriteTextureView } from "./sprite-texture"
import type { ComplexionUniforms } from "./complexion-swap"
import { MATCH_TOLERANCE } from "./complexion-swap"
import { COMPLEXION_SLOTS } from "../base-person/complexion"
import { applySpriteDepth, type SpritePoseDepth } from "./sprite-depth"
import { OUTLINE_ID_LAYER_MASK } from "./outline"
import { updateBillboardWorld } from "./sprite-transforms"

export interface CharacterBatchEntry {
  sprite: THREE.Sprite
  ids: THREE.Sprite
  /** Direct atlas/UV state for batched poses; ordinary source sprites may omit it. */
  color?: THREE.Texture
  uv?: THREE.Vector4
  /** This source publishes its ready pose directly during the animation phase. */
  publishesPose?: boolean
  /** Immutable center/ID snapshot; omit for mutable editor/test sprites. */
  fixedAttributes?: Float32Array
  complexion?: ComplexionUniforms
  /** Immutable palette snapshot, replaced when appearance changes. Omit for
   * callers that edit complexion uniforms in place. */
  palette?: Float32Array
  ground: { value: THREE.Vector4 }
  depth: SpritePoseDepth
  id: THREE.Vector3
}

const sourceEntries = new WeakMap<THREE.Sprite, CharacterBatchEntry>()
export const characterBatchEntry = (sprite: THREE.Sprite) => sourceEntries.get(sprite)
export function registerCharacterBatchEntry(entry: CharacterBatchEntry) {
  sourceEntries.set(entry.sprite, entry)
  return () => { if (sourceEntries.get(entry.sprite) === entry) sourceEntries.delete(entry.sprite) }
}

export function characterPalette(complexion: ComplexionUniforms): Float32Array {
  const values = new Float32Array(COMPLEXION_SLOTS * 8)
  for (let slot = 0; slot < COMPLEXION_SLOTS; slot++) {
    const from = complexion.complexionFrom.value[slot], to = complexion.complexionTo.value[slot]
    const at = slot * 4, target = at + COMPLEXION_SLOTS * 4
    values[at] = from.r; values[at + 1] = from.g; values[at + 2] = from.b
    values[target] = to.r; values[target + 1] = to.g; values[target + 2] = to.b
  }
  return values
}

/** Shared atlases, with per-instance pose UVs, ground planes, IDs and palettes.
 * The same billboard and depth equations as CharacterSprite remain in use.
 * Keep authored colors and complexion detail at every adaptive quality level. */
export class CharacterBatch {
  readonly root = new THREE.Group()
  private capacity = 0
  private geometry!: THREE.PlaneGeometry
  private palette!: THREE.DataTexture
  private paletteRows: Array<Float32Array | undefined> = []
  private fixedRows: Array<Float32Array | undefined> = []
  private body!: THREE.InstancedMesh
  private ids!: THREE.InstancedMesh
  private color: THREE.Texture
  private viewport = new THREE.Vector4()
  private paletteUniform = { value: null as THREE.DataTexture | null }
  private paletteHeight = { value: 1 }
  private materials: THREE.MeshBasicMaterial[]

  constructor(entry: CharacterBatchEntry, worldTexel: { value: number }, order: number, readonly compact = false) {
    this.color = spriteTextureView(entry.color ?? entry.sprite.material.map!)
    this.color.offset.set(0, 0); this.color.repeat.set(1, 1)
    this.materials = [false, true].map(ids => {
      const material = new THREE.MeshBasicMaterial({ map: this.color, alphaTest: .5, transparent: false, toneMapped: false })
      material.userData.characterBatch = true
      material.onBeforeCompile = shader => {
        shader.uniforms.characterPalette = this.paletteUniform
        shader.uniforms.characterPaletteHeight = this.paletteHeight
        shader.vertexShader = `attribute vec4 characterUv;
          attribute vec4 characterView;
          ${compact ? "attribute vec4 characterAnchor; attribute vec3 characterAxisX; attribute vec3 characterAxisY;" : ""}
          attribute vec4 characterGround;
          attribute vec2 characterCenter;
          attribute vec3 characterId;
          attribute float characterIndex;
          flat varying vec3 vCharacterId;
          flat varying float vCharacterIndex;
        ` + shader.vertexShader
        shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", `#include <uv_vertex>
          vMapUv = uv * characterUv.xy + characterUv.zw;
          vCharacterId = characterId; vCharacterIndex = characterIndex;`)
        shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", compact ? `
          vec4 characterWorldAnchor = modelMatrix * characterAnchor;
          vec3 characterWorldX = (modelMatrix * vec4(characterAxisX, 0.0)).xyz;
          vec3 characterWorldY = (modelMatrix * vec4(characterAxisY, 0.0)).xyz;
          vec4 mvPosition = characterView;
          vec2 characterScale = vec2(length(characterWorldX), length(characterWorldY));
          mvPosition.xy += (position.xy - (characterCenter - vec2(.5))) * characterScale;
          gl_Position = projectionMatrix * mvPosition;` : `#include <project_vertex>
          mat4 characterWorld = modelMatrix * instanceMatrix;
          mvPosition = characterView;
          vec2 characterScale = vec2(length(characterWorld[0].xyz), length(characterWorld[1].xyz));
          mvPosition.xy += (position.xy - (characterCenter - vec2(.5))) * characterScale;
          gl_Position = projectionMatrix * mvPosition;`)
        applySpriteDepth(shader, this.viewport, worldTexel, { value: new THREE.Vector4(0, 1, 0, 0) }, { map: { value: entry.depth.map.value }, enabled: { value: true } },
          { anchor: compact ? "characterWorldAnchor" : "(modelMatrix * instanceMatrix[3])", viewAnchor: "characterView", size: compact ? "length(characterWorldX)" : "length(characterWorld[0].xyz)", ground: "characterGround" })
        shader.fragmentShader = `flat varying vec3 vCharacterId;
          flat varying float vCharacterIndex;
          uniform sampler2D characterPalette;
          uniform float characterPaletteHeight;
        ` + shader.fragmentShader.replace("#include <map_fragment>", ids
          ? "#include <map_fragment>\ndiffuseColor.rgb = vCharacterId;"
          : `#include <map_fragment>
            ${!entry.complexion ? "" : `
            for (int i = 0; i < ${COMPLEXION_SLOTS}; i++) {
              vec2 at = vec2((float(i) + .5) / ${COMPLEXION_SLOTS * 2}.0, (vCharacterIndex + .5) / characterPaletteHeight);
              vec3 from = texture2D(characterPalette, at).rgb;
              if (all(lessThan(abs(diffuseColor.rgb - from), vec3(${MATCH_TOLERANCE})))) {
                diffuseColor.rgb = texture2D(characterPalette, at + vec2(.5, 0.0)).rgb; break;
              }
            }`}`)
      }
      material.onBeforeRender = renderer => { renderer.getCurrentViewport(this.viewport) }
      material.customProgramCacheKey = () => `character-batch-v4-${compact}-${ids}-${!!entry.complexion}`
      return material
    })
    this.root.name = "character-atlas-batch"
    this.root.userData.order = order
    this.root.userData.viewMatrix = new THREE.Matrix4()
    this.root.userData.compact = compact
  }

  write(entries: CharacterBatchEntry[], camera: THREE.Camera, parentsReady = false): void {
    this.root.visible = entries.length > 0
    if (!entries.length) return
    this.root.userData.viewMatrix.copy(camera.matrixWorldInverse)
    if (entries.length > this.capacity) {
      this.geometry?.dispose(); this.palette?.dispose(); this.body?.dispose(); this.ids?.dispose()
      this.root.clear()
      this.capacity = Math.max(16, 2 ** Math.ceil(Math.log2(entries.length)))
      this.geometry = new THREE.PlaneGeometry(1, 1)
      for (const [name, size] of [["characterUv", 4], ["characterView", 4], ["characterGround", 4], ["characterCenter", 2], ["characterId", 3], ["characterIndex", 1]] as const) {
        this.geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * size), size).setUsage(THREE.DynamicDrawUsage))
      }
      if (this.compact) for (const [name, size] of [["characterAnchor", 4], ["characterAxisX", 3], ["characterAxisY", 3]] as const) {
        this.geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * size), size).setUsage(THREE.DynamicDrawUsage))
      }
      const indices = this.geometry.getAttribute("characterIndex")
      for (let i = 0; i < this.capacity; i++) indices.setX(i, i)
      this.fixedRows.length = 0
      this.palette = new THREE.DataTexture(new Float32Array(this.capacity * COMPLEXION_SLOTS * 8), COMPLEXION_SLOTS * 2, this.capacity, THREE.RGBAFormat, THREE.FloatType)
      this.paletteRows.length = 0
      this.paletteUniform.value = this.palette; this.paletteHeight.value = this.capacity
      this.body = new THREE.InstancedMesh(this.geometry, this.materials[0], this.capacity)
      this.ids = new THREE.InstancedMesh(this.geometry, this.materials[1], 0)
      this.ids.instanceMatrix = this.body.instanceMatrix
      this.ids.layers.mask = OUTLINE_ID_LAYER_MASK
      for (const mesh of [this.body, this.ids]) {
        mesh.frustumCulled = false; mesh.raycast = () => {}
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        mesh.renderOrder = this.root.userData.order
        this.root.add(mesh)
      }
    }
    const uv = this.geometry.getAttribute("characterUv"), ground = this.geometry.getAttribute("characterGround")
    const view = this.geometry.getAttribute("characterView")
    const anchor = this.geometry.getAttribute("characterAnchor"), axisX = this.geometry.getAttribute("characterAxisX"), axisY = this.geometry.getAttribute("characterAxisY")
    const center = this.geometry.getAttribute("characterCenter"), id = this.geometry.getAttribute("characterId")
    const palette = this.palette.image.data as Float32Array
    let paletteChanged = this.palette.version === 0
    let fixedChanged = false
    let direct = 0
    entries.forEach((entry, i) => {
      const sprite = entry.sprite, texture = entry.color ?? sprite.material.map!, plane = entry.ground.value
      const parent = sprite.parent, q = sprite.quaternion, position = sprite.position
      // A normal billboard has no local offset/rotation. Its ready pose parent
      // supplies the anchor; only two scaled basis columns reach the shaders.
      // Retain the general path for editor transforms and manual matrices.
      const compactParent = this.compact && parentsReady && parent && sprite.matrixAutoUpdate && sprite.matrixWorldAutoUpdate &&
        position.x === 0 && position.y === 0 && position.z === 0 && q.x === 0 && q.y === 0 && q.z === 0 && q.w === 1
      // Game figures have already resolved their pose root for ground contact.
      if (compactParent) direct++
      else if (parentsReady) updateBillboardWorld(sprite)
      else sprite.updateWorldMatrix(true, false)
      // Match Three's CPU model-view multiply before conversion to float. Doing
      // this in the vertex shader rounds differently at coincident pose depths.
      const cameraView = camera.matrixWorldInverse.elements, world = compactParent ? parent.matrixWorld.elements : sprite.matrixWorld.elements
      const x = world[12], y = world[13], z = world[14], w = world[15]
      // Only the translation column is consumed. Preserve Matrix4's exact
      // multiply/add order without computing twelve unused matrix entries.
      view.setXYZW(i,
        cameraView[0] * x + cameraView[4] * y + cameraView[8] * z + cameraView[12] * w,
        cameraView[1] * x + cameraView[5] * y + cameraView[9] * z + cameraView[13] * w,
        cameraView[2] * x + cameraView[6] * y + cameraView[10] * z + cameraView[14] * w,
        cameraView[3] * x + cameraView[7] * y + cameraView[11] * z + cameraView[15] * w)
      if (this.compact) {
        const sx = compactParent ? sprite.scale.x : 1, sy = compactParent ? sprite.scale.y : 1
        anchor.setXYZW(i, x, y, z, w)
        axisX.setXYZ(i, world[0] * sx + 0, world[1] * sx + 0, world[2] * sx + 0)
        axisY.setXYZ(i, world[4] * sy + 0, world[5] * sy + 0, world[6] * sy + 0)
      } else this.body.instanceMatrix.array.set(sprite.matrixWorld.elements, i * 16)
      if (entry.uv) uv.setXYZW(i, entry.uv.x, entry.uv.y, entry.uv.z, entry.uv.w)
      else uv.setXYZW(i, texture.repeat.x, texture.repeat.y, texture.offset.x, texture.offset.y)
      ground.setXYZW(i, plane.x, plane.y, plane.z, plane.w)
      if (entry.fixedAttributes) {
        if (this.fixedRows[i] !== entry.fixedAttributes) {
          const values = entry.fixedAttributes
          center.setXY(i, values[0], values[1]); id.setXYZ(i, values[2], values[3], values[4])
          this.fixedRows[i] = values; fixedChanged = true
        }
      } else {
        center.setXY(i, sprite.center.x, sprite.center.y); id.setXYZ(i, entry.id.x, entry.id.y, entry.id.z)
        this.fixedRows[i] = undefined; fixedChanged = true
      }
      if (entry.palette) {
        if (this.paletteRows[i] !== entry.palette) {
          palette.set(entry.palette, i * COMPLEXION_SLOTS * 8)
          this.paletteRows[i] = entry.palette; paletteChanged = true
        }
      } else {
        this.paletteRows[i] = undefined
        for (let slot = 0; entry.complexion && slot < COMPLEXION_SLOTS; slot++) {
          const from = entry.complexion.complexionFrom.value[slot], to = entry.complexion.complexionTo.value[slot]
          const offset = (i * COMPLEXION_SLOTS * 2 + slot) * 4
          const target = offset + COMPLEXION_SLOTS * 4
          const fr = Math.fround(from.r), fg = Math.fround(from.g), fb = Math.fround(from.b)
          const tr = Math.fround(to.r), tg = Math.fround(to.g), tb = Math.fround(to.b)
          if (palette[offset] !== fr || palette[offset + 1] !== fg || palette[offset + 2] !== fb ||
            palette[target] !== tr || palette[target + 1] !== tg || palette[target + 2] !== tb) {
            palette[offset] = fr; palette[offset + 1] = fg; palette[offset + 2] = fb
            palette[target] = tr; palette[target + 1] = tg; palette[target + 2] = tb
            paletteChanged = true
          }
        }
      }
    })
    for (const attribute of [uv, view, ground]) attribute.needsUpdate = true
    if (fixedChanged) { center.needsUpdate = true; id.needsUpdate = true }
    this.body.count = this.ids.count = entries.length
    if (this.compact) for (const attribute of [anchor, axisX, axisY]) attribute.needsUpdate = true
    else this.body.instanceMatrix.needsUpdate = true
    // Ordinary recurring dynamic uploads only; excludes palette/identity changes
    // and initial allocation. Three uploads full capacity without update ranges.
    const preparation = this.root.userData.batchPreparation ??= {}
    preparation.entries = entries.length; preparation.direct = direct
    preparation.dynamicBytes = this.capacity * (this.compact ? 22 : 28) * 4
    if (paletteChanged) this.palette.needsUpdate = true
  }

  dispose() {
    this.geometry?.dispose(); this.palette?.dispose(); this.body?.dispose(); this.ids?.dispose()
    this.materials.forEach(material => material.dispose()); this.color.dispose()
  }
}
