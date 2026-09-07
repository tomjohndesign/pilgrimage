"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useFrame, useLoader } from "@react-three/fiber"
import * as THREE from "three"
import type { GameMap } from "@/lib/game/map/types"
import { walkingSurface } from "@/lib/game/map/walking-surface"
import { usePixelWorldTexel } from "@/components/pixel-canvas"
import { spriteRow } from "@/lib/game/character-assets"
import { applySpriteDepth, configureSpriteDepthTexture, spriteRenderOrder, type SpritePoseDepth } from "@/lib/game/render/sprite-depth"
import { OUTLINE_ID_LAYER_MASK, SELECTED_CHARACTER_LAYER } from "@/lib/game/render/outline"
import { plantFoot, type FootPlant } from "@/lib/game/base-person/gait"
import { BASE_PERSON, WALK_STANCE_FRACTION } from "@/lib/game/base-person/pose"
import { animalCoat } from "@/lib/game/transport/coats"
import { TRANSPORT, CART, SHOP, cartUrl, animalUrl, type Puller, RIG_TO_WORLD, cartColumn, animalStride, type Animal, type Cargo, type HorseVariant } from "@/lib/game/transport/assets"
import { KEEPER_CLIPS, KEEPER_COLUMNS } from "@/lib/game/transport/keeper"
import { useAnimalRigStore } from "@/lib/game/wildlife/rig-store"
import { createEditedAnimalFrame } from "@/lib/game/transport/edited-frame"
import { animalLeg } from "@/lib/game/transport/animal-pose"
import manifest from "@/public/textures/transport/v16/manifest.json"
import type { FigureClickHandler } from "./traveler-figure"

export function TransportSprite({ map: terrain, kind, coat, variant = 0, horseVariant = "common", cargo = "produce", puller = "hand", awning = false, characterScale = 1,
  selected = false, outlineColor, onClick, position = [0, 0, 0] }: {
  map?: GameMap; kind: "cart" | "merchant" | Animal; coat?: string; variant?: number; horseVariant?: HorseVariant; cargo?: Cargo; puller?: Puller; awning?: boolean; characterScale?: number
  selected?: boolean; outlineColor?: [number, number, number]; onClick?: FigureClickHandler; position?: [number, number, number]
}) {
  const animal = kind === "donkey" || kind === "horse"
  const edits = useAnimalRigStore(state => state.designs[kind])
  const hasEdits = animal && !!edits && Object.keys(edits.clips).length > 0
  const edited = useMemo(() => hasEdits && (kind === "donkey" || kind === "horse") ? createEditedAnimalFrame(kind, horseVariant, coat) : null, [hasEdits, kind, horseVariant, coat])
  useEffect(() => () => edited?.dispose(), [edited])
  const [renderOrder] = useState(spriteRenderOrder)
  const urls = kind === "cart" ? [cartUrl(cargo, puller), cartUrl(cargo, "shop", 1, puller === "hand"), cartUrl(cargo, "shop", -1, puller === "hand")]
    : kind === "merchant" ? [`/textures/transport/${TRANSPORT.version}/merchant-setup.png`, `/textures/transport/${TRANSPORT.version}/merchant-selling.png`] : [animalUrl(kind, animalCoat(kind, coat).id), animalUrl(kind, animalCoat(kind, coat).id, true)]
  const sources = useLoader(THREE.TextureLoader, [...urls, ...urls.map(url => url.replace(/([^/]+)$/, "depth-$1"))])
  const poseDepth = useMemo<SpritePoseDepth>(() => ({ map: { value: null }, enabled: { value: true } }), [])
  const depths = useMemo(() => sources.slice(urls.length).map(configureSpriteDepthTexture), [sources, urls.length])

  const rows = kind === "cart" ? CART.directions : kind === "merchant" ? manifest.puller.rows : kind === "horse" ? manifest.animalRows.horse : 8
  const rowOffset = kind === "merchant" ? variant * 8 : kind === "horse" ? manifest.horseVariants[horseVariant].rowOffset : 0
  const walk = manifest.animalClips.walk
  const maps = useMemo(() => sources.slice(0, urls.length).map(source => {
    const map = source.clone(); map.magFilter = map.minFilter = THREE.NearestFilter
    map.colorSpace = THREE.SRGBColorSpace; map.generateMipmaps = false; map.needsUpdate = true
    return map
  }), [sources, urls.length])
  const map = maps[0]
  const worldTexel = usePixelWorldTexel(), viewport = useMemo(() => new THREE.Vector4(), [])
  const groundPlane = useMemo(() => ({ value: new THREE.Vector4() }), [])
  const groundAt = useMemo(() => terrain ? (x: number, z: number) => walkingSurface(terrain, x, z).height : undefined, [terrain])
  const materials = useMemo(() => [false, true].map(idPass => {
    const material = new THREE.SpriteMaterial({ map, alphaTest: 0.5, transparent: false, toneMapped: false })
    material.onBeforeCompile = shader => {
      applySpriteDepth(shader, viewport, worldTexel, groundPlane, poseDepth)
      if (idPass) {
        shader.uniforms.transportId = { value: new THREE.Vector3(...(outlineColor ?? [0, 0, 0])) }
        shader.fragmentShader = "uniform vec3 transportId;\n" + shader.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb = transportId;")
      }
    }
    material.onBeforeRender = renderer => { renderer.getCurrentViewport(viewport) }
    material.customProgramCacheKey = () => idPass ? "transport-id-v3" : "person-depth-v5"
    return material
  }), [map, viewport, worldTexel, groundPlane, poseDepth, outlineColor?.[0], outlineColor?.[1], outlineColor?.[2]])
  useEffect(() => () => { materials.forEach(m => m.dispose()) }, [materials])
  useEffect(() => () => maps.forEach(map => map.dispose()), [maps])
  const root = useRef<THREE.Group>(null), phase = useRef(0), grazingTime = useRef(0), plant = useRef<FootPlant | null>(null)
  const vectors = useMemo(() => ({ facing: new THREE.Vector3(), origin: new THREE.Vector3(), foot: new THREE.Vector3(), corrected: new THREE.Vector3() }), [])
  useFrame(({ camera }, delta) => {
    const group = root.current, parent = group?.parent
    if (!group || !parent) return
    const data = parent.userData
    if (data.motionReset) plant.current = null
    const heading = typeof data.heading === "number" ? data.heading : (parent.getWorldDirection(vectors.facing), Math.atan2(vectors.facing.x, vectors.facing.z))
    const yaw = Math.atan2(camera.matrixWorld.elements[8], camera.matrixWorld.elements[10]), row = spriteRow(heading, yaw, kind === "cart" ? CART.directions : 8)
    const shop = data.activity === undefined ? awning : ["vending", "openingShop", "packingShop"].includes(data.activity)
    const moving = data.moving === true, distance = data.playbackRate === 0 ? 0 : data.distance ?? 0
    const stride = animal ? animalStride(kind, characterScale, horseVariant) : manifest.wheelCycleRadians * TRANSPORT.wheelRadius * RIG_TO_WORLD * characterScale
    if (moving) phase.current = (phase.current + distance / stride) % 1
    if (data.grazing && !moving) grazingTime.current += Math.min(delta, 0.1) * (data.playbackRate ?? 1)
    else grazingTime.current = 0
    const graze = manifest.animalClips.graze, lower = manifest.animalClips.lower
    const keeperClip = kind === "merchant" ? KEEPER_CLIPS[data.keeperPose as keyof typeof KEEPER_CLIPS] : undefined
    const columns = kind === "merchant" ? keeperClip ? KEEPER_COLUMNS : manifest.merchantSetupFrames : kind === "cart" ? shop ? manifest.shop.frames : manifest.cartColumns : manifest.animalColumns
    const progress = Math.max(0, Math.min(1, data.shopProgress ?? 1))
    const column = kind === "merchant" ? keeperClip ? keeperClip.start + Math.min(keeperClip.frames - 1, Math.floor((data.keeperPhase ?? 0) * keeperClip.frames)) : Math.min(columns - 1, Math.floor(progress * columns))
      : kind === "cart" ? shop ? Math.round(progress * (columns - 1)) : cartColumn(cargo, puller, phase.current)
      : moving ? walk.start + Math.floor(phase.current * walk.frames)
      : data.grazing ? grazingTime.current < 0.75 ? lower.start + Math.min(lower.frames - 1, Math.floor(grazingTime.current / 0.75 * lower.frames))
        : graze.start + Math.floor((grazingTime.current - 0.75) * graze.fps) % graze.frames : manifest.animalClips.idle.start
    const textureIndex = keeperClip ? 1 : kind === "cart" && shop ? data.shopSide < 0 ? 2 : 1 : animal && data.hitched ? 1 : 0
    let active: THREE.Texture = maps[textureIndex]
    poseDepth.map.value = depths[textureIndex]
    active.repeat.set(1 / columns, 1 / rows); active.offset.set(column / columns, (rows - 1 - rowOffset - row) / rows)
    if (edited && edits) {
      const grazeAmount = data.grazing ? Math.min(1, grazingTime.current / 0.75) : 0
      const idlePhase = grazingTime.current * 0.8 * (edits.clips.graze?.cadence ?? 1)
      edited.draw(moving ? phase.current : idlePhase % 1, moving, grazeAmount, row, edits, !!data.hitched)
      active = edited.texture
      poseDepth.map.value = edited.depthTexture
    }
    for (const material of materials) material.map = active
    const cell = kind === "merchant" ? manifest.puller.cellSize : kind === "cart" ? shop ? SHOP.cellSize : CART.cellSize : manifest.cellSize
    const anchor = kind === "merchant" ? manifest.puller.anchor : kind === "cart" ? shop ? SHOP.anchor : CART.anchor : manifest.anchor
    group.children.forEach(child => { if (child instanceof THREE.Sprite) {
      Object.assign(child.userData, { walkPhase: phase.current, walkStride: stride, distance, heading, row, moving, hitched: data.hitched, keeperPose: data.keeperPose, column })
      child.center.set(anchor[0] / cell, 1 - anchor[1] / cell)
      child.scale.set(cell * manifest.scale / manifest.cellSize * characterScale, cell * manifest.scale / manifest.cellSize * characterScale, 1)
    } })
    group.position.set(...position)
    if (animal && moving) {
      const displayed = edited ? phase.current : Math.floor(phase.current * walk.frames) / walk.frames
      const side = displayed >= WALK_STANCE_FRACTION - 0.5 && displayed < WALK_STANCE_FRACTION ? "left" : "right"
      const foot = animalLeg(kind, side, false, displayed, true, horseVariant).ankle
      const angle = -row * Math.PI / 4, scale = RIG_TO_WORLD * characterScale
      const pitch = Math.atan(Math.max(0.01, Math.abs(camera.matrixWorld.elements[9] / camera.matrixWorld.elements[5])))
      const x = (foot[0] * Math.cos(angle) + foot[2] * Math.sin(angle)) * scale
      const z = (-foot[0] * Math.sin(angle) + foot[2] * Math.cos(angle)) * scale * Math.sin(BASE_PERSON.camera.pitch * Math.PI / 180) / Math.sin(pitch)
      vectors.foot.set(x * Math.cos(yaw) + z * Math.sin(yaw), 0, -x * Math.sin(yaw) + z * Math.cos(yaw))
      group.getWorldPosition(vectors.origin)
      const contact = plantFoot(plant.current, `${kind}:${horseVariant}:${side}:${row}:${yaw.toFixed(4)}:${pitch.toFixed(4)}:${characterScale}`, vectors.origin, vectors.foot, groundAt)
      plant.current = contact.plant
      vectors.corrected.set(vectors.origin.x + contact.offset.x, vectors.origin.y + contact.offset.y, vectors.origin.z + contact.offset.z)
      group.position.copy(parent.worldToLocal(vectors.corrected))
    } else plant.current = null
    if (terrain) {
      group.getWorldPosition(vectors.corrected)
      const surface = walkingSurface(terrain, vectors.corrected.x, vectors.corrected.z)
      groundPlane.value.set(-surface.dx, 1, -surface.dz,
        surface.dx * vectors.corrected.x + surface.dz * vectors.corrected.z - surface.height)
    } else groundPlane.value.set(0, 0, 0, 0)
  })
  const size = manifest.scale * characterScale
  const center = useMemo(() => new THREE.Vector2(manifest.anchor[0] / manifest.cellSize, 1 - manifest.anchor[1] / manifest.cellSize), [])
  return <group ref={root} position={position}>
    <sprite name={kind} renderOrder={renderOrder} material={materials[0]} center={center} scale={[size, size, 1]} onClick={onClick}
      layers-mask={selected ? 1 | (1 << SELECTED_CHARACTER_LAYER) : 1} />
    {outlineColor && <sprite renderOrder={renderOrder} material={materials[1]} center={center} scale={[size, size, 1]} layers-mask={OUTLINE_ID_LAYER_MASK} />}
  </group>
}
