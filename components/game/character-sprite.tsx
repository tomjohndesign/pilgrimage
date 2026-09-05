"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame, useLoader } from "@react-three/fiber"
import * as THREE from "three"
import { characterVisual, spriteRow, type CharacterModel } from "@/lib/game/character-assets"
import { advanceWalkPhase, type WalkTuning } from "@/lib/game/motion"
import { usePersonDesignStore } from "@/lib/game/base-person/design-store"
import { useCharacterAssetStore } from "@/lib/game/character-asset-store"
import type { TravelerTypeId } from "@/lib/game/travelers"
import { applySpriteDepth } from "@/lib/game/render/sprite-depth"
import { OUTLINE_ID_LAYER_MASK, SELECTED_CHARACTER_LAYER } from "@/lib/game/render/outline"
import type { FigureClickHandler } from "./traveler-figure"

export function CharacterSprite({ type, onClick, outlineColor, selected = false, characterModel = "callings", characterScale = 1, characterFps, walkTuning }: {
  type: TravelerTypeId
  selected?: boolean
  onClick?: FigureClickHandler
  outlineColor?: [number, number, number]
  characterModel?: CharacterModel
  characterScale?: number
  characterFps?: number
  walkTuning?: WalkTuning
}) {
  const asset = useCharacterAssetStore((s) => s.assets[type])
  const custom = usePersonDesignStore((s) => s.atlas)
  const visual = useMemo(() => characterVisual(asset, characterModel, custom), [asset, characterModel, custom])
  const size = visual.scale * characterScale
  const fps = characterFps ?? visual.fps
  const sources = useLoader(THREE.TextureLoader, [visual.walk.url, visual.idle.url, ...(visual.shadow ? [visual.shadow.walk, visual.shadow.idle] : [])])
  // Each traveler owns UV state; the loader still shares the decoded image.
  const textures = useMemo(() => sources.map((source, index) => {
    const map = source.clone()
    map.colorSpace = THREE.SRGBColorSpace
    map.magFilter = THREE.NearestFilter
    map.minFilter = THREE.NearestFilter
    map.generateMipmaps = false
    const clip = index % 2 === 0 ? visual.walk : visual.idle
    map.repeat.set(1 / clip.columns, 1 / clip.rows)
    map.offset.set(clip.stillFrame / clip.columns, (clip.rows - 1) / clip.rows)
    map.needsUpdate = true
    return map
  }), [sources, visual])
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures])
  const depth = useMemo(() => new THREE.Vector3(Math.SQRT1_2, Math.SQRT2, 1 / 400), [])
  const material = useMemo(() => {
    const material = new THREE.SpriteMaterial({ map: textures[1], alphaTest: 0.5, transparent: false, toneMapped: false })
    material.onBeforeCompile = (shader) => applySpriteDepth(shader, depth)
    material.customProgramCacheKey = () => "person-depth-v1"
    return material
  }, [textures, depth])
  useEffect(() => () => material.dispose(), [material])
  const shadowMaterial = useMemo(() => {
    if (!visual.shadow) return null
    const material = new THREE.SpriteMaterial({ map: textures[3], transparent: true, depthWrite: false, toneMapped: false })
    material.onBeforeCompile = shader => applySpriteDepth(shader, depth, true)
    material.customProgramCacheKey = () => "person-ground-shadow-v1"
    return material
  }, [textures, depth, visual.shadow])
  useEffect(() => () => shadowMaterial?.dispose(), [shadowMaterial])
  const center = useMemo(() => new THREE.Vector2(...visual.center), [visual])
  const sprite = useRef<THREE.Sprite>(null)
  const clock = useRef(0)
  const seeded = useRef(false)
  const frameElapsed = useRef(0)
  const facing = useMemo(() => new THREE.Vector3(), [])
  const lastFrame = useRef({ texture: null as THREE.Texture | null, frame: -1, row: -1 })
  const outlineMaterial = useMemo(() => {
    if (!outlineColor) return null
    const material = new THREE.SpriteMaterial({ map: textures[1], alphaTest: 0.5, toneMapped: false })
    // Every traveler shares one compiled ID shader; identity is a uniform.
    // Embedding IDs in shader source compiled a new program for every person.
    const id = new THREE.Vector3(...outlineColor)
    material.onBeforeCompile = (shader) => {
      applySpriteDepth(shader, depth)
      shader.uniforms.travelerId = { value: id }
      shader.fragmentShader = "uniform vec3 travelerId;\n" + shader.fragmentShader.replace("#include <map_fragment>",
        "#include <map_fragment>\ndiffuseColor.rgb = travelerId;")
    }
    material.customProgramCacheKey = () => "traveler-id-v3"
    return material
  }, [textures, depth, outlineColor?.[0], outlineColor?.[1], outlineColor?.[2]])
  useEffect(() => () => outlineMaterial?.dispose(), [outlineMaterial])

  useFrame(({ camera }, delta) => {
    const pitch = Math.max(0.01, Math.abs(camera.matrixWorld.elements[9] / camera.matrixWorld.elements[5]))
    depth.set(pitch, 1 / pitch, Math.abs(camera.projectionMatrix.elements[10]) / 2)
    const parent = sprite.current?.parent
    if (!parent) return
    // Road groups publish heading alongside position; avoid walking the scene
    // ancestry again for every sprite. Standalone previews use world facing.
    const heading = typeof parent.userData.heading === "number" ? parent.userData.heading :
      (parent.getWorldDirection(facing), Math.atan2(facing.x, facing.z))
    const yaw = Math.atan2(camera.matrixWorld.elements[8], camera.matrixWorld.elements[10])
    const moving = parent.userData.moving === true
    if (!seeded.current && parent.userData.initialized) {
      clock.current = (parent.userData.phase ?? 0) % 1
      seeded.current = true
    }
    const dt = Math.min(delta, 0.1) * (parent.userData.playbackRate ?? 1)
    frameElapsed.current += dt
    if (moving) {
      const stride = (walkTuning?.stride ?? 0.44) * characterScale / (characterModel === "base" ? 1.5 : 1)
      clock.current = advanceWalkPhase(clock.current, parent.userData.distance ?? 0, dt,
        visual.walk.columns, fps, stride, walkTuning?.sync === true)
    }
    if (sprite.current) sprite.current.userData.walkPhase = clock.current
    const clip = moving ? visual.walk : visual.idle
    const texture = textures[moving ? 0 : 1]
    const frame = moving ? Math.floor(clock.current * clip.columns) : clip.stillFrame
    const row = spriteRow(heading, yaw)
    const previous = lastFrame.current
    if (previous.texture === texture && previous.row === row) {
      if (previous.frame === frame) return
      if (walkTuning?.sync && frameElapsed.current < 1 / fps) return
    }
    frameElapsed.current %= 1 / fps
    previous.texture = texture; previous.frame = frame; previous.row = row
    texture.offset.set(frame / clip.columns, (clip.rows - 1 - row) / clip.rows)
    material.map = texture
    if (outlineMaterial) outlineMaterial.map = texture
    if (shadowMaterial) {
      const shadowTexture = textures[moving ? 2 : 3]
      shadowTexture.offset.copy(texture.offset)
      shadowMaterial.map = shadowTexture
    }
  })

  return (
    <>
      {shadowMaterial && <sprite name="traveler-shadow" material={shadowMaterial} scale={[size, size, 1]} center={center} raycast={() => {}} />}
      <sprite ref={sprite} layers-mask={selected ? 1 | (1 << SELECTED_CHARACTER_LAYER) : 1} name="traveler" material={material} onClick={onClick} scale={[size, size, 1]} center={center} userData={{ characterModel, fps, sync: walkTuning?.sync === true }} />
      {outlineMaterial && <sprite layers-mask={OUTLINE_ID_LAYER_MASK} material={outlineMaterial}
        scale={[size, size, 1]} center={center} />}
    </>
  )
}
