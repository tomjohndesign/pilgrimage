"use client"

import { useContext } from "react"
import { CharacterMapContext } from "./character-map-context"

import { useCharacterBatches, characterBatchControl } from "./character-batches"
import { spriteTextureView } from "@/lib/game/render/sprite-texture"
import { SpriteFrame } from "./sprite-frames"
import { isWorldVisible } from "@/lib/game/render/visibility"
import { sceneryDetail } from "@/lib/game/render/scenery-detail"
import { characterPalette, registerCharacterBatchEntry, type CharacterBatchEntry } from "@/lib/game/render/character-batch"
import { spriteView, SPRITE_DIRECTIONS } from "@/lib/game/render/sprite-view"
import { spriteGait } from "@/lib/game/render/sprite-gait"
import { updateTranslatedWorld } from "@/lib/game/render/sprite-transforms"
import { registerSimpleBatchSource } from "@/lib/game/render/batch-source-visibility"
import { type CrowdWalk } from "@/lib/game/render/crowd-walk"
import { frameProfile } from "@/lib/game/render/frame-profile"

import { RoadsideSignals } from "./roadside-signals"
import { MINSTREL_PLAYING } from "@/lib/game/minstrel/assets"
import type { FrameRegistration } from "@/lib/game/base-person/bake"
import type { GameMap } from "@/lib/game/map/types"
import { walkingSurface } from "@/lib/game/map/walking-surface"
import { characterSupport } from "@/lib/game/character-support"
import { restContacts, restContactOrigin } from "@/lib/game/base-person/rest-contact"
import { BASE_PERSON } from "@/lib/game/base-person/pose"
import { walkContact, reducedWalkFrame, crossedWalkSupport, plantFoot, type FootPlant, type FootPlantResult, DEFAULT_WALK_STRIDE } from "@/lib/game/base-person/gait"
import { ACTION_CLIPS } from "@/lib/game/base-person/pose"
import { activityClip } from "@/lib/game/base-person/activity"
import { crossedWoodcuttingImpact, woodcuttingProfile } from "@/lib/game/base-person/woodcutting"
import { workContacts, workContactOrigin, trunkContact } from "@/lib/game/base-person/work-contact"
import { strikeTree } from "@/lib/game/trees/impact"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useLoader, type RootState } from "@react-three/fiber"
import * as THREE from "three"
import { usePixelWorldTexel } from "@/components/pixel-canvas"
import { characterVisual, spriteRow, type SpriteClip, type CharacterModel } from "@/lib/game/character-assets"
import { usePopulationStore } from "@/lib/game/base-person/population-store"
import { populationVisual } from "@/lib/game/base-person/population-assets"
import type { TravelerAppearance } from "@/lib/game/base-person/population"
import { advanceWalkPhase, walkClipFrame, type WalkTuning } from "@/lib/game/motion"
import { usePersonDesignStore } from "@/lib/game/base-person/design-store"
import { useCharacterAssetStore } from "@/lib/game/character-asset-store"
import type { TravelerTypeId } from "@/lib/game/travelers"
import { applySpriteDepth, configureSpriteDepthTexture, spriteRenderOrder, type SpritePoseDepth } from "@/lib/game/render/sprite-depth"
import { applyComplexionSwap, complexionUniforms } from "@/lib/game/render/complexion-swap"
import { complexionSwap, type Complexion } from "@/lib/game/base-person/complexion"
import { OUTLINE_ID_LAYER_MASK, SELECTED_CHARACTER_LAYER } from "@/lib/game/render/outline"
import type { FigureClickHandler } from "./traveler-figure"

export function CharacterSprite({ map: suppliedMap, type, onClick, outlineColor, selected = false, characterModel = "callings", characterScale = 1, characterFps, walkTuning, appearance, complexion = appearance?.complexion, age = 18, visualOverride, attachment, flightClip, name = "traveler" }: {
  attachment?: { content: ReactNode; clips: Partial<Record<"hoisting" | "procession", FrameRegistration[]>>; cellSize: number; anchor: number[]; restPosition?: [number, number, number] }
  flightClip?: SpriteClip & { fps: number; reservedTones?: boolean }
  map?: GameMap
  visualOverride?: ReturnType<typeof populationVisual>
  name?: "traveler" | "monk"
  type: TravelerTypeId
  appearance?: TravelerAppearance
  /** Individual skin and hair colouring; travelers carry their own in `appearance`. */
  complexion?: Complexion
  age?: number
  selected?: boolean
  onClick?: FigureClickHandler
  outlineColor?: [number, number, number]
  characterModel?: CharacterModel
  characterScale?: number
  characterFps?: number
  walkTuning?: WalkTuning
}) {
  const contextMap = useContext(CharacterMapContext)
  const map = suppliedMap ?? contextMap
  const [renderOrder] = useState(spriteRenderOrder)
  // Sample a small, stable subset; timing every NPC would distort the crowd.
  const samplePose = process.env.NEXT_PUBLIC_GAME_BENCHMARK === "1" && renderOrder % 128 === 0
  const asset = useCharacterAssetStore((s) => s.assets[type])
  const custom = usePersonDesignStore((s) => s.atlas)
  const population = usePopulationStore(s => s.pack)
  const varied = (characterModel === "base" || type === "beggar") && !!appearance
  const visual = useMemo(() => visualOverride ?? (varied || type === "beggar" ? populationVisual(type, appearance?.variant ?? 0, population, age) :
    { ...characterVisual(asset, characterModel, custom), rowOffset: 0, strideRatio: 1, reservedTones: false }),
    [visualOverride, asset, characterModel, custom, varied, appearance?.variant, population, type, age])
  const individualScale = characterScale * (varied ? appearance.scale : 1)
  const size = visual.scale * individualScale
  const fps = characterFps ?? visual.fps
  const rig = useMemo(() => visual.design ? spriteGait(visual.design) : null, [visual.design])
  const rigBody = rig?.body
  const work = useMemo(() => visual.design ? workContacts(visual.design) : null, [visual.design])
  const poseState = useMemo(() => ({ phase: 0, actionTime: 0, clip: "", seeded: false, plant: null as FootPlant | null,
    texture: null as THREE.Texture | null, frame: -1, row: -1 }), [])
  const poseRoot = useRef<THREE.Group>(null)
  const attachmentRoot = useRef<THREE.Group>(null)
  const attachmentPoint = useMemo(() => new THREE.Vector3(), [])
  const plantedResult = useMemo<FootPlantResult>(() => ({ plant: { key: "", anchor: { x: 0, y: 0, z: 0 }, origin: { x: 0, y: 0, z: 0 } }, offset: { x: 0, y: 0, z: 0 } }), [])
  const displayedContact = useMemo(() => ({ frame: -1, columns: -1, strides: -1, foot: null as ReturnType<typeof walkContact> | null }), [rigBody])
  const contactKey = useMemo(() => ({ action: "", detail: -1, direction: -1, view: "", size: -1, left: "", right: "" }), [])
  useEffect(() => { poseState.plant = null }, [map, rigBody])
  const origin = useMemo(() => new THREE.Vector3(), [])
  const parentInverse = useMemo(() => new THREE.Matrix4(), [])
  const contact = useMemo(() => new THREE.Vector3(), [])
  const corrected = useMemo(() => new THREE.Vector3(), [])
  const playingClip = !visualOverride && varied && type === "minstrel" ? MINSTREL_PLAYING : undefined
  const textureEntries = useMemo(() => [
    { clip: visual.walk, url: visual.walk.url }, { clip: visual.idle, url: visual.idle.url },
    ...ACTION_CLIPS.flatMap(name => {
      const clip = visual.actions[name]
      return clip ? [{ clip, url: clip.url }] : []
    }),
    ...(playingClip ? [{ clip: playingClip, url: playingClip.url }] : []),
    ...(flightClip ? [{ clip: flightClip, url: flightClip.url }] : []),
  ], [visual, flightClip, playingClip])
  const actionIndices = useMemo(() => {
    let index = 2
    return Object.fromEntries(ACTION_CLIPS.flatMap(name => visual.actions[name] ? [[name, index++]] : []))
  }, [visual])
  const depthEntries = textureEntries.flatMap(({ clip }, index) => (clip as SpriteClip).depth ? [{ index, url: (clip as SpriteClip).depth! }] : [])
  const sources = useLoader(THREE.TextureLoader, [...textureEntries.map(entry => entry.url), ...depthEntries.map(entry => entry.url)])
  const depthTextures = useMemo(() => new Map(depthEntries.map((entry, index) =>
    [entry.index, configureSpriteDepthTexture(sources[textureEntries.length + index])])), [sources, textureEntries])
  const poseDepth = useMemo<SpritePoseDepth>(() => ({ map: { value: null }, enabled: { value: false } }), [])
  // Each traveler owns UV state only for clips they have actually played.
  // Eager views for every possible job/prayer/sleep animation left hundreds of
  // thousands of unused Texture objects in the heap at large populations.
  const textures = useMemo(() => {
    const views = new Map<number, THREE.Texture>()
    return {
      length: textureEntries.length,
      get(index: number) {
        let texture = views.get(index)
        if (!texture) {
          texture = spriteTextureView(sources[index])
          const clip = textureEntries[index].clip
          texture.repeat.set(1 / clip.columns, 1 / clip.rows)
          texture.offset.set(clip.stillFrame / clip.columns, (clip.rows - 1 - visual.rowOffset) / clip.rows)
          views.set(index, texture)
        }
        return texture
      },
      dispose() { for (const texture of views.values()) texture.dispose(); views.clear() },
    }
  }, [sources, textureEntries, visual.rowOffset])
  useEffect(() => () => textures.dispose(), [textures])
  const worldTexel = usePixelWorldTexel()
  const groundPlane = useMemo(() => ({ value: new THREE.Vector4() }), [])
  const groundAt = useMemo(() => map ? (x: number, z: number) => walkingSurface(map, x, z).height : undefined, [map])
  const viewport = useMemo(() => new THREE.Vector4(), [])
  // Only artwork baked with reserved skin and hair entries may be recoloured;
  // older atlases share those colours with props and would bleed. One material
  // covers every clip a character can play, so they all have to qualify.
  const recolourable = visual.reservedTones && (playingClip?.reservedTones ?? true) && (flightClip?.reservedTones ?? true)
  const swap = useMemo(() => complexionSwap(recolourable ? visual.design : undefined, complexion),
    [recolourable, visual.design, complexion?.skin, complexion?.hair])
  const complexionValues = useMemo(() => complexionUniforms(swap), [swap])
  const material = useMemo(() => {
    const material = new THREE.SpriteMaterial({ map: textures.get(1), alphaTest: 0.5, transparent: false, toneMapped: false })
    const uniforms = complexionValues
    material.onBeforeCompile = (shader) => {
      applySpriteDepth(shader, viewport, worldTexel, groundPlane, poseDepth)
      applyComplexionSwap(shader, uniforms)
    }
    material.onBeforeRender = renderer => { renderer.getCurrentViewport(viewport) }
    material.customProgramCacheKey = () => "person-complexion-v1"
    return material
  }, [textures, viewport, worldTexel, groundPlane, poseDepth, complexionValues])
  useEffect(() => () => material.dispose(), [material])
  const center = useMemo(() => new THREE.Vector2(...visual.center), [visual])
  const sprite = useRef<THREE.Sprite>(null)
  const facing = useMemo(() => new THREE.Vector3(), [])
  const outlineMaterial = useMemo(() => {
    if (!outlineColor) return null
    // SpriteMaterial defaults to transparent. Blending an ID with the background
    // invents different objects along translucent ink edges, causing false halos.
    const material = new THREE.SpriteMaterial({ map: textures.get(1), alphaTest: 0.5, transparent: false, toneMapped: false })
    // Every traveler shares one compiled ID shader; identity is a uniform.
    // Embedding IDs in shader source compiled a new program for every person.
    const id = new THREE.Vector3(...outlineColor)
    material.userData.objectId = id
    material.onBeforeCompile = (shader) => {
      applySpriteDepth(shader, viewport, worldTexel, groundPlane, poseDepth)
      shader.uniforms.travelerId = { value: id }
      shader.fragmentShader = "uniform vec3 travelerId;\n" + shader.fragmentShader.replace("#include <map_fragment>",
        "#include <map_fragment>\ndiffuseColor.rgb = travelerId;")
    }
    material.onBeforeRender = renderer => { renderer.getCurrentViewport(viewport) }
    material.customProgramCacheKey = () => "traveler-id-v7"
    return material
  }, [textures, viewport, worldTexel, groundPlane, poseDepth, outlineColor?.[0], outlineColor?.[1], outlineColor?.[2]])
  useEffect(() => () => outlineMaterial?.dispose(), [outlineMaterial])
  const idSprite = useRef<THREE.Sprite>(null)
  const batchEntries = useCharacterBatches()
  const batchEntry = useRef<CharacterBatchEntry | null>(null)
  const batchUv = useMemo(() => new THREE.Vector4(), [])
  useLayoutEffect(() => {
    if (!batchEntries || !sprite.current || !idSprite.current || !outlineColor || name !== "traveler") return
    const entry = { sprite: sprite.current, ids: idSprite.current, publishesPose: true, complexion: complexionValues, palette: characterPalette(complexionValues), ground: groundPlane,
      fixedAttributes: Float32Array.from([center.x, center.y, ...outlineColor]), depth: poseDepth, id: new THREE.Vector3(...outlineColor) }
    batchEntry.current = entry
    const unregisterEntry = registerCharacterBatchEntry(entry)
    batchEntries.add(entry)
    const unregister = registerSimpleBatchSource(entry.sprite, entry.ids)
    return () => { batchEntry.current = null; unregisterEntry(); unregister(); batchEntries.delete(entry); entry.sprite.visible = entry.ids.visible = true }
  }, [batchEntries, complexionValues, groundPlane, poseDepth, name, center, outlineColor?.[0], outlineColor?.[1], outlineColor?.[2]])

  const crowdWalk = useMemo<CrowdWalk | null>(() => map && rig && !attachment && walkTuning?.sync !== false ? {
    map, rig, walk: visual.walk, weary: visual.actions.wearyWalk, wearyIndex: actionIndices.wearyWalk,
    sources, depths: depthTextures, rowOffset: visual.rowOffset, size,
    stride: visual.walkStride * individualScale * (walkTuning?.stride ?? DEFAULT_WALK_STRIDE) / DEFAULT_WALK_STRIDE,
    authoredStride: visual.walkStride * individualScale, fps, state: poseState,
    inverse: parentInverse, origin, contact, corrected, planted: plantedResult, groundAt: groundAt!, key: contactKey, uv: batchUv,
  } : null, [map, rig, attachment, walkTuning?.sync, walkTuning?.stride, visual, actionIndices, sources, depthTextures,
    size, individualScale, fps, poseState, parentInverse, origin, contact, corrected, plantedResult, groundAt, contactKey, batchUv])

  const updateFrame = ({ camera, scene, clock: frameClock }: RootState, delta: number) => {
    const parent = poseRoot.current?.parent
    if (!parent) return
    // The figure's owner clears `visible` once the camera leaves it behind
    // (see travelers.tsx). Advancing a walk cycle nobody can watch is the
    // single biggest per-character cost at high traffic; it resumes from the
    // walker's live distance the frame it comes back into view.
    if (!isWorldVisible(parent)) return
    const selectionStarted = samplePose ? frameProfile.start() : 0
    const view = spriteView(camera), { pitch, yaw } = view
    // Resolve ancestry once for all contact/terrain queries in this pose.
    if (parent.name !== "traveler-unit" || parent.userData.poseWorldFrame !== frameClock.elapsedTime) parent.updateWorldMatrix(true, false)
    parentInverse.copy(parent.matrixWorld).invert()
    // Road groups publish heading alongside position; avoid walking the scene
    // ancestry again for every sprite. Standalone previews use world facing.
    let heading = typeof parent.userData.heading === "number" ? parent.userData.heading :
      (parent.getWorldDirection(facing), Math.atan2(facing.x, facing.z))
    const moving = parent.userData.moving === true
    const flight = parent.userData.activity === "flying" ? flightClip : undefined
    const playing = parent.userData.activity === "performing" ? playingClip : undefined
    const special = flight ?? playing
    const refreshment: import("@/lib/game/base-person/pose").ActionClip | undefined = parent.userData.refreshmentClip
    const requested = !moving && refreshment && visual.actions[refreshment] ? refreshment : activityClip(parent.userData.activity, moving, parent.userData.carrying, parent.userData.weary === true)
    const actionIndex = actionIndices[requested]
    const action = requested !== "walk" && requested !== "idle" ? visual.actions[requested] : undefined
    const workTree = !moving && action && work && (requested === "treeFelling" || requested === "woodcutting")
      ? parent.userData.workTree : undefined
    const workPoint = workTree && work ? work[requested as keyof typeof work] : undefined
    const workTarget = workTree && workPoint ? requested === "treeFelling"
      ? trunkContact(workTree, workPoint[1] * size / BASE_PERSON.camera.viewSize) : workTree : undefined
    if (workTarget && workPoint) {
      origin.setFromMatrixPosition(parent.matrixWorld)
      heading = Math.atan2(workTarget.x - origin.x, workTarget.z - origin.z) - Math.atan2(workPoint[0], workPoint[2])
    }
    if (!poseState.seeded && parent.userData.initialized) {
      poseState.phase = (parent.userData.phase ?? 0) % 1
      poseState.seeded = true
    }
    if (parent.userData.motionReset) poseState.plant = null
    const dt = Math.min(delta, 0.1) * (parent.userData.playbackRate ?? 1)
    const clipKey = flight ? "flying" : playing ? "performing" : requested
    if (clipKey !== poseState.clip) { poseState.actionTime = 0; poseState.clip = clipKey }
    const previousActionTime = poseState.actionTime
    if ((requested !== "carrying" && requested !== "procession") || moving) poseState.actionTime += dt
    const previousWalkPhase = poseState.phase
    let advancedStrides = 0
    if (moving) {
      const stride = visual.walkStride * individualScale * (walkTuning?.stride ?? DEFAULT_WALK_STRIDE) / DEFAULT_WALK_STRIDE
      const distance = parent.userData.playbackRate === 0 ? 0 : parent.userData.distance ?? 0
      advancedStrides = distance / Math.max(.01, stride)
      poseState.phase = advanceWalkPhase(poseState.phase, distance, dt,
        visual.walk.columns, fps, stride, walkTuning?.sync !== false, visual.walk.strides ?? 1)
    }
    if (sprite.current) {
      const data = sprite.current.userData
      data.walkPhase = poseState.phase; data.walkStride = visual.walkStride * individualScale; data.distance = parent.userData.distance ?? 0
    }
    const clip: SpriteClip = special ?? action ?? (moving ? visual.walk : visual.idle)
    const textureIndex = flight ? textures.length - 1 : playing ? textures.length - 1 - (flightClip ? 1 : 0) : actionIndex ?? (moving ? 0 : 1)
    poseDepth.map.value = depthTextures.get(textureIndex) ?? null
    poseDepth.enabled.value = poseDepth.map.value !== null
    let frame = special ? Math.floor(poseState.actionTime * special.fps) % special.columns : action ? (requested === "carrying" || requested === "procession" || requested === "wearyWalk") ? walkClipFrame(poseState.phase, clip.columns, clip.strides ?? 1) :
      Math.floor(poseState.actionTime * fps * (action.playbackRate ?? 1)) % clip.columns : moving ? walkClipFrame(poseState.phase, clip.columns, clip.strides ?? 1) : clip.stillFrame
    const walkingPose = !special && moving && (requested === "walk" || requested === "wearyWalk" || requested === "carrying" || requested === "procession")
    const walkDetail = walkingPose && map && !selected ? sceneryDetail(scene) : 0
    if (walkingPose) frame = reducedWalkFrame(frame, clip.columns, clip.strides ?? 1, walkDetail)
    if (sprite.current) { sprite.current.userData.walkDetail = walkDetail; sprite.current.userData.displayedFrame = frame }
    if (requested === "hoisting") {
      const progress = parent.userData.actionProgress ?? poseState.actionTime
      frame = Math.min(clip.columns - 1, Math.floor(progress * fps))
      if (parent.userData.lowering) frame = clip.columns - 1 - frame
    }
    if (requested === "treeFelling" && action && parent.userData.workTree) {
      const rate = fps * (action.playbackRate ?? 1)
      if (crossedWoodcuttingImpact(previousActionTime * rate, poseState.actionTime * rate, clip.columns, woodcuttingProfile(visual.design))) {
        strikeTree(parent.userData.workTree, heading)
      }
    }
    if (sprite.current) sprite.current.userData.clip = flight ? "flying" : playing ? "performing" : action ? requested : moving ? "walk" : "idle"
    origin.setFromMatrixPosition(parent.matrixWorld)
    const support = map && !moving && !special && action ? characterSupport(map, origin.x, origin.z, requested) : undefined
    if (support) heading = support.heading
    const direction = spriteRow(heading, yaw)
    const row = visual.rowOffset + direction
    if (samplePose) frameProfile.end("sampleSpriteSelection", selectionStarted)
    const contactStarted = samplePose ? frameProfile.start() : 0
    if (poseRoot.current) {
      if (workTarget && workPoint) {
        poseState.plant = null
        const aligned = workContactOrigin(workTarget, workPoint, direction, yaw, pitch, size / BASE_PERSON.camera.viewSize, groundAt)
        // Standing trunk and persistent stump share this world origin. Only the
        // character moves into the authored work stance; the target never jumps.
        corrected.set(aligned.x, aligned.y, aligned.z)
        poseRoot.current.position.copy(corrected.applyMatrix4(parentInverse))
      } else if (moving && rigBody && walkTuning?.sync !== false) {
        if (crossedWalkSupport(previousWalkPhase, advancedStrides, clip.columns, clip.strides ?? 1)) poseState.plant = null
        const strides = clip.strides ?? 1
        if (!walkingPose || !displayedContact.foot || displayedContact.frame !== frame || displayedContact.columns !== clip.columns || displayedContact.strides !== strides) {
          displayedContact.frame = walkingPose ? frame : -1; displayedContact.columns = clip.columns; displayedContact.strides = strides
          // Contact, color, depth and attachment sockets all use this same pose.
          displayedContact.foot = walkingPose ? rig!.contact(frame, clip.columns, strides) : walkContact(poseState.phase, clip.columns, rigBody, strides)
        }
        const foot = displayedContact.foot
        // Reconstruct the baked ground contact in the current camera's ground
        // plane. The selected direction, not the smoothed group heading, is
        // what the artwork shows. This also handles changes in camera pitch.
        const rigScale = size / BASE_PERSON.camera.viewSize
        const turn = SPRITE_DIRECTIONS[direction]
        const x = (foot.x * turn.cos + foot.z * turn.sin) * rigScale
        const z = (-foot.x * turn.sin + foot.z * turn.cos) * rigScale * view.depthScale
        contact.set(x * view.cosYaw + z * view.sinYaw, 0, -x * view.sinYaw + z * view.cosYaw)
        origin.setFromMatrixPosition(parent.matrixWorld)
        if (contactKey.action !== requested || contactKey.detail !== walkDetail ||
          contactKey.direction !== direction || contactKey.view !== view.key || contactKey.size !== size) {
          contactKey.action = requested; contactKey.detail = walkDetail
          contactKey.direction = direction; contactKey.view = view.key; contactKey.size = size
          contactKey.left = `${requested}:${walkDetail}:left:${direction}:${view.key}:${size}`
          contactKey.right = `${requested}:${walkDetail}:right:${direction}:${view.key}:${size}`
        }
        const planted = plantFoot(poseState.plant, contactKey[foot.side], origin, contact, groundAt, plantedResult)
        poseState.plant = planted.plant
        corrected.set(origin.x + planted.offset.x, origin.y + planted.offset.y, origin.z + planted.offset.z)
        poseRoot.current.position.copy(corrected.applyMatrix4(parentInverse))
      } else {
        poseState.plant = null
        if (support && visual.design && (requested === "sitting" || requested === "sleeping" || requested === "seatedPrayer" || requested === "seatedMeal" || requested === "seatedDrink")) {
          const point = restContacts(visual.design, requested, clip.columns)[frame]
          const aligned = restContactOrigin({ ...support.anchor, y: support.height }, point,
            direction, yaw, pitch, size / BASE_PERSON.camera.viewSize)
          corrected.set(aligned.x, aligned.y, aligned.z)
          poseRoot.current.position.copy(corrected.applyMatrix4(parentInverse))
        } else poseRoot.current.position.set(0, 0, 0)
      }
    }
    if (samplePose) frameProfile.end("sampleSpriteContact", contactStarted)
    const groundStarted = samplePose ? frameProfile.start() : 0
    if (attachmentRoot.current && poseRoot.current && attachment) {
      const frames = requested === "hoisting" || requested === "procession" ? attachment.clips[requested] : undefined
      const hands = frames?.[direction * clip.columns + frame]?.sockets
      attachmentRoot.current.visible = !!hands
      if (hands) {
        // Registrations use the same camera projection as the sprite. Carry the
        // attachment in its corrected pose root so planted feet and hands agree.
        const x = ((hands.leftHand.x + hands.rightHand.x) / 2 - attachment.anchor[0]) / attachment.cellSize * size
        const y = (attachment.anchor[1] - (hands.leftHand.y + hands.rightHand.y) / 2) / attachment.cellSize * size
        attachmentPoint.set(x, y, 0).applyQuaternion(camera.quaternion)
        updateTranslatedWorld(poseRoot.current)
        origin.setFromMatrixPosition(poseRoot.current.matrixWorld)
        attachmentPoint.add(origin)
        if (requested === "hoisting" && attachment.restPosition) {
          const lift = frame / Math.max(1, clip.columns - 1)
          origin.set(...attachment.restPosition)
          attachmentPoint.lerp(origin, (1 - lift) ** 3)
        }
        attachmentRoot.current.position.copy(poseRoot.current.worldToLocal(attachmentPoint))
      }
    }
    // Ground and body/selection passes share the same local terrain plane.
    // Flying monks release contact and use the normal airborne depth model.
    if (map && parent.userData.activity !== "flying" && poseRoot.current) {
      updateTranslatedWorld(poseRoot.current)
      corrected.setFromMatrixPosition(poseRoot.current.matrixWorld)
      const surface = walkingSurface(map, corrected.x, corrected.z)
      // A mattress supports the whole body; seated legs can hang below the
      // bench, so their color and ID depth must still use the terrain plane.
      if (support && requested === "sleeping" && support.height >= surface.height) groundPlane.value.set(0, 1, 0, -support.height)
      else groundPlane.value.set(-surface.dx, 1, -surface.dz,
        surface.dx * corrected.x + surface.dz * corrected.z - surface.height)
    } else groundPlane.value.set(0, 0, 0, 0)
    if (samplePose) frameProfile.end("sampleSpriteGround", groundStarted)
    // Batches consume four UV numbers directly. They do not need one mutable
    // Texture view per NPC and played clip; selected/standalone sprites still
    // receive their own UV view through the ordinary material path.
    const entry = batchEntry.current
    const batched = entry && characterBatchControl.enabled && !selected && !!poseDepth.map.value && groundPlane.value.y > 0
    const texture = batched ? sources[textureIndex] : textures.get(textureIndex)
    if (entry) { entry.color = batched ? texture : undefined; entry.uv = batched ? batchUv : undefined }
    const previous = poseState
    // Distance timing must display the current pose even at low animation FPS.
    if (previous.texture !== texture || previous.row !== row || previous.frame !== frame) {
      previous.texture = texture; previous.frame = frame; previous.row = row
      if (batched) batchUv.set(1 / clip.columns, 1 / clip.rows, frame / clip.columns, (clip.rows - 1 - row) / clip.rows)
      else {
        texture.offset.set(frame / clip.columns, (clip.rows - 1 - row) / clip.rows)
        material.map = texture
        if (outlineMaterial) outlineMaterial.map = texture
      }
    }
    if (entry) batchEntries!.publish(entry, !!batched)
  }

  // Equal-depth overlaps must choose the same traveler in the color and ID passes.
  return (
    <group ref={poseRoot}>
      <SpriteFrame map={map} update={updateFrame} crowd={crowdWalk && !selected && batchEntries ? {
        walk: crowdWalk, pose: poseRoot, entry: batchEntry, control: characterBatchControl, publish: batchEntries.publish,
      } : undefined} />
      {(type === "minstrel" || type === "beggar") && !visualOverride && <RoadsideSignals type={type} size={size} pixelSize={size / 64} />}
      <sprite renderOrder={renderOrder} ref={sprite} layers-mask={selected ? 1 | (1 << SELECTED_CHARACTER_LAYER) : 1} name={name} material={material} onClick={onClick} scale={[size, size, 1]} center={center} userData={{ characterModel, calling: type, variant: varied ? appearance.variant : null, appearanceScale: varied ? appearance.scale : 1, bodyType: visual.design?.bodyType, design: visual.design, fps, sync: walkTuning?.sync !== false }} />
      {attachment && <group ref={attachmentRoot} visible={false}>{attachment.content}</group>}
      {outlineMaterial && <sprite ref={idSprite} renderOrder={renderOrder} layers-mask={OUTLINE_ID_LAYER_MASK} material={outlineMaterial}
        scale={[size, size, 1]} center={center} />}
    </group>
  )
}
