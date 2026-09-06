"use client"

import type { GameMap } from "@/lib/game/map/types"
import { walkingSurface } from "@/lib/game/map/walking-surface"
import { personRecipe } from "@/lib/game/base-person/design"
import { BASE_PERSON } from "@/lib/game/base-person/pose"
import { walkContact, plantFoot, type FootPlant, DEFAULT_WALK_STRIDE } from "@/lib/game/base-person/gait"
import { ACTION_CLIPS } from "@/lib/game/base-person/pose"
import { activityClip } from "@/lib/game/base-person/activity"
import { crossedWoodcuttingImpact, woodcuttingProfile } from "@/lib/game/base-person/woodcutting"
import { strikeTree } from "@/lib/game/trees/impact"
import { useEffect, useMemo, useRef, useState } from "react"
import { useFrame, useLoader } from "@react-three/fiber"
import * as THREE from "three"
import { usePixelWorldTexel } from "@/components/pixel-canvas"
import { characterVisual, spriteRow, type CharacterModel } from "@/lib/game/character-assets"
import { usePopulationStore } from "@/lib/game/base-person/population-store"
import { populationVisual } from "@/lib/game/base-person/population-assets"
import type { TravelerAppearance } from "@/lib/game/base-person/population"
import { advanceWalkPhase, type WalkTuning } from "@/lib/game/motion"
import { usePersonDesignStore } from "@/lib/game/base-person/design-store"
import { useCharacterAssetStore } from "@/lib/game/character-asset-store"
import type { TravelerTypeId } from "@/lib/game/travelers"
import { applySpriteDepth } from "@/lib/game/render/sprite-depth"
import { OUTLINE_ID_LAYER_MASK, SELECTED_CHARACTER_LAYER } from "@/lib/game/render/outline"
import type { FigureClickHandler } from "./traveler-figure"

let nextSpriteOrder = 1

export function CharacterSprite({ map, type, onClick, outlineColor, selected = false, characterModel = "callings", characterScale = 1, characterFps, walkTuning, appearance, age = 18, visualOverride, name = "traveler" }: {
  map?: GameMap
  visualOverride?: ReturnType<typeof populationVisual>
  name?: "traveler" | "monk"
  type: TravelerTypeId
  appearance?: TravelerAppearance
  age?: number
  selected?: boolean
  onClick?: FigureClickHandler
  outlineColor?: [number, number, number]
  characterModel?: CharacterModel
  characterScale?: number
  characterFps?: number
  walkTuning?: WalkTuning
}) {
  const [renderOrder] = useState(() => nextSpriteOrder++)
  const asset = useCharacterAssetStore((s) => s.assets[type])
  const custom = usePersonDesignStore((s) => s.atlas)
  const population = usePopulationStore(s => s.pack)
  const varied = characterModel === "base" && !!appearance
  const visual = useMemo(() => visualOverride ?? (varied ? populationVisual(type, appearance.variant, population, age) :
    { ...characterVisual(asset, characterModel, custom), rowOffset: 0, strideRatio: 1 }),
    [visualOverride, asset, characterModel, custom, varied, appearance?.variant, population, type, age])
  const individualScale = characterScale * (varied ? appearance.scale : 1)
  const size = visual.scale * individualScale
  const fps = characterFps ?? visual.fps
  const rigBody = useMemo(() => visual.design ? personRecipe(visual.design).body : null, [visual.design])
  const poseRoot = useRef<THREE.Group>(null)
  const footPlant = useRef<FootPlant | null>(null)
  useEffect(() => { footPlant.current = null }, [map, rigBody])
  const origin = useMemo(() => new THREE.Vector3(), [])
  const contact = useMemo(() => new THREE.Vector3(), [])
  const corrected = useMemo(() => new THREE.Vector3(), [])
  const textureEntries = useMemo(() => [
    { clip: visual.walk, url: visual.walk.url }, { clip: visual.idle, url: visual.idle.url },
    ...ACTION_CLIPS.flatMap(name => {
      const clip = visual.actions[name]
      return clip ? [{ clip, url: clip.url }] : []
    }),
  ], [visual])
  const actionIndices = useMemo(() => {
    let index = 2
    return Object.fromEntries(ACTION_CLIPS.flatMap(name => visual.actions[name] ? [[name, index++]] : []))
  }, [visual])
  const sources = useLoader(THREE.TextureLoader, textureEntries.map(entry => entry.url))
  // Each traveler owns UV state; the loader still shares the decoded image.
  const textures = useMemo(() => sources.map((source, index) => {
    const map = source.clone()
    map.colorSpace = THREE.SRGBColorSpace
    map.magFilter = THREE.NearestFilter
    map.minFilter = THREE.NearestFilter
    map.generateMipmaps = false
    const clip = textureEntries[index].clip
    map.repeat.set(1 / clip.columns, 1 / clip.rows)
    map.offset.set(clip.stillFrame / clip.columns, (clip.rows - 1 - visual.rowOffset) / clip.rows)
    map.needsUpdate = true
    return map
  }), [sources, textureEntries, visual.rowOffset])
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures])
  const worldTexel = usePixelWorldTexel()
  const groundPlane = useMemo(() => ({ value: new THREE.Vector4() }), [])
  const groundAt = useMemo(() => map ? (x: number, z: number) => walkingSurface(map, x, z).height : undefined, [map])
  const viewport = useMemo(() => new THREE.Vector4(), [])
  const material = useMemo(() => {
    const material = new THREE.SpriteMaterial({ map: textures[1], alphaTest: 0.5, transparent: false, toneMapped: false })
    material.onBeforeCompile = (shader) => applySpriteDepth(shader, viewport, worldTexel, groundPlane)
    material.onBeforeRender = renderer => { renderer.getCurrentViewport(viewport) }
    material.customProgramCacheKey = () => "person-depth-v4"
    return material
  }, [textures, viewport, worldTexel, groundPlane])
  useEffect(() => () => material.dispose(), [material])
  const center = useMemo(() => new THREE.Vector2(...visual.center), [visual])
  const sprite = useRef<THREE.Sprite>(null)
  const clock = useRef(0)
  const actionClock = useRef(0)
  const lastClip = useRef("")
  const seeded = useRef(false)
  const facing = useMemo(() => new THREE.Vector3(), [])
  const lastFrame = useRef({ texture: null as THREE.Texture | null, frame: -1, row: -1 })
  const outlineMaterial = useMemo(() => {
    if (!outlineColor) return null
    // SpriteMaterial defaults to transparent. Blending an ID with the background
    // invents different objects along translucent ink edges, causing false halos.
    const material = new THREE.SpriteMaterial({ map: textures[1], alphaTest: 0.5, transparent: false, toneMapped: false })
    // Every traveler shares one compiled ID shader; identity is a uniform.
    // Embedding IDs in shader source compiled a new program for every person.
    const id = new THREE.Vector3(...outlineColor)
    material.onBeforeCompile = (shader) => {
      applySpriteDepth(shader, viewport, worldTexel, groundPlane)
      shader.uniforms.travelerId = { value: id }
      shader.fragmentShader = "uniform vec3 travelerId;\n" + shader.fragmentShader.replace("#include <map_fragment>",
        "#include <map_fragment>\ndiffuseColor.rgb = travelerId;")
    }
    material.onBeforeRender = renderer => { renderer.getCurrentViewport(viewport) }
    material.customProgramCacheKey = () => "traveler-id-v6"
    return material
  }, [textures, viewport, worldTexel, groundPlane, outlineColor?.[0], outlineColor?.[1], outlineColor?.[2]])
  useEffect(() => () => outlineMaterial?.dispose(), [outlineMaterial])

  useFrame(({ camera }, delta) => {
    const pitch = Math.max(0.01, Math.abs(camera.matrixWorld.elements[9] / camera.matrixWorld.elements[5]))
    const parent = poseRoot.current?.parent
    if (!parent) return
    // Road groups publish heading alongside position; avoid walking the scene
    // ancestry again for every sprite. Standalone previews use world facing.
    const heading = typeof parent.userData.heading === "number" ? parent.userData.heading :
      (parent.getWorldDirection(facing), Math.atan2(facing.x, facing.z))
    const yaw = Math.atan2(camera.matrixWorld.elements[8], camera.matrixWorld.elements[10])
    const moving = parent.userData.moving === true
    const requested = activityClip(parent.userData.activity, moving, parent.userData.carrying)
    const actionIndex = actionIndices[requested]
    const action = requested !== "walk" && requested !== "idle" ? visual.actions[requested] : undefined
    if (!seeded.current && parent.userData.initialized) {
      clock.current = (parent.userData.phase ?? 0) % 1
      seeded.current = true
    }
    const dt = Math.min(delta, 0.1) * (parent.userData.playbackRate ?? 1)
    if (requested !== lastClip.current) { actionClock.current = 0; lastClip.current = requested }
    const previousActionTime = actionClock.current
    if (requested !== "carrying" || moving) actionClock.current += dt
    if (moving) {
      const stride = visual.walkStride * individualScale * (walkTuning?.stride ?? DEFAULT_WALK_STRIDE) / DEFAULT_WALK_STRIDE
      clock.current = advanceWalkPhase(clock.current, parent.userData.distance ?? 0, dt,
        visual.walk.columns, fps, stride, walkTuning?.sync === true)
    }
    if (sprite.current) sprite.current.userData.walkPhase = clock.current
    const clip = action ?? (moving ? visual.walk : visual.idle)
    const texture = textures[actionIndex ?? (moving ? 0 : 1)]
    const frame = action ? requested === "carrying" ? Math.floor(clock.current * clip.columns) :
      Math.floor(actionClock.current * fps * (action.playbackRate ?? 1)) % clip.columns : moving ? Math.floor(clock.current * clip.columns) : clip.stillFrame
    if (requested === "treeFelling" && action && parent.userData.workTree) {
      const rate = fps * (action.playbackRate ?? 1)
      if (crossedWoodcuttingImpact(previousActionTime * rate, actionClock.current * rate, clip.columns, woodcuttingProfile(visual.design))) {
        strikeTree(parent.userData.workTree, heading)
      }
    }
    if (sprite.current) sprite.current.userData.clip = action ? requested : moving ? "walk" : "idle"
    const direction = spriteRow(heading, yaw)
    const row = visual.rowOffset + direction
    if (poseRoot.current) {
      if (moving && rigBody && walkTuning?.sync) {
        const foot = walkContact(clock.current, clip.columns, rigBody)
        // Reconstruct the baked ground contact in the current camera's ground
        // plane. The selected direction, not the smoothed group heading, is
        // what the artwork shows. This also handles changes in camera pitch.
        const rigScale = size / BASE_PERSON.camera.viewSize
        const angle = -direction * Math.PI / 4
        const x = (foot.x * Math.cos(angle) + foot.z * Math.sin(angle)) * rigScale
        const z = (-foot.x * Math.sin(angle) + foot.z * Math.cos(angle)) * rigScale
          * Math.sin(BASE_PERSON.camera.pitch * Math.PI / 180) / Math.sin(Math.atan(pitch))
        contact.set(x * Math.cos(yaw) + z * Math.sin(yaw), 0, -x * Math.sin(yaw) + z * Math.cos(yaw))
        parent.getWorldPosition(origin)
        const key = `${requested}:${foot.side}:${direction}:${yaw.toFixed(4)}:${pitch.toFixed(4)}:${size}`
        const planted = plantFoot(footPlant.current, key, origin, contact, groundAt)
        footPlant.current = planted.plant
        corrected.set(origin.x + planted.offset.x, origin.y + planted.offset.y, origin.z + planted.offset.z)
        poseRoot.current.position.copy(parent.worldToLocal(corrected))
      } else {
        footPlant.current = null
        poseRoot.current.position.set(0, 0, 0)
      }
    }
    // Ground and body/selection passes share the same local terrain plane.
    // Flying monks release contact and use the normal airborne depth model.
    if (map && parent.userData.activity !== "flying" && poseRoot.current) {
      poseRoot.current.getWorldPosition(corrected)
      const surface = walkingSurface(map, corrected.x, corrected.z)
      groundPlane.value.set(-surface.dx, 1, -surface.dz,
        surface.dx * corrected.x + surface.dz * corrected.z - surface.height)
    } else groundPlane.value.set(0, 0, 0, 0)
    const previous = lastFrame.current
    // Distance timing must display the current pose even at low animation FPS.
    if (previous.texture === texture && previous.row === row && previous.frame === frame) return
    previous.texture = texture; previous.frame = frame; previous.row = row
    texture.offset.set(frame / clip.columns, (clip.rows - 1 - row) / clip.rows)
    material.map = texture
    if (outlineMaterial) outlineMaterial.map = texture
  })

  // Equal-depth overlaps must choose the same traveler in the color and ID passes.
  return (
    <group ref={poseRoot}>
      <sprite renderOrder={renderOrder} ref={sprite} layers-mask={selected ? 1 | (1 << SELECTED_CHARACTER_LAYER) : 1} name={name} material={material} onClick={onClick} scale={[size, size, 1]} center={center} userData={{ characterModel, calling: type, variant: varied ? appearance.variant : null, appearanceScale: varied ? appearance.scale : 1, bodyType: visual.design?.bodyType, design: visual.design, fps, sync: walkTuning?.sync === true }} />
      {outlineMaterial && <sprite renderOrder={renderOrder} layers-mask={OUTLINE_ID_LAYER_MASK} material={outlineMaterial}
        scale={[size, size, 1]} center={center} />}
    </group>
  )
}
