"use client"

import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react"
import { useFrame, useLoader } from "@react-three/fiber"
import * as THREE from "three"
import { PixelCanvas, PixelCharacters, usePixelSceneryDepth, usePixelWorldTexel } from "../pixel-canvas"
import { PreviewNavigation } from "../preview-navigation"
import { TerrainTiles } from "../game/terrain-tiles"
import { ChromeButton } from "../ui/chrome-controls"
import { characterOverlapBounds } from "@/lib/game/render/character-overlap"
import { registerCharacterBatchEntry, type CharacterBatchEntry } from "@/lib/game/render/character-batch"
import { overlapBiases } from "@/lib/game/render/overlap-order"
import { applySpriteDepth, configureSpriteDepthTexture } from "@/lib/game/render/sprite-depth"
import { spriteTexelRaycast, prepareSpritePicking } from "@/lib/game/render/sprite-picking"
import { spriteRow } from "@/lib/game/character-assets"
import { lightOffsetForYaw, yawForView } from "@/lib/game/render/iso"
import { SURFACE_LIGHT } from "@/lib/game/render/lighting"
import { TERRAIN, TILE_HEIGHT } from "@/lib/game/map/terrain"
import type { GameMap } from "@/lib/game/map/types"
import type { ExperimentActor, OverlapExperiment } from "@/lib/game/overlap-experiments"
import { experimentSortAnchor } from "@/lib/game/overlap-experiments"
import { experimentRoadSegments } from "@/lib/game/overlap-experiment-paths"
import { CartReins } from "../game/cart-reins"
import { BASE_CHARACTER_SCALE } from "@/lib/game/base-person/gait"

const map: GameMap = { width: 22, depth: 22, seed: 42, buildings: [], tiles: Array(22 * 22).fill("grass") }
type Entries = Map<string, CharacterBatchEntry>
type Groups = Map<string, THREE.Group>

function Figure({ actor, index, view, solid, entries, groups, onSelect }: {
  actor: ExperimentActor; index: number; view: number; solid: boolean; entries: Entries; groups: Groups; onSelect: (id: string) => void
}) {
  const sources = useLoader(THREE.TextureLoader, [actor.sprite.url, actor.sprite.depth])
  const viewport = useMemo(() => new THREE.Vector4(), [])
  const ground = useMemo(() => ({ value: new THREE.Vector4() }), [])
  const depthBias = useMemo(() => ({ value: 0 }), [])
  const worldTexel = usePixelWorldTexel(), scenery = usePixelSceneryDepth()
  const source = sources[0], depthSource = sources[1]
  const texture = useMemo(() => {
    const texture = source.clone()
    texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.generateMipmaps = false
    return texture
  }, [source])
  const depth = useMemo(() => ({ map: { value: configureSpriteDepthTexture(depthSource) }, enabled: { value: true } }), [depthSource])
  const uniforms = useMemo(() => ({ solid: { value: true }, color: { value: new THREE.Color() } }), [])
  uniforms.solid.value = solid; uniforms.color.value.set(actor.color)
  const material = useMemo(() => {
    const material = new THREE.SpriteMaterial({ map: texture, transparent: false, alphaTest: .5, toneMapped: false })
    material.onBeforeCompile = shader => {
      applySpriteDepth(shader, viewport, worldTexel, ground, depth, undefined, depthBias, scenery)
      shader.uniforms.experimentSolid = uniforms.solid; shader.uniforms.experimentColor = uniforms.color
      shader.fragmentShader = "uniform bool experimentSolid;\nuniform vec3 experimentColor;\n" + shader.fragmentShader.replace(
        "#include <alphatest_fragment>", "#include <alphatest_fragment>\nif (experimentSolid) diffuseColor.rgb = experimentColor;")
    }
    material.onBeforeRender = renderer => { renderer.getCurrentViewport(viewport) }
    material.customProgramCacheKey = () => "overlap-experiment-v1"
    return material
  }, [texture, viewport, worldTexel, ground, depth, depthBias, scenery, uniforms])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => texture.dispose(), [texture])
  useEffect(() => prepareSpritePicking([texture]), [texture])
  const sprite = useRef<THREE.Sprite>(null)
  const group = useRef<THREE.Group>(null)
  const size = actor.sprite.worldSize * actor.scale
  const row = actor.sprite.rowOffset + spriteRow(actor.heading * Math.PI / 180, yawForView(view), actor.sprite.directions)
  texture.repeat.set(1 / actor.sprite.columns, 1 / actor.sprite.rows)
  texture.offset.set((actor.sprite.start + actor.frame) / actor.sprite.columns, (actor.sprite.rows - 1 - row) / actor.sprite.rows)
  useLayoutEffect(() => {
    const body = sprite.current!
    // Floating tests have no ground plane; their pose depth must remain intact.
    ground.value.set(0, 0, 0, 0)
    const direction = row - actor.sprite.rowOffset
    Object.assign(body.userData, { heading: actor.heading * Math.PI / 180, row: direction, direction,
      clip: actor.clip, displayedFrame: actor.frame, walkPhase: actor.frame / actor.sprite.frames, moving: actor.clip !== "idle" })
    Object.assign(group.current!.userData, { heading: actor.heading * Math.PI / 180, riding: true, activity: "walking" })
    const entry: CharacterBatchEntry = { sprite: body, ids: body, overlapAnchor: group.current!, ground, depth, depthBias,
      id: new THREE.Vector3((actor.sortId ?? index + 1) / 255, 0, 0), railPart: actor.sprite.railPart,
      railSeat: experimentSortAnchor(actor) }
    entries.set(actor.id, entry); groups.set(actor.id, group.current!)
    const unregister = registerCharacterBatchEntry(entry)
    return () => { unregister(); entries.delete(actor.id); groups.delete(actor.id) }
  }, [actor, row, entries, groups, index, ground, depth, depthBias])
  const name = actor.kind === "packHandler" ? "traveler" : actor.kind === "cartDriver" ? "passenger" : actor.kind.toLowerCase().includes("cart") ? "cart"
    : actor.kind.toLowerCase().includes("donkey") ? "donkey" : actor.kind.toLowerCase().includes("horse") ? "horse" : actor.kind.toLowerCase().includes("ox") ? "ox" : "traveler"
  return <group ref={group} position={[actor.x, TILE_HEIGHT + actor.elevation, actor.z]}><sprite ref={sprite} name={name} material={material}
    scale={[size, size, 1]} center={new THREE.Vector2(...actor.sprite.center)} renderOrder={index + 1} raycast={spriteTexelRaycast}
    onClick={event => { if (event.delta > 6) return; event.stopPropagation(); onSelect(actor.id) }} /></group>
}

function Connection({ scene, connection, groups }: { scene: OverlapExperiment; connection: OverlapExperiment["connections"][number]; groups: Groups }) {
  const source = scene.actors.find(a => a.id === connection.source)!, animal = scene.actors.find(a => a.id === connection.animal)!
  const cartRef = useMemo(() => ({ get current() { return groups.get(connection.source) ?? null } }), [groups, connection.source])
  const animalRef = useMemo(() => ({ get current() { return groups.get(connection.animal) ?? null } }), [groups, connection.animal])
  const kind = animal.kind.toLowerCase().includes("donkey") ? "donkey" : animal.kind.toLowerCase().includes("ox") ? "ox" : "horse"
  return <CartReins cart={cartRef} animal={animalRef} kind={kind} horseVariant="common" characterScale={BASE_CHARACTER_SCALE * animal.scale}
    draft={connection.kind === "cart"} driver={() => groups.get(connection.driver ?? "")}
    handler={connection.kind === "lead" ? { calling: "peasant", variant: source.variant } : undefined} selected={false} />
}

function Ordering({ scene, manual, entries, labels, onReady }: {
  scene: OverlapExperiment; manual: boolean; entries: Entries; labels: React.RefObject<Map<string, HTMLButtonElement>>; onReady: () => void
}) {
  const point = useMemo(() => new THREE.Vector3(), []), ready = useRef(false)
  const worldTexel = usePixelWorldTexel()
  useFrame(({ camera }) => {
    const present = scene.actors.flatMap(actor => { const entry = entries.get(actor.id); return entry ? [{ actor, entry }] : [] })
    const actors = present.map(item => item.entry)
    const bounds = actors.map(entry => { entry.sprite.updateWorldMatrix(true, false); return characterOverlapBounds(entry, camera, worldTexel.value) })
    const biases = overlapBiases(manual ? bounds.map((bound, i) => ({ ...bound, distance: scene.actors.length - scene.manualOrder.indexOf(present[i].actor.id) })) : bounds)
    actors.forEach((entry, i) => { entry.depthBias!.value = biases[i] })
    if (!ready.current && entries.size === scene.actors.length) { ready.current = true; onReady() }
    scene.actors.forEach((actor, index) => {
      const label = labels.current.get(actor.id)
      if (!label) return
      point.set(actor.x, TILE_HEIGHT + actor.elevation, actor.z).project(camera)
      label.style.left = `${(point.x + 1) * 50}%`; label.style.top = `${(1 - point.y) * 50}%`
      // Offset repeated ground anchors, while retaining an explicit number/color key.
      const coincident = scene.actors.slice(0, index).filter(a => Math.hypot(a.x - actor.x, a.z - actor.z) < .08).length
      label.style.marginTop = `${coincident * 22}px`
      label.style.visibility = Math.abs(point.x) > .98 || Math.abs(point.y) > .98 ? "hidden" : "visible"
    })
  }, -1)
  return null
}

class SceneError extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" }
  static getDerivedStateFromError(error: Error) { return { error: error.message } }
  render() { return this.state.error ? <p role="alert" className="p-6">Could not load this scene: {this.state.error}</p> : this.props.children }
}

/** Frozen game poses on the shared staging map; manual order uses the same measured depth ranges. */
export function OverlapScene({ scene, manual, solid, selected, showLabels, active, onSelect, onReady }: {
  scene: OverlapExperiment; manual: boolean; solid: boolean; selected: string; showLabels: boolean; active: boolean;
  onSelect: (id: string) => void; onReady: () => void
}) {
  const entries = useMemo<Entries>(() => new Map(), [])
  const groups = useMemo<Groups>(() => new Map(), [])
  const labels = useRef(new Map<string, HTMLButtonElement>())
  const roads = useMemo(() => experimentRoadSegments(map, scene.paths), [scene.paths])
  return <div className="chrome-staging-map" aria-label="Character overlap experiment">
    <SceneError key={scene.actors.map(a => a.sprite.url).join("|")}><PixelCanvas orthographic camera={{ manual: true, near: .1, far: 400 }} frameloop={active ? "always" : "never"}>
      <color attach="background" args={[TERRAIN.grass.color]} />
      <ambientLight intensity={SURFACE_LIGHT.ambient} /><hemisphereLight args={[SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere]} />
      <directionalLight intensity={SURFACE_LIGHT.sun} position={lightOffsetForYaw(yawForView(scene.view))} />
      <PreviewNavigation height={scene.paths?.length || scene.scenario === "packTrain" ? 7 : 5} view={scene.view} target={[0, .5, 0]} resetKey={scene.id} />
      <Suspense fallback={null}><TerrainTiles map={map} showGrid vegetation={false} traffic={scene.paths?.length ? 30 : 0} traveledRoads={roads} />
        <PixelCharacters>{scene.actors.map((actor, index) => <Figure key={actor.id} actor={actor} index={index} view={scene.view} solid={solid} entries={entries} groups={groups} onSelect={onSelect} />)}
          {(scene.connections ?? []).map(connection => <Connection key={`${connection.source}-${connection.animal}`} scene={scene} connection={connection} groups={groups} />)}
        </PixelCharacters>
        <Ordering key={scene.id + scene.actors.map(a => a.sprite.url).join("|")} scene={scene} manual={manual} entries={entries} labels={labels} onReady={onReady} />
      </Suspense>
    </PixelCanvas></SceneError>
    {showLabels && <div className="chrome-staging-labels">{scene.actors.map((actor, i) => <ChromeButton key={actor.id}
      ref={element => { if (element) labels.current.set(actor.id, element); else labels.current.delete(actor.id) }}
      className="chrome-staging-label" data-persistent data-hovered={selected === actor.id || undefined} aria-pressed={selected === actor.id} aria-label={`Select ${actor.label}`}
      onClick={() => onSelect(actor.id)}><span style={{ borderBottom: `3px solid ${actor.color}`, fontWeight: selected === actor.id ? 700 : 400 }}>{i + 1}</span></ChromeButton>)}</div>}
  </div>
}
