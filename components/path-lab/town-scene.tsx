"use client"

import { SURFACE_LIGHT } from "@/lib/game/render/lighting"

import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { PixelCanvas, PixelCharacters } from "@/components/pixel-canvas"
import { CharacterSprite } from "@/components/game/character-sprite"
import { TerrainTiles } from "@/components/game/terrain-tiles"
import { FoliageField } from "@/components/game/foliage-field"
import { DEFAULT_FOLIAGE_ATLAS } from "@/lib/game/trees/foliage/assets"
import { StructureModel } from "@/components/building-lab/building-model"
import { structureParts } from "@/lib/game/building-art/structure"
import { buildingYaw, rotatedFootprint } from "@/lib/game/building-rotation"
import { BASE_CHARACTER_SCALE } from "@/lib/game/base-person/gait"
import { cameraOffset, lightOffsetForYaw, yawForView } from "@/lib/game/render/iso"
import { tileToWorldX, tileToWorldZ } from "@/lib/game/map/types"
import { townRoadSegments } from "@/lib/path-lab/town-roads"
import { WIDTH, type PathSettings } from "@/lib/path-lab/simulation"
import { advanceTown, residentVisual, TOWN_SITES, type Resident, type Town } from "@/lib/path-lab/town"

export interface TownPlayback { playing: boolean; speed: number; settings: PathSettings }
function Clock({ town, live, onReady }: { town: Town; live: MutableRefObject<TownPlayback>; onReady: () => void }) {
  useEffect(onReady, [onReady])
  useFrame((_, dt) => advanceTown(town, live.current.playing && !document.hidden ? Math.min(dt, .1) * live.current.speed : 0, live.current.settings), -3)
  return null
}
function Person({ town, person, live, selected, onSelect }: { town: Town; person: Resident; live: MutableRefObject<TownPlayback>; selected: boolean; onSelect: () => void }) {
  const root = useRef<THREE.Group>(null), revision = useRef(town.revision)
  const visual = useMemo(() => residentVisual(person), [person])
  useFrame(() => {
    const group = root.current!
    const reset = revision.current !== town.revision
    group.position.set(tileToWorldX(town.map, person.x), .2, tileToWorldZ(town.map, person.z))
    group.visible = !!person.trip || person.target !== person.home
    Object.assign(group.userData, { heading: person.heading, distance: reset ? 0 : person.distance,
      moving: !!person.trip, carrying: person.trip && person.carrying ? 1 : 0,
      playbackRate: live.current.playing ? live.current.speed : 0, initialized: true, phase: person.id / 12, motionReset: reset })
    revision.current = town.revision
  }, -2)
  return <group ref={root}><CharacterSprite map={town.map} type={person.calling} characterModel="base" visualOverride={visual}
    characterScale={BASE_CHARACTER_SCALE} selected={selected} onClick={event => { event.stopPropagation(); onSelect() }} /></group>
}
function Camera({ town, view, focus, selected, labels }: { town: Town; view: number; focus: number | null; selected: number | null; labels: MutableRefObject<Map<string, HTMLButtonElement>> }) {
  const { camera, gl, size } = useThree(), controls = useRef<OrbitControls | null>(null)
  useEffect(() => {
    const control = new OrbitControls(camera, gl.domElement)
    control.enableRotate = false; control.enableDamping = true; control.screenSpacePanning = false
    control.minZoom = .7; control.maxZoom = 3.5
    control.mouseButtons.LEFT = THREE.MOUSE.PAN
    control.touches.ONE = THREE.TOUCH.PAN
    controls.current = control
    return () => { control.dispose(); controls.current = null }
  }, [camera, gl])
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera, aspect = size.width / size.height
    const height = Math.max(25, 43 / aspect)
    cam.left = -height * aspect / 2; cam.right = -cam.left; cam.top = height / 2; cam.bottom = -cam.top
    cam.updateProjectionMatrix()
  }, [camera, size])
  useEffect(() => {
    const person = focus === null ? null : town.people[focus]
    const target = person ? new THREE.Vector3(tileToWorldX(town.map, person.x), .2, tileToWorldZ(town.map, person.z)) : new THREE.Vector3(0, .2, -1.5)
    camera.position.copy(target).add(new THREE.Vector3(...cameraOffset(yawForView(view))))
    camera.lookAt(target); (camera as THREE.OrthographicCamera).zoom = person ? 2.4 : 1
    camera.updateProjectionMatrix(); controls.current?.target.copy(target); controls.current?.update()
  }, [camera, town, view, focus])
  const point = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    controls.current?.update(); camera.updateMatrixWorld()
    const occupied: Array<[number, number, number]> = []
    const resident = selected === null ? null : town.people[selected], badge = labels.current.get("resident")
    if (resident && badge) {
      point.set(tileToWorldX(town.map, resident.x), 1.5, tileToWorldZ(town.map, resident.z)).project(camera)
      badge.style.left = `${(point.x + 1) * 50}%`; badge.style.top = `${(1 - point.y) * 50}%`
      badge.style.visibility = (!resident.trip && resident.target === resident.home) || Math.abs(point.x) > .98 || Math.abs(point.y) > .95 ? "hidden" : "visible"
      if (badge.style.visibility === "visible") occupied.push([(point.x + 1) * size.width / 2, (1 - point.y) * size.height / 2, resident.name.length * 6 + 20])
    }
    for (const site of TOWN_SITES) {
      const element = labels.current.get(site.id)
      if (!element) continue
      point.set(tileToWorldX(town.map, site.x) + .5, 2, tileToWorldZ(town.map, site.z) + .5).project(camera)
      element.style.left = `${(point.x + 1) * 50}%`; element.style.top = `${(1 - point.y) * 50}%`
      const x = (point.x + 1) * size.width / 2, y = (1 - point.y) * size.height / 2, width = site.label.length * 6 + 20
      const crowded = occupied.some(([otherX, otherY, otherWidth]) => Math.abs(x - otherX) < (width + otherWidth) / 2 && Math.abs(y - otherY) < 26)
      element.style.visibility = crowded || Math.abs(point.x) > .98 || Math.abs(point.y) > .95 ? "hidden" : "visible"
      if (element.style.visibility === "visible") occupied.push([x, y, width])
    }
  }, -2)
  return null
}
export function TownScene({ town, live, view, focus, selected, labels, onSelect, onReady }: {
  town: Town; live: MutableRefObject<TownPlayback>; view: number; focus: number | null; selected: number | null
  labels: MutableRefObject<Map<string, HTMLButtonElement>>; onSelect: (id: number) => void; onReady: () => void
}) {
  const roads = useMemo(() => townRoadSegments(town.world, town.map), [town, town.world.time])
  const buildings = useMemo(() => TOWN_SITES.map(site => structureParts({ ...site, ...rotatedFootprint(site, site.rotation) })), [])
  const trees = useMemo(() => Array.from(town.world.blocked).flatMap((blocked, i) => blocked === 1 ? [{ x: tileToWorldX(town.map, i % WIDTH), y: .2, z: tileToWorldZ(town.map, Math.floor(i / WIDTH)), species: "oak" as const, scale: .8 }] : []), [town])
  return <PixelCanvas orthographic camera={{ manual: true, position: [80, 80, 80], near: .1, far: 400 }}>
    <color attach="background" args={["#14100a"]} />
    <ambientLight intensity={SURFACE_LIGHT.ambient} /><hemisphereLight args={[SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere]} />
    <directionalLight intensity={SURFACE_LIGHT.sun} position={lightOffsetForYaw(yawForView(view))} />
    <Camera town={town} view={view} focus={focus} selected={selected} labels={labels} />
    <TerrainTiles map={town.map} traffic={0} traveledRoads={roads} />
    <Suspense fallback={null}><FoliageField atlas={DEFAULT_FOLIAGE_ATLAS} placements={trees} seed={42} /></Suspense>
    {TOWN_SITES.map((site, i) => <group key={site.id} position={[tileToWorldX(town.map, site.x) + .5, .2, tileToWorldZ(town.map, site.z) + .5]} rotation={[0, buildingYaw(site.rotation), 0]}>
      <StructureModel parts={buildings[i]} ink={false} />
    </group>)}
    <Suspense fallback={null}>
      <Clock town={town} live={live} onReady={onReady} />
      <PixelCharacters>{town.people.map(person => <Person key={person.id} town={town} person={person} live={live} selected={selected === person.id} onSelect={() => onSelect(person.id)} />)}</PixelCharacters>
    </Suspense>
  </PixelCanvas>
}
