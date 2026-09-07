"use client"

import { AnimalTether } from "./animal-tether"
import * as THREE from "three"
import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { GameMap } from "@/lib/game/map/types"
import { walkingSurface } from "@/lib/game/map/walking-surface"
import { followKnight, knightMounted, type TrailPoint, type HorseRest } from "@/lib/game/knights"
import { knightVisual, squireVisual } from "@/lib/game/knight/visual"
import type { TravelerAppearance } from "@/lib/game/base-person/population"
import type { WalkTuning } from "@/lib/game/motion"
import { CharacterSprite } from "./character-sprite"
import { TransportSprite } from "./transport-sprite"
import type { FigureClickHandler } from "./traveler-figure"

/** The mount and attendant remain outdoors while their knight visits the shrine. */
export function KnightFigure({ map, appearance, coat, squire = false, characterScale = 1, characterFps, walkTuning, selected, outlineColor, onClick }: {
  map?: GameMap; appearance?: TravelerAppearance; coat?: string; squire?: boolean; characterScale?: number
  characterFps?: number; walkTuning?: WalkTuning; selected?: boolean; outlineColor?: [number, number, number]; onClick?: FigureClickHandler
}) {
  const person = useRef<THREE.Group>(null), mount = useRef<THREE.Group>(null), horse = useRef<THREE.Group>(null), attendant = useRef<THREE.Group>(null)
  const trail = useRef<TrailPoint[]>([]), lastSquire = useRef<TrailPoint | null>(null), lastRiding = useRef<boolean | null>(null)
  const rest = useRef<HorseRest | null>(null)
  const vector = useMemo(() => new THREE.Vector3(), [])
  const variant = appearance?.variant ?? 0
  const visual = useMemo(() => knightVisual(variant), [variant])
  const attendantVisual = useMemo(() => squireVisual(), [])
  useFrame(() => {
    const parent = person.current?.parent
    if (!parent || !person.current || !mount.current || !horse.current) return
    const data = parent.userData, paused = data.playbackRate === 0, reset = data.motionReset === true
    parent.getWorldPosition(vector)
    const point = { x: vector.x, y: vector.y, z: vector.z, heading: data.heading ?? parent.rotation.y }
    const riding = knightMounted(data.routineActivity ?? data.activity ?? "walking", data.horseRest)
    const switched = lastRiding.current !== riding
    lastRiding.current = riding
    if (reset) { rest.current = null; trail.current = []; lastSquire.current = null }
    if (riding) rest.current = null
    else rest.current = data.horseRest ?? rest.current ?? { ...point }
    mount.current.visible = riding; person.current.visible = !riding; horse.current.visible = !riding
    mount.current.userData = { ...data, motionReset: reset || switched, grazing: false, hitched: false }
    person.current.userData = { ...data, motionReset: reset || switched }
    const outside = rest.current ?? point
    // Horse parking is in world coordinates, independent of the knight's turns indoors.
    horse.current.position.copy(parent.worldToLocal(vector.set(outside.x, map ? walkingSurface(map, outside.x, outside.z).height : outside.y, outside.z)))
    horse.current.userData = { ...data, tether: rest.current?.tree, heading: outside.heading, activity: "idle", moving: false, distance: 0, motionReset: reset || switched, hitched: false, grazing: false }
    if (attendant.current) {
      const following = followKnight(trail.current, outside, 0.75 * characterScale, reset)
      const before = lastSquire.current
      const distance = before && !reset && !paused ? Math.hypot(following.x - before.x, following.z - before.z) : 0
      attendant.current.position.copy(parent.worldToLocal(vector.set(following.x, map ? walkingSurface(map, following.x, following.z).height : point.y, following.z)))
      attendant.current.userData = { ...data, heading: following.heading, activity: "idle", supportHeight: 0, carrying: 0,
        moving: paused ? attendant.current.userData.moving : distance > 1e-6, distance, motionReset: reset, phase: (data.phase ?? 0) + 0.5 }
      // Walking must use its normal clip, and never inherit the knight's prayer indoors.
      attendant.current.userData.activity = attendant.current.userData.moving ? "walking" : undefined
      lastSquire.current = following
    }
  }, -2)
  const props = { map, selected, outlineColor, onClick, characterScale }
  return <>
    <group ref={person} visible={false}><CharacterSprite {...props} type="knight" appearance={appearance} visualOverride={visual} characterFps={characterFps} walkTuning={walkTuning} /></group>
    <group ref={mount}><TransportSprite {...props} kind="horse" knight="mounted" horseVariant="noble" coat={coat} variant={variant} /></group>
    <group ref={horse} visible={false}><TransportSprite {...props} kind="horse" knight="saddled" horseVariant="noble" coat={coat} /></group>
    <AnimalTether animal={horse} kind="horse" horseVariant="noble" characterScale={characterScale} selected={selected} outlineColor={outlineColor} onClick={onClick} />
    {squire && <group ref={attendant} name="squire"><CharacterSprite {...props} type="merchant" visualOverride={attendantVisual} characterFps={characterFps} walkTuning={walkTuning} /></group>}
  </>
}
