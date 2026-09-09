"use client"

import { SceneAssetBoundary } from "./scene-assets"

import { monkVisual, MONK_WALK_TUNING } from "@/lib/game/base-person/monk-assets"
import { withTerrainCornerQueries } from "@/lib/game/map/cliff-corners"
import { isWorldVisible } from "@/lib/game/render/visibility"

import { jobVisual } from "@/lib/game/jobs/assets"
import type { SettlementJob } from "@/lib/game/jobs/design"
import { GREY_HAIR_AGE, GREY_HAIR_COLOR } from "@/lib/game/character-age"
import { AnimalTether } from "./animal-tether"
import { HEAVY_PATH_WEAR, recordCartPath, recordWalkingPath } from "@/lib/game/footpaths"
import * as THREE from "three"
import type { GameMap } from "@/lib/game/map/types"
import { walkingSurface } from "@/lib/game/map/walking-surface"
import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { TravelerTypeDef } from "@/lib/game/travelers"
import { CharacterSprite } from "./character-sprite"
import { CartReins } from "./cart-reins"
import { KnightFigure } from "./knight-figure"
import { TransportSprite } from "./transport-sprite"
import type { TravelerAppearance } from "@/lib/game/base-person/population"
import { pullingVisual } from "@/lib/game/transport/visual"
import { cartOffset, type Cargo, type Puller, type HorseVariant } from "@/lib/game/transport/assets"
import { personWalkStride } from "@/lib/game/base-person/gait"
import { keeperRoutine } from "@/lib/game/transport/keeper"
import { populationDesign } from "@/lib/game/base-person/population"
import { STALL, stallPoint } from "@/lib/game/transport/stall"
import { animalTravel, hitchedAnimalTravel } from "@/lib/game/transport/animal-travel"
import { roadCartPose } from "@/lib/game/transport/bridge-guide"
import { alignCart, followCart, type CartPose } from "@/lib/game/transport/follow"
import type { WalkTuning } from "@/lib/game/motion"
import type { CharacterModel } from "@/lib/game/character-assets"

export const BLOCK_WIDTH = 0.3
export const BLOCK_HEIGHT = 0.55
export type FigureClickHandler = (event: { delta: number; stopPropagation: () => void }) => void

/** The person, cart and draught animal share one selection in game and previews. */
export function TravelerFigure({ map, age, job, type, onClick, idColor, selected = false, awning = false, outlineColor,
  characterModel = "callings", characterScale = 1, characterFps, walkTuning, appearance,
  squire = false, cargo = "produce", puller = "hand", horseVariant = "common", coat,
}: {
  map?: GameMap; age?: number; job?: SettlementJob | null
  type: TravelerTypeDef; appearance?: TravelerAppearance; selected?: boolean; idColor?: THREE.Color
  onClick?: FigureClickHandler; awning?: boolean; outlineColor?: [number, number, number]
  characterModel?: CharacterModel; characterScale?: number; characterFps?: number; walkTuning?: WalkTuning
  squire?: boolean; cargo?: Cargo; puller?: Puller; horseVariant?: HorseVariant; coat?: string
}) {
  const vendor = !job && type.id === "vendor", animal = vendor && puller !== "hand"
  const driver = useRef<THREE.Group>(null), setup = useRef<THREE.Group>(null), beast = useRef<THREE.Group>(null)
  const cart = useRef<THREE.Group>(null), pullingDriver = useRef<THREE.Group>(null)
  const point = useMemo(() => new THREE.Vector3(), [])
  const cartPose = useRef<CartPose | null>(null)
  const followingRoad = useRef(false)
  const lastAnimal = useRef<{ x: number; z: number; hitched: boolean } | null>(null)
  const lastDriver = useRef<{ x: number; z: number; deployed: boolean } | null>(null)
  useFrame(({ clock }) => withTerrainCornerQueries(map, () => {
    const group = driver.current, parent = group?.parent
    if (!group || !parent || !isWorldVisible(parent)) return
    const data = parent.userData, paused = data.playbackRate === 0
    if (!vendor) {
      // Ordinary walkers already publish distance, heading and activity on
      // their parent. Only adjust the height to the actual ground triangle.
      group.position.set(0, 0, 0)
      if (map) {
        parent.getWorldPosition(point)
        point.y = walkingSurface(map, point.x, point.z).height
        group.position.copy(parent.worldToLocal(point))
      }
      group.userData = data; group.visible = true
      return
    }
    const parking = data.transportParking ?? data.shrineParking, onFoot = parking?.walking === true
    const praying = data.activity === "praying", routineActivity = data.routineActivity ?? data.activity
    const deployed = vendor && (routineActivity === undefined ? awning : ["openingShop", "vending", "packingShop"].includes(routineActivity))
    const riding = animal && !onFoot && !deployed
    const working = deployed && !praying && routineActivity !== "vending" && (data.shopProgress ?? 0) > 0
    parent.getWorldPosition(point)
    const heading = data.heading ?? Math.atan2(parent.matrixWorld.elements[8], parent.matrixWorld.elements[10])
    const hitch = { x: point.x, z: point.z }, y = point.y, wheelbase = -cartOffset(puller) * characterScale
    const previous = cartPose.current
    if (vendor) {
      const roadPose = data.cartPose as CartPose | undefined
      const freePose = map && typeof data.cartProgress === "number" && !deployed && !parking
        ? roadCartPose(map,data.cartProgress,data.cartDirection ?? 1,wheelbase,characterScale,data.motionReset?undefined:previous??undefined)
        : !previous || data.motionReset ? alignCart(hitch, heading, wheelbase)
        : deployed ? alignCart(hitch, data.shopHeading ?? heading, wheelbase) : paused ? { ...previous, distance: 0 } : followCart(previous, hitch, wheelbase)
      // Let the axle finish returning from a roadside stop before guiding it
      // along the road again; switching immediately would snap it off the verge.
      if (!roadPose) followingRoad.current = false
      else if (!previous || data.motionReset || Math.hypot(freePose.x - roadPose.x, freePose.z - roadPose.z) < 0.02) followingRoad.current = true
      cartPose.current = parking ? parking.pose : roadPose && (data.cartManeuver || followingRoad.current) ? roadPose : freePose
      const pose = cartPose.current!
      if (map?.footpaths && previous && !paused && !data.motionReset && !deployed && !onFoot) {
        recordCartPath(map.footpaths, map, previous, pose, characterScale)
      }
      if (cart.current) {
        cart.current.position.copy(parent.worldToLocal(point.set(pose.x, map ? walkingSurface(map, pose.x, pose.z).height : y, pose.z)))
        const distance = previous && !paused && !data.motionReset && !deployed
          ? pose === freePose ? pose.distance : Math.hypot(pose.x - previous.x, pose.z - previous.z) : 0
        cart.current.userData = { ...data, bridgeGuided: pose.bridgeGuided === true, activity: routineActivity, riding, playbackRate: praying ? 0 : data.playbackRate, heading: deployed ? data.shopHeading ?? pose.heading : pose.heading, distance: onFoot ? 0 : distance, moving: data.moving && !deployed && !onFoot }
      }
    }
    const side = data.shopSide ?? 1
    const keeper = routineActivity === "vending" ? keeperRoutine(data.keeperTime ?? 0, puller, characterScale,
      personWalkStride(populationDesign(type, appearance?.variant ?? 0)) * characterScale, data.keeperAudience !== false) : null
    const keeperAction = !praying && keeper && keeper.pose !== "walk" && keeper.pose !== "idle"
    const keeperHeading = (data.shopHeading ?? heading) + (keeper?.moving ? Math.atan2(Math.sin(keeper.heading) * side, Math.cos(keeper.heading)) : -side * Math.PI / 2)
    group.position.set(0, 0, 0)
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
    if (vendor && map?.footpaths && before && !reset && !paused && !riding && !working) {
      recordWalkingPath(map.footpaths, map, before, { x: point.x, z: point.z })
    }
    group.userData = { ...data, motionReset: reset, distance, heading: praying ? data.heading : deployed ? keeperHeading : data.heading, activity: praying ? "praying" : deployed ? undefined : data.activity, moving: !praying && (deployed ? keeper?.moving === true : data.moving) }
    const pullingNow = vendor && !animal && characterModel === "base" && !deployed && !praying && !onFoot
    group.visible = !riding && !working && !keeperAction && !pullingNow
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
      const beforeAnimal = lastAnimal.current
      const pasture = data.pasture, priorHeading = beast.current.userData.heading
      const last = lastAnimal.current
      const travel = data.animalHeading !== undefined ? { heading: data.animalHeading, reversing: data.reversing === true }
        : last?.hitched && !data.motionReset ? animalTravel(priorHeading ?? heading, hitch.x - last.x, hitch.z - last.z) : { heading, reversing: false }
      beast.current.userData = { ...data, ...hitchedAnimalTravel(cartPose.current!, travel), grazing: false, hitched: !deployed }
      if (deployed && pasture) {
        beast.current.position.copy(parent.worldToLocal(point.set(pasture.x, data.pastureY ?? y, pasture.z)))
        const previous = lastAnimal.current, distance = previous && !data.motionReset && !paused ? Math.hypot(pasture.x - previous.x, pasture.z - previous.z) : 0
        beast.current.userData = { ...data, tether: pasture.returning ? undefined : pasture.tether, heading: pasture.moving && !praying ? pasture.heading : priorHeading ?? data.heading, reversing: pasture.reversing, hitched: false,
          moving: pasture.moving && !praying, distance, grazing: !pasture.tether && data.pastureGrass && !pasture.returning && !pasture.moving }
        lastAnimal.current = { x: pasture.x, z: pasture.z, hitched: false }
      } else if (parking) {
        const hitch = parking.pose.hitch
        beast.current.position.copy(parent.worldToLocal(point.set(hitch.x, map ? walkingSurface(map, hitch.x, hitch.z).height : y, hitch.z)))
        beast.current.userData = { ...data, tether: onFoot ? parking.tree : undefined, ...hitchedAnimalTravel(parking.pose, { heading: parking.pose.heading, reversing: false }), hitched: true, moving: !onFoot && data.moving, distance: onFoot ? 0 : data.distance, grazing: false }
        lastAnimal.current = null
      } else { beast.current.position.set(0, 0, 0); lastAnimal.current = { ...hitch, hitched: !deployed } }
      if (animal && map?.footpaths && beforeAnimal && lastAnimal.current && !paused && !data.motionReset) {
        recordWalkingPath(map.footpaths, map, beforeAnimal, lastAnimal.current, HEAVY_PATH_WEAR)
      }
    }
  }, clock), -2)
  const variant = appearance?.variant ?? 0
  const pulling = useMemo(() => pullingVisual(variant), [variant])
  const color = outlineColor ?? (idColor ? [idColor.r, idColor.g, idColor.b] as [number, number, number] : undefined)
  const workVisual = useMemo(() => job ? jobVisual(job, variant) : undefined, [job, variant])
  if (workVisual) return <SceneAssetBoundary><CharacterSprite map={map} age={age} appearance={appearance}
    complexion={appearance && age !== undefined && age >= GREY_HAIR_AGE ? { ...appearance.complexion, hair: GREY_HAIR_COLOR } : appearance?.complexion}
    selected={selected} type={type.id} onClick={onClick} outlineColor={color} characterModel="base"
    characterScale={characterScale} characterFps={characterFps} walkTuning={walkTuning} visualOverride={workVisual} /></SceneAssetBoundary>
  if (type.id === "friar") return <SceneAssetBoundary><CharacterSprite map={map} age={age}
    complexion={appearance?.complexion} selected={selected} type={type.id} onClick={onClick} outlineColor={color}
    characterModel="base" characterScale={characterScale} characterFps={characterFps}
    walkTuning={MONK_WALK_TUNING} visualOverride={monkVisual(age ?? 18)} /></SceneAssetBoundary>
  if (type.id === "knight") return <SceneAssetBoundary><KnightFigure map={map} appearance={appearance} coat={coat} squire={squire}
    selected={selected} outlineColor={color} onClick={onClick} characterScale={characterScale} characterFps={characterFps} walkTuning={walkTuning} /></SceneAssetBoundary>
  return <SceneAssetBoundary>
    <group ref={driver} position={[0, 0, 0]}>
      <CharacterSprite map={map} age={age} appearance={appearance} selected={selected} type={type.id} onClick={onClick} outlineColor={color}
        characterModel={characterModel} characterScale={characterScale} characterFps={characterFps} walkTuning={walkTuning}
        />
    </group>
    {vendor && !animal && characterModel === "base" && <group ref={pullingDriver}>
      <CharacterSprite map={map} age={age} appearance={appearance} selected={selected} type={type.id} onClick={onClick} outlineColor={color}
        characterModel={characterModel} characterScale={characterScale} characterFps={characterFps} walkTuning={walkTuning} visualOverride={pulling} />
    </group>}
    {vendor && <>
      <group ref={cart}><TransportSprite map={map} kind="cart" variant={variant} cargo={cargo} puller={puller} awning={awning} characterScale={characterScale}
        selected={selected} outlineColor={color} onClick={onClick} /></group>
      <group ref={setup} visible={false}><TransportSprite map={map} kind="merchant" variant={variant} characterScale={characterScale * (appearance?.scale ?? 1)} selected={selected} outlineColor={color} onClick={onClick} /></group>
    </>}
    {animal && <group ref={beast}><TransportSprite map={map} kind={puller as "donkey" | "horse"} coat={coat} horseVariant={horseVariant} characterScale={characterScale} selected={selected} outlineColor={color} onClick={onClick} /></group>}
    {animal && <AnimalTether animal={beast} kind={puller as "horse" | "donkey"} horseVariant={horseVariant} characterScale={characterScale} selected={selected} outlineColor={color} onClick={onClick} />}
    {animal && <CartReins cart={cart} animal={beast} kind={puller as "horse" | "donkey"} horseVariant={horseVariant} characterScale={characterScale} selected={selected} outlineColor={color} onClick={onClick} />}
  </SceneAssetBoundary>
}
