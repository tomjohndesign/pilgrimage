"use client"

import { TERRAIN } from "@/lib/game/map/terrain"

import { AssetEditorCanvasControls, AssetEditorHelp } from "./asset-editor-frame"
import { LabSelect, LabSlider, labButton } from "./lab-controls"
import { SURFACE_LIGHT } from "@/lib/game/render/lighting"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { PixelCanvas, PixelCharacters } from "./pixel-canvas"
import { Bridges } from "./game/bridges"
import { walkingSurface } from "@/lib/game/map/walking-surface"
import { roadLanePoint } from "@/lib/game/map/road-lane"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import { TURNING_SCENARIOS, turningDemo, type TurningScenario } from "@/lib/game/transport/turning-demo"
import { DEFAULT_CART_TURN_RADIUS } from "@/lib/game/transport/route"
import { TerrainTiles } from "./game/terrain-tiles"
import { Trees } from "./game/trees"
import { CameraLight } from "./game/camera-light"
import { OutlinePass } from "./game/outline-pass"
import { TravelerFigure } from "./game/traveler-figure"
import { populationDesign } from "@/lib/game/base-person/population"
import { rollComplexion } from "@/lib/game/base-person/complexion"
import { makeRng } from "@/lib/game/rng"
import { BASE_CHARACTER_SCALE, DEFAULT_WALK_CADENCE, personWalkStride } from "@/lib/game/base-person/gait"
import { TRAVELER_TYPES } from "@/lib/game/travelers"
import { CAM_FAR, CAM_NEAR, cameraOffset } from "@/lib/game/render/iso"
import { merchantDemo, type MerchantDemoFrame, type MerchantDemo } from "@/lib/game/transport/demo"
import type { Cargo, HorseVariant, Puller } from "@/lib/game/transport/assets"

/** The demo cast is fixed, but drawn from the same colouring tables as the road. */
const DEMO_COMPLEXIONS = [7, 21, 34].map(seed => rollComplexion(makeRng(seed)))

const PASSER_SPEED = personWalkStride(populationDesign(TRAVELER_TYPES.pilgrim, 1)) * BASE_CHARACTER_SCALE * DEFAULT_WALK_CADENCE
const CAMERA = { manual: true, near: CAM_NEAR, far: CAM_FAR, position: [20, 20, 20] as [number, number, number] }

function MapCamera({ row, zoom, map }: { row: number; zoom: number; map: GameMap }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera, height = Math.max(7, (map.width + map.depth) * 3.3 / zoom), aspect = size.width / size.height
    const fitted = Math.max(height, 12 / aspect)
    cam.left = -fitted * aspect / 2; cam.right = -cam.left; cam.top = fitted / 2; cam.bottom = -cam.top
    const offset = cameraOffset(row * Math.PI / 4)
    cam.position.set(offset[0], offset[1] - 0.2, offset[2]); cam.lookAt(0, -0.2, 0); cam.updateProjectionMatrix()
  }, [camera, size, row, zoom, map])
  return null
}

function DemoActors({ demo, clock, seek, playing, rate, onProgress, ...options }: {
  demo: MerchantDemo; clock: { current: number }; seek: number; playing: boolean; rate: number
  onProgress: (frame: MerchantDemoFrame) => void; cargo: Cargo; puller: Puller; horseVariant: HorseVariant; coat: string
}) {
  const merchant = useRef<THREE.Group>(null), customer = useRef<THREE.Group>(null), passer = useRef<THREE.Group>(null)
  const last = useRef(-1), report = useRef(0)
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    const debug = window as unknown as { __merchantMotion?: () => unknown }
    debug.__merchantMotion = () => [merchant.current, customer.current, passer.current].map((group, actor) => {
      const sprites: unknown[] = []
      group?.traverse(object => { if (object instanceof THREE.Sprite && object.name) sprites.push({ name: object.name, ...object.userData, position: object.getWorldPosition(new THREE.Vector3()).toArray() }) })
      return { actor, ...group?.userData, position: group?.position.toArray(), sprites }
    })
    return () => { delete debug.__merchantMotion }
  }, [])
  useEffect(() => { clock.current = seek; last.current = -1 }, [seek, clock, demo])
  useFrame((_, delta) => {
    if (!merchant.current || !customer.current || !passer.current) return
    if (playing) clock.current = (clock.current + Math.min(delta, 0.1) * rate) % demo.duration
    const index = Math.min(demo.frames.length - 1, Math.floor(clock.current / demo.step)), frame = demo.frames[index]
    const reset = last.current < 0 || index < last.current || index - last.current > 15
    const previous = reset ? frame : demo.frames[last.current]
    last.current = index
    const apply = (group: THREE.Group, current: MerchantDemoFrame["merchant"], before: MerchantDemoFrame["merchant"]) => {
      group.position.set(current.x, walkingSurface(demo.map, current.x, current.z).height, current.z); group.rotation.y = current.heading
      group.userData = { heading: current.heading, moving: current.moving, motionReset: reset, distance: reset || !playing ? 0 : Math.hypot(current.x - before.x, current.z - before.z), playbackRate: playing ? rate : 0 }
    }
    apply(merchant.current, frame.merchant, previous.merchant)
    Object.assign(merchant.current.userData, { keeperTime: frame.keeperTime, keeperAudience: true, cartPose: frame.cartPose, cartManeuver: demo.turning, animalHeading: demo.turning ? frame.merchant.heading : undefined, reversing: frame.reversing ?? false, shopHeading: Math.PI / 2, shopSide: 1, activity: frame.activity, shopProgress: frame.shopProgress, pasture: frame.pasture, pastureY: 0.2, pastureGrass: true })
    if (!demo.turning) apply(customer.current, frame.customer, previous.customer)
    customer.current.visible = true
    // Opposing walkers exercise both bridge lanes alongside the cart.
    for (const [walker, direction] of (demo.turning ? [[passer.current, 1], [customer.current, -1]] : [[passer.current, 1]]) as [THREE.Group, number][]) {
      const span = demo.map.width + 1, oldX = walker.position.x, oldZ = walker.position.z
      let x = ((clock.current * PASSER_SPEED + 2) % span) - span / 2, z = 2.25, heading = Math.PI / 2
      if (demo.turning) {
        const road = demo.map.road!, along = (clock.current * PASSER_SPEED + 2) % (road.length - 1)
        const progress = direction === 1 ? along : road.length - 1 - along
        const at = (progress: number) => {
          const lane = roadLanePoint(demo.map, road, progress, direction * 0.28)
          if (lane) return lane
          // Fallback for a route without a cardinal road lane.
          const i = Math.max(0, Math.min(road.length - 2, Math.floor(progress))), a = road[i], b = road[i + 1], t = progress - i
          return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
        }
        const p = at(progress), next = at(progress + direction * 0.001)
        x = tileToWorldX(demo.map, p.x); z = tileToWorldZ(demo.map, p.z); heading = Math.atan2(next.x - p.x, next.z - p.z)
      }
      const walked = Math.hypot(x-oldX,z-oldZ), discontinuity = reset || walked > 1
      walker.position.set(x, walkingSurface(demo.map,x,z).height, z); walker.rotation.y = heading
      walker.userData = { heading, moving: true, motionReset: discontinuity, distance: !playing || discontinuity ? 0 : walked, playbackRate: playing ? rate : 0 }
    }
    report.current += delta
    if (report.current > 0.1 || reset) { report.current = 0; onProgress(frame) }
  }, -3)
  return <PixelCharacters>
    <group ref={merchant}><TravelerFigure map={demo.map} {...options} type={TRAVELER_TYPES.vendor} characterModel="base" characterScale={BASE_CHARACTER_SCALE} appearance={{ variant: 0, scale: 1, bodyType: "Male", complexion: DEMO_COMPLEXIONS[0] }} /></group>
    <group ref={customer}><TravelerFigure map={demo.map} type={TRAVELER_TYPES.peasant} characterModel="base" characterScale={BASE_CHARACTER_SCALE} appearance={{ variant: 3, scale: 1, bodyType: "Female", complexion: DEMO_COMPLEXIONS[1] }} /></group>
    <group ref={passer}><TravelerFigure map={demo.map} type={TRAVELER_TYPES.pilgrim} characterModel="base" characterScale={BASE_CHARACTER_SCALE} appearance={{ variant: 1, scale: 1, bodyType: "Male", complexion: DEMO_COMPLEXIONS[2] }} /></group>
  </PixelCharacters>
}

function TurningTrails({ demo }: { demo: MerchantDemo }) {
  const lines = useMemo(() => ["hitch", "axle"].map((kind, i) => {
    const points = demo.frames.filter((_, n) => n % 3 === 0).map(frame => {
      const p = kind === "hitch" ? frame.cartPose.hitch : frame.cartPose
      return new THREE.Vector3(p.x, walkingSurface(demo.map, p.x, p.z).height + 0.025, p.z)
    })
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: i ? "#69c7df" : "#f2cc67", depthWrite: false, depthTest: false }))
    line.renderOrder = 10
    return line
  }), [demo])
  useEffect(() => () => { for (const line of lines) { line.geometry.dispose(); line.material.dispose() } }, [lines])
  return <group>{lines.map((line, i) => <primitive key={i} object={line} />)}</group>
}

/** The real terrain, character render pass, scale and transport assembly, shown
 * as a short isolated journey within the existing character playground.
 */
export function MerchantMapPreview({ playing, onPlayingChange, row, zoom, ...options }: {
  playing: boolean; onPlayingChange: (playing: boolean) => void; row: number; zoom: number; cargo: Cargo; puller: Puller; horseVariant: HorseVariant; coat: string
}) {
  const [scenario, setScenario] = useState<"merchant" | TurningScenario>("merchant")
  const [radius, setRadius] = useState(DEFAULT_CART_TURN_RADIUS), [trails, setTrails] = useState(true)
  useEffect(() => {
    const query = new URLSearchParams(window.location.search), requested = query.get("scenario")
    if (TURNING_SCENARIOS.some(s => s.id === requested)) setScenario(requested as TurningScenario)
    const requestedRadius = Number(query.get("radius"))
    if (query.has("radius") && Number.isFinite(requestedRadius)) setRadius(Math.max(0.4, Math.min(3, requestedRadius)))
  }, [])
  const demo = useMemo(() => scenario === "merchant" ? merchantDemo(options.puller, options.horseVariant)
    : turningDemo(scenario, options.puller, options.horseVariant, radius), [scenario, options.puller, options.horseVariant, radius])
  const firstContact = useMemo(() => demo.turning ? demo.frames.find(f => !f.clearance) : undefined, [demo])
  const clock = useRef(0), [seek, setSeek] = useState(0), [rate, setRate] = useState(1)
  const [frame, setFrame] = useState(demo.frames[0])
  useEffect(() => { clock.current = 0; setSeek(0); setFrame(demo.frames[0]) }, [demo])
  const jump = (time: number) => { clock.current = time; setSeek(time); setFrame(demo.frames[Math.min(demo.frames.length - 1, Math.round(time / demo.step))]) }
  return <div className="merchant-map-preview" aria-label="Merchant journey on a small map">
    <div className="merchant-map-scene"><PixelCanvas orthographic camera={CAMERA}>
      <color attach="background" args={[TERRAIN.grass.color]} /><ambientLight intensity={SURFACE_LIGHT.ambient} /><hemisphereLight args={[SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere]} /><CameraLight />
      <MapCamera row={row} zoom={zoom} map={demo.map} />
      <Suspense fallback={null}><TerrainTiles map={demo.map} showGrid traffic={3} /><Trees map={demo.map} /><Bridges map={demo.map} />
        {demo.turning && trails && <TurningTrails demo={demo} />}
        <DemoActors key={`${scenario}:${radius}:${options.puller}:${options.horseVariant}`} {...options} demo={demo} clock={clock} seek={seek} playing={playing} rate={rate} onProgress={setFrame} />
      </Suspense><OutlinePass />
    </PixelCanvas></div>
    <AssetEditorCanvasControls>
      <div className="workspace-canvas-toolbar" aria-label="Journey controls">
        <LabSelect label="Scenario" ariaLabel="Cart simulation" value={scenario} options={{ merchant: "Merchant journey", ...Object.fromEntries(TURNING_SCENARIOS.map(item => [item.id, item.label])) }} onChange={value => setScenario(value as typeof scenario)} />
        <LabSelect label="Stage" value={frame.stage} options={Object.fromEntries(demo.stages.map(stage => [stage, stage]))} onChange={value => { onPlayingChange(false); jump(demo.starts[value as typeof frame.stage] ?? 0) }} />
        <button className={labButton} onClick={() => jump(0)}>Restart</button>
        <div className="workspace-scrubber"><LabSlider label="Journey progress" value={frame.time} min={0} max={demo.duration} step={demo.step} suffix=" s" onChange={value => { onPlayingChange(false); jump(value) }} /></div>
        <LabSelect label="Speed" ariaLabel="Journey speed" value={String(rate)} options={{ 1: "1×", 2: "2×", 4: "4×" }} onChange={value => setRate(Number(value))} />
        {demo.turning && <><div className="workspace-radius"><LabSlider label="Turn radius" value={radius} min={0.4} max={3} step={0.1} suffix=" tiles" onChange={setRadius} /></div><label className="person-check"><input type="checkbox" checked={trails} onChange={event => setTrails(event.target.checked)} />Show trails</label><button className={labButton} disabled={!firstContact} onClick={() => { if (firstContact) { onPlayingChange(false); jump(firstContact.time) } }}>First contact</button></>}
        <AssetEditorHelp label="Journey">{demo.turning ? TURNING_SCENARIOS.find(item => item.id === scenario)?.description : "Scrub or choose a stage to pause and inspect the journey. Directions below rotate the camera. The map uses the same scale as the game."}</AssetEditorHelp>
        <span className="workspace-canvas-status" role="status">{demo.turning ? frame.clearance ? "Route clear" : "Edge contact" : frame.stage === "Selling" ? frame.sales ? "Customer served" : "Customer browsing" : frame.stage === "Closing" && frame.shopProgress === 0 && frame.pasture && !frame.pasture.ready ? "Waiting for the animal" : frame.stage}</span>
      </div>
    </AssetEditorCanvasControls>
  </div>
}
