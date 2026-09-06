"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { PixelCanvas, PixelCharacters } from "./pixel-canvas"
import { TerrainTiles } from "./game/terrain-tiles"
import { Trees } from "./game/trees"
import { CameraLight } from "./game/camera-light"
import { OutlinePass } from "./game/outline-pass"
import { TravelerFigure } from "./game/traveler-figure"
import { populationDesign } from "@/lib/game/base-person/population"
import { BASE_CHARACTER_SCALE, DEFAULT_WALK_CADENCE, personWalkStride } from "@/lib/game/base-person/gait"
import { TRAVELER_TYPES } from "@/lib/game/travelers"
import { CAM_FAR, CAM_NEAR, cameraOffset } from "@/lib/game/render/iso"
import { DEMO_STAGES, MERCHANT_DEMO_MAP, merchantDemo, type MerchantDemoFrame } from "@/lib/game/transport/demo"
import type { Cargo, HorseVariant, Puller } from "@/lib/game/transport/assets"

const PASSER_SPEED = personWalkStride(populationDesign(TRAVELER_TYPES.pilgrim, 1)) * BASE_CHARACTER_SCALE * DEFAULT_WALK_CADENCE
const CAMERA = { manual: true, near: CAM_NEAR, far: CAM_FAR, position: [20, 20, 20] as [number, number, number] }

function MapCamera({ row, zoom }: { row: number; zoom: number }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera, height = Math.max(7, 60 / zoom), aspect = size.width / size.height
    const fitted = Math.max(height, 12 / aspect)
    cam.left = -fitted * aspect / 2; cam.right = -cam.left; cam.top = fitted / 2; cam.bottom = -cam.top
    const offset = cameraOffset(row * Math.PI / 4)
    cam.position.set(offset[0], offset[1] - 0.2, offset[2]); cam.lookAt(0, -0.2, 0); cam.updateProjectionMatrix()
  }, [camera, size, row, zoom])
  return null
}

function DemoActors({ demo, clock, seek, playing, rate, onProgress, ...options }: {
  demo: ReturnType<typeof merchantDemo>; clock: { current: number }; seek: number; playing: boolean; rate: number
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
      group.position.set(current.x, 0.2, current.z); group.rotation.y = current.heading
      group.userData = { heading: current.heading, moving: current.moving, motionReset: reset, distance: reset || !playing ? 0 : Math.hypot(current.x - before.x, current.z - before.z), playbackRate: playing ? rate : 0 }
    }
    apply(merchant.current, frame.merchant, previous.merchant)
    Object.assign(merchant.current.userData, { keeperTime: frame.keeperTime, keeperAudience: true, cartPose: frame.cartPose, shopHeading: Math.PI / 2, shopSide: 1, activity: frame.activity, shopProgress: frame.shopProgress, pasture: frame.pasture, pastureY: 0.2, pastureGrass: true })
    apply(customer.current, frame.customer, previous.customer)
    // A passer-by makes the default person-to-tile scale visible throughout.
    const span = MERCHANT_DEMO_MAP.width + 1
    const x = ((clock.current * PASSER_SPEED + 2) % span) - span / 2, oldX = passer.current.position.x
    passer.current.position.set(x, 0.2, 2.25); passer.current.rotation.y = Math.PI / 2
    passer.current.userData = { heading: Math.PI / 2, moving: true, motionReset: reset || Math.abs(x - oldX) > 1, distance: !playing || reset || Math.abs(x - oldX) > 1 ? 0 : Math.abs(x - oldX), playbackRate: playing ? rate : 0 }
    report.current += delta
    if (report.current > 0.1 || reset) { report.current = 0; onProgress(frame) }
  }, -3)
  return <PixelCharacters>
    <group ref={merchant}><TravelerFigure {...options} type={TRAVELER_TYPES.vendor} characterModel="base" characterScale={BASE_CHARACTER_SCALE} appearance={{ variant: 0, scale: 1, bodyType: "Male" }} /></group>
    <group ref={customer}><TravelerFigure type={TRAVELER_TYPES.peasant} characterModel="base" characterScale={BASE_CHARACTER_SCALE} appearance={{ variant: 3, scale: 1, bodyType: "Female" }} /></group>
    <group ref={passer}><TravelerFigure type={TRAVELER_TYPES.pilgrim} characterModel="base" characterScale={BASE_CHARACTER_SCALE} appearance={{ variant: 1, scale: 1, bodyType: "Male" }} /></group>
  </PixelCharacters>
}

/** The real terrain, character render pass, scale and transport assembly, shown
 * as a short isolated journey within the existing character playground.
 */
export function MerchantMapPreview({ playing, row, zoom, ...options }: {
  playing: boolean; row: number; zoom: number; cargo: Cargo; puller: Puller; horseVariant: HorseVariant; coat: string
}) {
  const demo = useMemo(() => merchantDemo(options.puller, options.horseVariant), [options.puller, options.horseVariant])
  const clock = useRef(0), [seek, setSeek] = useState(0), [rate, setRate] = useState(1)
  const [frame, setFrame] = useState(demo.frames[0])
  useEffect(() => { clock.current = 0; setSeek(0); setFrame(demo.frames[0]) }, [demo])
  const jump = (time: number) => { clock.current = time; setSeek(time); setFrame(demo.frames[Math.min(demo.frames.length - 1, Math.floor(time / demo.step))]) }
  return <div className="merchant-map-preview" aria-label="Merchant journey on a small map">
    <div className="merchant-map-scene"><PixelCanvas orthographic camera={CAMERA}>
      <color attach="background" args={["#252b1c"]} /><ambientLight intensity={0.5} /><hemisphereLight args={["#bcd0f0", "#3a2a16", 0.45]} /><CameraLight />
      <MapCamera row={row} zoom={zoom} />
      <Suspense fallback={null}><TerrainTiles map={MERCHANT_DEMO_MAP} showGrid traffic={3} /><Trees map={MERCHANT_DEMO_MAP} />
        <DemoActors key={`${options.puller}:${options.horseVariant}`} {...options} demo={demo} clock={clock} seek={seek} playing={playing} rate={rate} onProgress={setFrame} />
      </Suspense><OutlinePass />
    </PixelCanvas></div>
    <div className="merchant-map-caption"><span role="status">{frame.stage}{frame.stage === "Selling" ? frame.sales ? " · Customer served" : " · Customer approaching and browsing" : frame.stage === "Closing" && frame.shopProgress === 0 && frame.pasture && !frame.pasture.ready ? " · Waiting for the animal" : ""}</span><span>Game scale · 1 tile grid</span></div>
    <div className="merchant-map-controls hud-well">
      <div className="merchant-map-stages">{DEMO_STAGES.map(stage => <button key={stage} className="hud-action" aria-pressed={frame.stage === stage} onClick={() => jump(demo.starts[stage])}>{stage}</button>)}</div>
      <div className="merchant-map-timeline"><button className="hud-action" onClick={() => jump(0)}>Restart</button><input aria-label="Merchant journey progress" type="range" min={0} max={demo.duration} step={demo.step} value={frame.time} onChange={e => jump(Number(e.target.value))} /><label>Speed<select aria-label="Journey speed" value={rate} onChange={e => setRate(Number(e.target.value))}>{[1, 2, 4].map(n => <option key={n} value={n}>{n}×</option>)}</select></label></div>
    </div>
  </div>
}
