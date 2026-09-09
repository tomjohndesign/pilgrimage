"use client"

import { Suspense, useMemo, useRef, useState, type RefObject } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import type { GameMap } from "@/lib/game/map/types"
import { walkingSurface } from "@/lib/game/map/walking-surface"
import type { SimState } from "@/lib/game/sim"
import type { Traveler } from "@/lib/game/travelers"
import type { PackAnimal } from "@/lib/game/transport/party-assets"
import type { TravelParty } from "@/lib/game/travel-parties"
import { travelerAppearance } from "@/lib/game/base-person/population"
import { useCameraStore } from "@/lib/game/camera-store"
import { useSimulationStore } from "@/lib/game/simulation-store"
import { encodeObjectId, travelerObjectId } from "@/lib/game/render/outline"
import { selectElement, markPerson } from "@/lib/game/selection"
import { TransportSprite } from "./transport-sprite"
import { CartReins } from "./cart-reins"
import { CharacterHitTarget } from "./character-selection"

/** Additional layers share the existing character renderer, depth and individual
 * selection IDs. Passengers' walking figures are hidden only while aboard. */
export function PartyTransportFigures({ handlers, sim, map, travelers, characterScale }: {
  handlers: RefObject<Array<THREE.Group | null>>; sim: SimState; map: GameMap; travelers: Traveler[]; characterScale: number
}) {
  const cull = useMemo(() => ({ frustum: new THREE.Frustum(), matrix: new THREE.Matrix4(), bounds: new THREE.Sphere(new THREE.Vector3(), 24) }), [])
  const [parties, setParties] = useState<TravelParty[]>([])
  const mounted = useRef(new Map<number, string>())
  useFrame(({ camera }) => {
    cull.frustum.setFromProjectionMatrix(cull.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    // Mount companies near the view and keep them until they are well outside it,
    // so a column crossing the edge does not rebuild its sprites every frame.
    let changed = false
    const visible: TravelParty[] = []
    for (const p of sim.parties.values()) {
      const point = p.transport?.pose ?? p.packs?.[0]?.pose
      if (!point) continue
      const seats = p.transport?.seats.join(",") ?? ""
      const known = mounted.current.get(p.id)
      cull.bounds.center.set(point.x, walkingSurface(map, point.x, point.z).height, point.z)
      cull.bounds.radius = known === undefined ? 24 : 48
      if (!cull.frustum.intersectsSphere(cull.bounds)) continue
      if (known !== seats) changed = true
      visible.push(p)
    }
    if (!changed && visible.length === mounted.current.size) return
    mounted.current = new Map(visible.map(p => [p.id, p.transport?.seats.join(",") ?? ""]))
    setParties(visible)
  }, -2.9)
  return <Suspense fallback={null}>{parties.map(party => <PartyFigure key={party.id} {...{ handlers, party, sim, map, travelers, characterScale }} />)}</Suspense>
}
function PartyFigure({ handlers, party, sim, map, travelers, characterScale }: {
  handlers: RefObject<Array<THREE.Group | null>>; party: TravelParty; sim: SimState; map: GameMap; travelers: Traveler[]; characterScale: number
}) {
  const cart = useRef<THREE.Group>(null), beast = useRef<THREE.Group>(null)
  const riders = useRef<Array<THREE.Group | null>>([]), packs = useRef<Array<THREE.Group | null>>([])
  const selection = useCameraStore(s => s.selection)
  const indices = useMemo(() => new Map(travelers.map((t, i) => [t.id, i])), [travelers])
  const vehicle = party.transport
  const color = (id: number) => encodeObjectId(travelerObjectId(indices.get(id) ?? 0))
  const click = (id: number) => (event: { delta: number; stopPropagation: () => void }) => selectElement({ kind: "traveler", id }, event)
  useFrame(() => {
    const playback = useSimulationStore.getState()
    const place = (group: THREE.Group | null, at: { x: number; z: number }, heading: number, moving: boolean) => {
      if (!group) return
      const distance = group.userData.initialized ? Math.hypot(group.position.x - at.x, group.position.z - at.z) : 0
      group.position.set(at.x, walkingSurface(map, at.x, at.z).height, at.z)
      Object.assign(group.userData, { heading, moving, distance: playback.paused || distance > 2 ? 0 : distance,
        motionReset: !group.userData.initialized || distance > 2, initialized: true, playbackRate: playback.paused ? 0 : playback.speed })
      group.updateWorldMatrix(true, false)
    }
    if (vehicle) {
      place(cart.current, vehicle.pose, vehicle.pose.heading, vehicle.distance > 1e-7)
      if (cart.current) cart.current.userData.riding = !!sim.travelers.get(vehicle.seats[0])?.partyRiding
      place(beast.current, vehicle.pose.hitch, vehicle.animalHeading, vehicle.animalDistance > 1e-7)
      if (beast.current) { beast.current.userData.hitched = true; beast.current.userData.grazing = false }
      vehicle.seats.forEach((id, seat) => {
        const group = riders.current[seat]
        if (!group) return
        group.visible = !!sim.travelers.get(id)?.partyRiding
        place(group, vehicle.pose, vehicle.pose.heading, false)
      })
    }
    party.packs?.forEach((pack, i) => {
      place(packs.current[i], pack.pose.hitch, pack.pose.heading, pack.distance > 1e-7)
      if (packs.current[i]) packs.current[i]!.userData.grazing = party.stage === "camping" && pack.distance < 1e-7
    })
  }, -2.8)
  return <group name="party-transport">
    {vehicle && <>
      <group ref={cart}><TransportSprite map={map} kind="cart" passengerCart={vehicle.style} characterScale={characterScale}
        outlineColor={color(vehicle.seats[0])} onClick={click(vehicle.seats[0])} /></group>
      <group ref={beast}><TransportSprite map={map} kind={vehicle.animal} characterScale={characterScale}
        outlineColor={color(vehicle.seats[0])} onClick={click(vehicle.seats[0])} /></group>
      {vehicle.seats.map((id, seat) => {
        const person = travelers[indices.get(id)!]
        if (!person) return null
        return <group key={id} ref={group => { riders.current[seat] = group; markPerson(group) }}>
          <TransportSprite map={map} kind="passenger" seat={seat} calling={person.type.id}
            variant={travelerAppearance(map.seed ?? 0, id).variant} characterScale={characterScale}
            selected={selection?.kind === "traveler" && selection.id === id} outlineColor={color(id)} onClick={click(id)} />
        </group>
      })}
      {<CartReins draft cart={cart} animal={beast} kind={vehicle.animal} horseVariant="common"
        characterScale={characterScale} selected={false} seatOffset={-.32} outlineColor={color(vehicle.seats[0])} />}
    </>}
    {party.packs?.map((pack, i) => <group key={`${pack.kind}:${i}`} ref={group => { packs.current[i] = group; markPerson(group) }}>
      <CharacterHitTarget onClick={click(pack.handler)} />
      <TransportSprite map={map} kind={pack.kind} pack characterScale={characterScale}
        selected={selection?.kind === "traveler" && selection.id === pack.handler}
        outlineColor={color(pack.handler)} onClick={click(pack.handler)} />
    </group>)}
    {party.packs?.map((pack, index) => {
      const person = travelers[indices.get(pack.handler)!]
      return person && <PackLead key={`lead:${index}:${pack.handler}`} animalRefs={packs} index={index}
        handlerRefs={handlers} handlerIndex={indices.get(pack.handler)!} kind={pack.kind}
        calling={person.type.id} variant={travelerAppearance(map.seed ?? 0, pack.handler).variant}
        characterScale={characterScale} outlineColor={color(pack.handler)}
        selected={selection?.kind === "traveler" && selection.id === pack.handler} onClick={click(pack.handler)} />
    })}
  </group>
}

function PackLead({ animalRefs, index, handlerRefs, handlerIndex, calling, variant, ...props }: {
  animalRefs: RefObject<Array<THREE.Group | null>>; index: number; handlerRefs: RefObject<Array<THREE.Group | null>>; handlerIndex: number
  calling: Traveler["type"]["id"]; variant: number; kind: PackAnimal; characterScale: number; outlineColor: [number,number,number]
  selected: boolean; onClick: Parameters<typeof CartReins>[0]["onClick"]
}) {
  const animal = useMemo(() => ({ get current() { return animalRefs.current[index] ?? null } }), [animalRefs,index])
  const person = useMemo(() => ({ get current() { return handlerRefs.current[handlerIndex] ?? null } }), [handlerRefs,handlerIndex])
  return <CartReins {...props} handler={{calling,variant}} animal={animal} cart={person} horseVariant="common" />
}
