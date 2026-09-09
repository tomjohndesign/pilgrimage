"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { worldToTileX, worldToTileZ, type GameMap } from "@/lib/game/map/types"
import { computeForestShade, computeDarkShade } from "@/lib/game/map/forest-field"
import { grassSurfaceColor } from "@/lib/game/render/ground-palette"
import { deriveSeed, makeRng, SEED_STREAM } from "@/lib/game/rng"
import { walkingSurface } from "@/lib/game/map/walking-surface"
import { useBuildStore } from "@/lib/game/build-store"
import { useSimulationStore } from "@/lib/game/simulation-store"
import { simRegistry } from "@/lib/game/sim"
import { SpatialPoints } from "@/lib/game/spatial-points"
import { frameProfile } from "@/lib/game/render/frame-profile"
import { isWorldVisible } from "@/lib/game/render/visibility"
import { onTreeStrike } from "@/lib/game/trees/impact"
import type { TreePlacement } from "@/lib/game/trees/placement"
import { OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"
import { burrowMotion } from "@/lib/game/wildlife/burrow-motion"
import { createBurrowRig } from "@/lib/game/wildlife/burrow"
import { birdGlide, easeWing } from "@/lib/game/wildlife/motion"
import { RIG_TO_WORLD } from "@/lib/game/transport/assets"
import { createWildlife, startleWildlife, stepWildlife, type WildlifeAnimal } from "@/lib/game/wildlife/simulation"
import { selectElement } from "@/lib/game/selection"
import { wildlifeGeometry } from "@/lib/game/wildlife/batch"
import { useAnimalRigStore } from "@/lib/game/wildlife/rig-store"
import { wildlifeRegistry } from "@/lib/game/wildlife/registry"
import { frameQuality } from "@/lib/game/render/frame-quality"
import { useCameraStore } from "@/lib/game/camera-store"
import { createWildlifeRig } from "@/lib/game/wildlife/rig"
import { isBird, type WildlifeKind } from "@/lib/game/wildlife/species"

/**
 * Radius of the sphere an animal is culled by, in tiles. Comfortably larger
 * than the biggest body, so a hawk's wingspan is never clipped out of the view
 * it is still visible in, and wide enough that a fast pan or a bolting deer
 * never reveals a stale pose.
 */
const SKIN_RADIUS = 4

/** Ambient fauna share the world's pixel grid and depth/overlap pass. Connected hides share
 * bounded vertex buffers per species for both colour and selection passes. */
export function Wildlife({ map, trees, characterScale }: { map: GameMap; trees: readonly TreePlacement[]; characterScale: number }) {
  const root = useRef<THREE.Group>(null)
  // Building placement updates map.buildings without resetting every animal's life.
  const world = useMemo(() => createWildlife(map, trees, characterScale), [map.tiles, map.seed, trees])
  useEffect(() => { wildlifeRegistry.current = world; return () => { if (wildlifeRegistry.current === world) wildlifeRegistry.current = null } }, [world])
  const strikes = useRef<TreePlacement[]>([])
  const accumulator = useRef(0)
  useEffect(() => onTreeStrike(tree => { if (world.trees.includes(tree)) strikes.current.push(tree) }), [world])
  const batches = useMemo(() => {
    const groups = new Map<WildlifeKind, WildlifeAnimal[]>()
    world.animals.forEach(animal => { const list = groups.get(animal.kind) ?? []; list.push(animal); groups.set(animal.kind, list) })
    return [...groups]
  }, [world])
  useFrame(({ scene }, delta) => {
    if (root.current) root.current.visible = frameQuality(scene) < 2 || useCameraStore.getState().selection?.kind === "animal"
    const playback = useSimulationStore.getState()
    if (playback.paused) return
    const felled = useBuildStore.getState().felled
    for (const tree of strikes.current) startleWildlife(world, tree, map, felled)
    strikes.current.length = 0
    // Fixed simulation steps keep flock timings reproducible across display frame rates.
    accumulator.current += Math.min(delta, 0.1) * playback.speed
    if (accumulator.current < 1 / 30) return
    const started = frameProfile.start()
    const people = [...(simRegistry.current?.travelers.values() ?? [])]
    const nearbyPeople = new SpatialPoints(people)
    const nearbyAnimals = new SpatialPoints(world.animals.filter(animal => !isBird(animal.kind)))
    while (accumulator.current >= 1 / 30) {
      stepWildlife(world, map, 1 / 30, characterScale, felled, people, useAnimalRigStore.getState().designs, nearbyPeople, nearbyAnimals)
      accumulator.current -= 1 / 30
    }
    frameProfile.end("wildlife", started)
  }, -1)
  const burrowTurf = useMemo(() => {
    const shade = computeForestShade(map), dark = computeDarkShade(map)
    const rng = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.tileJitter))
    const grains = map.tiles.map(() => rng() - .5)
    return world.burrows.map(burrow => {
      const i = worldToTileZ(map, burrow.z) * map.width + worldToTileX(map, burrow.x)
      return grassSurfaceColor(shade[i], dark[i], grains[i])
    })
  }, [map, world])
  return <group ref={root} name="wildlife" userData={{ animals: world.animals, burrows: world.burrows }}>
    {world.burrows.map(burrow => <RabbitHole key={burrow.id} burrow={burrow} map={map} scale={characterScale} turf={burrowTurf[burrow.id]} />)}
    {batches.map(([kind, animals]) => <WildlifeBatch key={kind} kind={kind} animals={animals} map={map} scale={characterScale} />)}
  </group>
}

export function WildlifeBatch({ kind, animals, map, scale, grazing }: { kind: WildlifeKind; animals: WildlifeAnimal[]; map: GameMap; scale: number; grazing?: number }) {
  const group = useRef<THREE.Group>(null)
  const rig = useMemo(() => createWildlifeRig(kind), [kind])
  const batch = useMemo(() => wildlifeGeometry(rig.parts, animals.map(animal => animal.id)), [rig, animals])
  const material = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), [])
  const idMaterial = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), [])
  const scratch = useMemo(() => ({ root: new THREE.Object3D(), frustum: new THREE.Frustum(), viewProjection: new THREE.Matrix4(), view: new THREE.Matrix4(), bounds: new THREE.Sphere(), drawn: new THREE.Box3(), sphere: new THREE.Sphere() }), [])
  const drawnAnimals = useMemo(() => [] as number[], [])
  const posed = useMemo(() => new Array<number>(animals.length).fill(-1), [batch, animals, map, scale, grazing])
  const lastDesign = useRef<unknown>(null)
  useEffect(() => () => { rig.dispose(); batch.dispose(); material.dispose(); idMaterial.dispose() }, [rig, batch, material, idMaterial])
  useFrame(({ camera }) => {
    if (!isWorldVisible(group.current)) return
    const { root, frustum, viewProjection, view, bounds, drawn, sphere } = scratch, size = RIG_TO_WORLD * scale
    drawn.makeEmpty(); drawnAnimals.length = 0
    const design = useAnimalRigStore.getState().designs[kind]
    if (lastDesign.current !== design) { posed.fill(-1); lastDesign.current = design }
    // Posing an animal deforms its hide and rewrites every one of its vertices
    // on the CPU, so only animals the camera can see are worth skinning. The
    // margin keeps ones just out of frame current, so none walks into view
    // holding a stale pose.
    camera.updateMatrixWorld()
    frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, view.copy(camera.matrixWorld).invert()))
    bounds.radius = SKIN_RADIUS
    for (let i = 0; i < animals.length; i++) {
      const animal = animals[i], bird = isBird(kind)
      bounds.center.set(animal.x, animal.y, animal.z)
      if (animal.concealed || !frustum.intersectsSphere(bounds)) continue
      drawnAnimals.push(i)
      drawn.expandByPoint(bounds.center)
      // Simulation advances at 30 Hz. Reuse identical poses between ticks and
      // while paused; camera movement still refreshes visibility every frame.
      if (posed[i] === animal.age) continue
      posed[i] = animal.age
      const graze = grazing ?? animal.grazing
      const flight = animal.flight, wingBlend = flight ? easeWing(Math.min(flight.elapsed / 0.35, (flight.duration - flight.elapsed) / 0.45)) : 0
      const glide = bird && flight ? birdGlide(kind as "hawk" | "sparrow", flight.elapsed, flight.duration) : 0
      const burrow = kind === "rabbit" && ["entering","inside","emerging"].includes(animal.burrowState) ? {...burrowMotion(animal.shelter,animal.burrowState!=="emerging"),concealed:animal.concealed} : undefined
      const posePhase = burrow ? burrow.clipPhase : animal.moving || bird ? animal.phase : (animal.actionAge * (animal.action === "lie" ? 0.125 : 0.8)) % 1
      rig.pose(posePhase, animal.moving, animal.age, graze, wingBlend, animal.gait, { burrow, glide, drive: animal.drive, lying: animal.lying, edits: design, clip: bird ? flight ? glide > .5 ? "glide" : "fly" : "idle" : animal.moving ? animal.gait : animal.action })
      root.position.set(animal.x, animal.y, animal.z)
      root.rotation.set(0, animal.heading, 0, "YXZ")
      if (!bird) {
        const surface = walkingSurface(map, animal.x, animal.z), c = Math.cos(animal.heading), s = Math.sin(animal.heading)
        root.position.y = surface.height + (burrow?.y??0) * size
        root.rotation.x = -Math.atan(surface.dx * s + surface.dz * c) + (burrow?.pitch??0)
        root.rotation.z = Math.atan(surface.dx * c - surface.dz * s)
      } else if (animal.flight) root.rotation.z = Math.sin(animal.flight.elapsed / animal.flight.duration * Math.PI * 2) * (kind === "hawk" ? 0.2 : 0.08)
      root.scale.setScalar(size); root.updateMatrix()
      batch.write(i, root.matrix)
      drawn.expandByPoint(root.position)
    }
    // Bounds enclose the animals actually drawn, grown by a body's reach.
    // Hidden animals have no submitted triangles and cannot intercept picking.
    batch.setVisible(drawnAnimals)
    if (!drawn.isEmpty()) {
      drawn.getBoundingSphere(sphere).radius += SKIN_RADIUS
      batch.finish(sphere)
    }
  })
  return <group ref={group} name={`wildlife-${kind}`}>
    <mesh geometry={batch.geometry} material={material} frustumCulled={false} onClick={event => {
      if (event.faceIndex == null) return
      const index = batch.animalAtFace(event.faceIndex)
      const animal = index === undefined ? undefined : animals[index]
      if (animal && !animal.concealed) selectElement({ kind: "animal", id: animal.id }, event)
    }} />
    <mesh geometry={batch.idGeometry} material={idMaterial} layers-mask={OUTLINE_ID_LAYER_MASK} frustumCulled={false} raycast={() => null} />
  </group>
}

function RabbitHole({ burrow, map, scale, turf }: { burrow: import("@/lib/game/wildlife/simulation").RabbitBurrow; map: GameMap; scale: number; turf: THREE.Color }) {
  const rig = useMemo(() => createBurrowRig(turf), [turf])
  useEffect(() => () => rig.dispose(), [rig])
  const surface = walkingSurface(map, burrow.x, burrow.z)
  const c = Math.cos(burrow.heading), s = Math.sin(burrow.heading)
  const rotation = new THREE.Euler(-Math.atan(surface.dx * s + surface.dz * c), burrow.heading, Math.atan(surface.dx * c - surface.dz * s), "YXZ")
  return <group name="rabbit-burrow" position={[burrow.x, surface.height, burrow.z]} rotation={rotation} scale={RIG_TO_WORLD * scale}>
    <primitive object={rig.root} />
    {/* Like terrain, the raised bank writes depth with ID zero so selection
        outlines cannot show rabbits through the turf roof. */}
    <mesh geometry={rig.geometry} layers-mask={OUTLINE_ID_LAYER_MASK} raycast={() => null}>
      <meshBasicMaterial color="#000000" side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  </group>
}
