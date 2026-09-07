"use client"

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
export function MerchantMapPreview({ playing, row, zoom, ...options }: {
  playing: boolean; row: number; zoom: number; cargo: Cargo; puller: Puller; horseVariant: HorseVariant; coat: string
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
      <color attach="background" args={["#252b1c"]} /><ambientLight intensity={SURFACE_LIGHT.ambient} /><hemisphereLight args={[SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere]} /><CameraLight />
      <MapCamera row={row} zoom={zoom} map={demo.map} />
      <Suspense fallback={null}><TerrainTiles map={demo.map} showGrid traffic={3} /><Trees map={demo.map} /><Bridges map={demo.map} />
        {demo.turning && trails && <TurningTrails demo={demo} />}
        <DemoActors key={`${scenario}:${radius}:${options.puller}:${options.horseVariant}`} {...options} demo={demo} clock={clock} seek={seek} playing={playing} rate={rate} onProgress={setFrame} />
      </Suspense><OutlinePass />
    </PixelCanvas></div>
    <div className="merchant-map-caption"><span role="status">{frame.stage}{frame.stage === "Selling" ? frame.sales ? " · Customer served" : " · Customer approaching and browsing" : frame.stage === "Closing" && frame.shopProgress === 0 && frame.pasture && !frame.pasture.ready ? " · Waiting for the animal" : ""}</span><span>{demo.turning ? `${frame.clearance ? "Clear of obstacles" : "Cart touches an edge"} · ${trails ? "Gold: hitch · Blue: axle" : "1 tile grid"}` : "Game scale · 1 tile grid"}</span></div>
    <div className="merchant-map-controls hud-well">
      <div className="merchant-map-timeline merchant-turn-options">
        <label>Scenario<select aria-label="Cart simulation" value={scenario} onChange={e => setScenario(e.target.value as typeof scenario)}><option value="merchant">Merchant journey</option>{TURNING_SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        {demo.turning && <><label>Turn radius<input aria-label="Cart turn radius" type="range" min={0.4} max={3} step={0.1} value={radius} onChange={e => setRadius(Number(e.target.value))} /><output>{radius.toFixed(1)} tiles</output></label><label><input type="checkbox" checked={trails} onChange={e => setTrails(e.target.checked)} />Show trails</label></>}
      </div>
      {demo.turning && <p className="person-hint">{TURNING_SCENARIOS.find(s => s.id === scenario)?.description}</p>}
      <div className="merchant-map-stages">{demo.stages.map(stage => <button key={stage} className="hud-action" aria-pressed={frame.stage === stage} onClick={() => jump(demo.starts[stage] ?? 0)}>{stage}</button>)}{demo.turning && <button className="hud-action" disabled={!firstContact} onClick={() => firstContact && jump(firstContact.time)}>{firstContact ? "First edge contact" : "Full route clear"}</button>}</div>
      <div className="merchant-map-timeline"><button className="hud-action" onClick={() => jump(0)}>Restart</button><input aria-label="Merchant journey progress" type="range" min={0} max={Math.floor(demo.duration/demo.step)} step={1} value={Math.round(frame.time/demo.step)} onChange={e => jump(Number(e.target.value)*demo.step)} /><label>Speed<select aria-label="Journey speed" value={rate} onChange={e => setRate(Number(e.target.value))}>{[1, 2, 4].map(n => <option key={n} value={n}>{n}×</option>)}</select></label></div>
    </div>
  </div>
}
