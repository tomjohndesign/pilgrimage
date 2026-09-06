"use client"

import * as THREE from "three"
import type { GameMap } from "@/lib/game/map/types"
import { walkingSurface } from "@/lib/game/map/walking-surface"
import { Suspense, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { TravelerTypeDef } from "@/lib/game/travelers"
import { CharacterSprite } from "./character-sprite"
import { TransportSprite } from "./transport-sprite"
import type { TravelerAppearance } from "@/lib/game/base-person/population"
import { pullingVisual } from "@/lib/game/transport/visual"
import { cartOffset, type Cargo, type Puller, type HorseVariant } from "@/lib/game/transport/assets"
import { personWalkStride } from "@/lib/game/base-person/gait"
import { keeperRoutine } from "@/lib/game/transport/keeper"
import { populationDesign } from "@/lib/game/base-person/population"
import { STALL, stallPoint } from "@/lib/game/transport/stall"
import { alignCart, followCart, type CartPose } from "@/lib/game/transport/follow"
import type { WalkTuning } from "@/lib/game/motion"
import type { CharacterModel } from "@/lib/game/character-assets"

export const BLOCK_WIDTH = 0.3
export const BLOCK_HEIGHT = 0.55
export type FigureClickHandler = (event: { delta: number; stopPropagation: () => void }) => void

/** The person, cart and draught animal share one selection in game and previews. */
export function TravelerFigure({ map, age, type, onClick, idColor, selected = false, awning = false, outlineColor,
  characterModel = "callings", characterScale = 1, characterFps, walkTuning, appearance,
  cargo = "produce", puller = "hand", horseVariant = "common", coat,
}: {
  map?: GameMap; age?: number
  type: TravelerTypeDef; appearance?: TravelerAppearance; selected?: boolean; idColor?: THREE.Color
  onClick?: FigureClickHandler; awning?: boolean; outlineColor?: [number, number, number]
  characterModel?: CharacterModel; characterScale?: number; characterFps?: number; walkTuning?: WalkTuning
  cargo?: Cargo; puller?: Puller; horseVariant?: HorseVariant; coat?: string
}) {
  const vendor = type.id === "vendor", animal = vendor && puller !== "hand"
  const driver = useRef<THREE.Group>(null), setup = useRef<THREE.Group>(null), beast = useRef<THREE.Group>(null)
  const cart = useRef<THREE.Group>(null), pullingDriver = useRef<THREE.Group>(null)
  const point = useMemo(() => new THREE.Vector3(), [])
  const cartPose = useRef<CartPose | null>(null)
  const followingRoad = useRef(false)
  const lastAnimal = useRef<{ x: number; z: number } | null>(null)
  const lastDriver = useRef<{ x: number; z: number; deployed: boolean } | null>(null)
  useFrame(() => {
    const group = driver.current, parent = group?.parent
    if (!group || !parent) return
    const data = parent.userData, paused = data.playbackRate === 0
    const deployed = vendor && (data.activity === undefined ? awning : ["openingShop", "vending", "packingShop"].includes(data.activity))
    const working = deployed && data.activity !== "vending" && (data.shopProgress ?? 0) > 0
    parent.getWorldPosition(point)
    const heading = data.heading ?? Math.atan2(parent.matrixWorld.elements[8], parent.matrixWorld.elements[10])
    const hitch = { x: point.x, z: point.z }, y = point.y, wheelbase = -cartOffset(puller) * characterScale
    const previous = cartPose.current
    if (vendor) {
      const roadPose = data.cartPose as CartPose | undefined
      const freePose = !previous || data.motionReset ? alignCart(hitch, heading, wheelbase)
        : deployed ? alignCart(hitch, data.shopHeading ?? heading, wheelbase) : paused ? { ...previous, distance: 0 } : followCart(previous, hitch, wheelbase)
      // Let the axle finish returning from a roadside stop before guiding it
      // along the road again; switching immediately would snap it off the verge.
      if (!roadPose) followingRoad.current = false
      else if (!previous || data.motionReset || Math.hypot(freePose.x - roadPose.x, freePose.z - roadPose.z) < 0.02) followingRoad.current = true
      cartPose.current = roadPose && followingRoad.current ? roadPose : freePose
      const pose = cartPose.current!
      if (cart.current) {
        cart.current.position.copy(parent.worldToLocal(point.set(pose.x, map ? walkingSurface(map, pose.x, pose.z).height : y, pose.z)))
        const distance = previous && !paused && !data.motionReset && !deployed ? Math.hypot(pose.x - previous.x, pose.z - previous.z) : 0
        cart.current.userData = { ...data, heading: deployed ? data.shopHeading ?? pose.heading : pose.heading, distance, moving: data.moving && !deployed }
      }
    }
    const side = data.shopSide ?? 1
    const keeper = data.activity === "vending" ? keeperRoutine(data.keeperTime ?? 0, puller, characterScale,
      personWalkStride(populationDesign(type, appearance?.variant ?? 0)) * characterScale, data.keeperAudience !== false) : null
    const keeperAction = keeper && keeper.pose !== "walk" && keeper.pose !== "idle"
    const keeperHeading = (data.shopHeading ?? heading) + (keeper?.moving ? Math.atan2(Math.sin(keeper.heading) * side, Math.cos(keeper.heading)) : -side * Math.PI / 2)
    group.position.set(animal ? 0.43 * characterScale : 0, 0, animal ? 0.22 * characterScale : 0)
    if (deployed && cartPose.current) {
      const pose = cartPose.current, location = stallPoint(pose, data.shopHeading ?? pose.heading, side, characterScale, keeper ?? STALL.merchant)
      group.position.copy(parent.worldToLocal(point.set(location.x, map ? walkingSurface(map, location.x, location.z).height : y, location.z)))
    }
    group.getWorldPosition(point)
    if (map) group.position.copy(parent.worldToLocal(point.set(point.x, walkingSurface(map, point.x, point.z).height, point.z)))
    group.getWorldPosition(point)
    const before = lastDriver.current, reset = data.motionReset || !before || before.deployed !== deployed
    const distance = !reset && !paused ? Math.hypot(point.x - before.x, point.z - before.z) : 0
    lastDriver.current = { x: point.x, z: point.z, deployed }
    group.userData = { ...data, motionReset: reset, distance, heading: deployed ? keeperHeading : data.heading, activity: deployed ? undefined : data.activity, moving: deployed ? keeper?.moving === true : data.moving }
    const pullingNow = vendor && !animal && characterModel === "base" && !deployed
    group.visible = !working && !keeperAction && !pullingNow
    if (pullingDriver.current) {
      pullingDriver.current.visible = pullingNow
      pullingDriver.current.position.copy(group.position)
      pullingDriver.current.userData = group.userData
    }
    if (setup.current) {
      setup.current.visible = working || !!keeperAction
      setup.current.userData = { ...data, keeperPose: keeperAction ? keeper.pose : undefined, keeperPhase: keeper?.phase ?? 0, heading: keeperHeading, moving: false, distance: 0 }
      setup.current.position.copy(group.position)
    }
    if (beast.current) {
      const pasture = data.pasture, priorHeading = beast.current.userData.heading
      beast.current.userData = { ...data, grazing: false, hitched: !deployed }
      if (deployed && pasture) {
        beast.current.position.copy(parent.worldToLocal(point.set(pasture.x, data.pastureY ?? y, pasture.z)))
        const previous = lastAnimal.current, distance = previous && !data.motionReset && !paused ? Math.hypot(pasture.x - previous.x, pasture.z - previous.z) : 0
        beast.current.userData = { ...data, heading: pasture.moving ? pasture.heading : priorHeading ?? data.heading, hitched: false,
          moving: pasture.moving, distance, grazing: data.pastureGrass && !pasture.returning && !pasture.moving }
        lastAnimal.current = { x: pasture.x, z: pasture.z }
      } else { beast.current.position.set(0, 0, 0); lastAnimal.current = null }
    }
  }, -2)
  const variant = appearance?.variant ?? 0
  const pulling = useMemo(() => pullingVisual(variant), [variant])
  const color = outlineColor ?? (idColor ? [idColor.r, idColor.g, idColor.b] as [number, number, number] : undefined)
  return <Suspense fallback={null}>
    <group ref={driver} position={animal ? [0.43 * characterScale, 0, 0.22 * characterScale] : [0, 0, 0]}>
      <CharacterSprite map={map} age={age} appearance={appearance} selected={selected} type={type.id} onClick={onClick} outlineColor={color}
        characterModel={characterModel} characterScale={characterScale} characterFps={characterFps} walkTuning={walkTuning}
        />
    </group>
    {vendor && !animal && characterModel === "base" && <group ref={pullingDriver}>
      <CharacterSprite map={map} age={age} appearance={appearance} selected={selected} type={type.id} onClick={onClick} outlineColor={color}
        characterModel={characterModel} characterScale={characterScale} characterFps={characterFps} walkTuning={walkTuning} visualOverride={pulling} />
    </group>}
    {vendor && <>
      <group ref={cart}><TransportSprite map={map} kind="cart" cargo={cargo} puller={puller} awning={awning} characterScale={characterScale}
        selected={selected} outlineColor={color} onClick={onClick} /></group>
      <group ref={setup} visible={false}><TransportSprite map={map} kind="merchant" variant={variant} characterScale={characterScale * (appearance?.scale ?? 1)} selected={selected} outlineColor={color} onClick={onClick} /></group>
    </>}
    {animal && <group ref={beast}><TransportSprite map={map} kind={puller as "donkey" | "horse"} coat={coat} horseVariant={horseVariant} characterScale={characterScale} selected={selected} outlineColor={color} onClick={onClick} /></group>}
  </Suspense>
}
