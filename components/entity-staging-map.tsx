"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { PixelCanvas } from "./pixel-canvas"
import { PreviewNavigation } from "./preview-navigation"
import { TerrainTiles } from "./game/terrain-tiles"
import { BuildingModel } from "./building-lab/building-model"
import { characterSprite, type CharacterSpriteFrames } from "./character-row-sprite"
import { ChromeButton, type SelectOption } from "./ui/chrome-controls"
import { earlyBuildingRecipe, type EarlyBuildingType } from "@/lib/game/building-art/style"
import { TERRAIN, TILE_HEIGHT } from "@/lib/game/map/terrain"
import type { GameMap } from "@/lib/game/map/types"
import { yawForView, lightOffsetForYaw } from "@/lib/game/render/iso"
import { SURFACE_LIGHT } from "@/lib/game/render/lighting"
import type { BaseClip } from "@/lib/game/base-person/pose"

type Placed = { item: SelectOption; x: number; z: number }
const CLIPS: BaseClip[] = ["walk", "wearyWalk", "praying", "sitting", "preaching"]
function StagedPerson({ id, active }: { id: string; active: boolean }) {
  const [clip] = useState(() => CLIPS[Math.floor(Math.random() * CLIPS.length)])
  const [phase] = useState(() => Math.random() * 10)
  const [frames, setFrames] = useState<CharacterSpriteFrames | null>(null)
  const frame = useRef(-1), reduced = useRef(false)
  const sprite = useRef<THREE.Sprite>(null), point = useMemo(() => new THREE.Vector3(), [])
  useEffect(() => { const query = matchMedia("(prefers-reduced-motion: reduce)"); const update = () => { reduced.current = query.matches }; update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update) }, [])
  useEffect(() => {
    let cancelled = false
    characterSprite(id, undefined, clip).then(result => { if (!cancelled) setFrames(result) }).catch(error => console.warn(`Staging sprite ${id}:`, error))
    return () => { cancelled = true }
  }, [id, clip])
  const texture = useMemo(() => {
    if (!frames) return null
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = frames.size
    canvas.getContext("2d")!.drawImage(frames.idle, 0, 0)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false
    frame.current = -1
    return texture
  }, [frames])
  useEffect(() => () => texture?.dispose(), [texture])
  useFrame(({ clock, camera }) => {
    if (!frames || !texture || !sprite.current) return
    sprite.current.getWorldPosition(point); point.project(camera)
    if (Math.abs(point.x) > 1.1 || Math.abs(point.y) > 1.1) return
    const playing = active && !document.hidden && !reduced.current
    const next = playing ? Math.floor((clock.elapsedTime + phase) * frames.fps) % frames.frames : -1
    if (next === frame.current) return
    const ctx = (texture.image as HTMLCanvasElement).getContext("2d")!
    ctx.clearRect(0, 0, frames.size, frames.size)
    ctx.drawImage(playing ? frames.walk : frames.idle, Math.max(0, next) * frames.size, 0, frames.size, frames.size, 0, 0, frames.size, frames.size)
    texture.needsUpdate = true; frame.current = next
  })
  if (!frames || !texture) return null
  return <sprite ref={sprite} name={id} scale={[frames.worldSize, frames.worldSize, 1]} center={new THREE.Vector2(...frames.center)} userData={{ sequence: clip }}>
    <spriteMaterial map={texture} transparent alphaTest={.1} toneMapped={false} />
  </sprite>
}
function StagedBuilding({ id }: { id: string }) {
  const recipe = useMemo(() => earlyBuildingRecipe(id as EarlyBuildingType), [id])
  return <BuildingModel recipe={recipe} />
}
function StageCamera({ map, placed, labels }: { map: GameMap; placed: Placed[]; labels: React.RefObject<Map<string, HTMLButtonElement>> }) {
  const { camera, size } = useThree()
  const point = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    for (const { item, x, z } of placed) {
      const label = labels.current.get(item.value); if (!label) continue
      point.set(x, TILE_HEIGHT, z).project(camera)
      label.style.left = `${(point.x + 1) * 50}%`; label.style.top = `${(1 - point.y) * 50}%`
      label.style.visibility = Math.abs(point.x) > .96 || Math.abs(point.y) > .96 ? "hidden" : "visible"
    }
  })
  const aspect = size.width / Math.max(1, size.height)
  return <PreviewNavigation height={Math.max((map.width + map.depth) * .46 + 6, (map.width + map.depth) * .78 / aspect)} resetKey={map} />
}

/** Real game assets on one blank, gridded isometric map at their world scale.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/BA2-0
 */
export function EntityStagingMap({ kind, items, active, onSelect }: { kind: "characters" | "buildings"; items: SelectOption[]; active: boolean; onSelect: (item: SelectOption) => void }) {
  const labels = useRef(new Map<string, HTMLButtonElement>())
  const [hovered, setHovered] = useState<string | null>(null)
  const key = items.map(item => item.value).join("|")
  const layout = useMemo(() => {
    const columns = Math.max(1, Math.ceil(Math.sqrt(items.length))), rows = Math.max(1, Math.ceil(items.length / columns)), gap = kind === "buildings" ? 9 : 3
    const width = columns * gap + 4, depth = rows * gap + 4
    const map: GameMap = { width, depth, seed: 42, buildings: [], tiles: Array(width * depth).fill("grass") }
    return { map, placed: items.map((item, index) => ({ item, x: (index % columns - (columns - 1) / 2) * gap, z: (Math.floor(index / columns) - (rows - 1) / 2) * gap })) }
  // Labels/options are reconstructed by EntitySelect. Only identity/filter changes rebuild the map.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind])
  return <div className="chrome-staging-map" aria-label={`All ${kind} on an isometric staging map`}>
    <PixelCanvas orthographic camera={{ manual: true, near: .1, far: 400 }} frameloop={active ? "always" : "never"}>
      <color attach="background" args={[TERRAIN.grass.color]} />
      <ambientLight intensity={SURFACE_LIGHT.ambient} /><hemisphereLight args={[SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere]} />
      <directionalLight intensity={SURFACE_LIGHT.sun} position={lightOffsetForYaw(yawForView(0))} />
      <StageCamera map={layout.map} placed={layout.placed} labels={labels} />
      <Suspense fallback={null}><TerrainTiles map={layout.map} showGrid vegetation={false} traffic={0} />
        {layout.placed.map(({ item, x, z }) => <group key={item.value} position={[x, TILE_HEIGHT, z]}
          onPointerOver={event => { event.stopPropagation(); setHovered(item.value) }} onPointerOut={() => setHovered(null)}
          onClick={event => { if (event.delta > 6 || item.disabled) return; event.stopPropagation(); onSelect(item) }}>
          {kind === "buildings" ? <StagedBuilding id={item.value} /> : <StagedPerson id={item.value} active={active} />}
        </group>)}
      </Suspense>
    </PixelCanvas>
    <div className="chrome-staging-labels">{layout.placed.map(({ item, x, z }) => <ChromeButton key={item.value} ref={element => { if (element) labels.current.set(item.value, element); else labels.current.delete(item.value) }}
      className="chrome-staging-label" data-hovered={hovered === item.value || undefined} data-world-x={x} data-world-z={z}
      aria-label={`Open ${item.label}`} disabled={item.disabled} onClick={() => onSelect(item)}><span>{item.label}</span></ChromeButton>)}</div>
  </div>
}
