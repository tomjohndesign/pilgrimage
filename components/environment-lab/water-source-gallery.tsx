"use client"

import { Suspense, useEffect, useState } from "react"
import { PreviewCanvas } from "@/components/preview-canvas"
import { PixelCharacters } from "@/components/pixel-canvas"
import { OutlinePass } from "@/components/game/outline-pass"
import { encodeObjectId, residentObjectId } from "@/lib/game/render/outline"
import { CharacterSprite } from "@/components/game/character-sprite"
import { WaterSources } from "@/components/game/water-sources"
import { useCameraStore } from "@/lib/game/camera-store"
import { selectElement } from "@/lib/game/selection"
import { monkVisual } from "@/lib/game/base-person/monk-assets"
import { WATER_SOURCE_ATLAS, WATER_SOURCE_DEFINITIONS, type WaterSourcePlacement } from "@/lib/game/water-sources/assets"

declare global { interface Window { __bakeWaterSources?: typeof import("@/lib/game/water-sources/bake").bakeWaterSources } }

const placements: WaterSourcePlacement[] = [
  { kind: "well", x: -1.45, y: .055, z: 0, yaw: 0 },
  { kind: "watering-hole", x: 1.3, y: .055, z: 0, yaw: 0 },
]

/** Water-source sprites in the game's shared camera, lighting and character scale. */
export function WaterSourceGallery() {
  const selection = useCameraStore(s => s.selection)
  const [view, setView] = useState(0), [overlap, setOverlap] = useState(false), [drinking, setDrinking] = useState(false)
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    window.__bakeWaterSources = async () => (await import("@/lib/game/water-sources/bake")).bakeWaterSources()
    return () => { delete window.__bakeWaterSources }
  }, [])
  const button = "border border-rule bg-parchment-dark px-3 py-2 font-display text-[10px] uppercase tracking-[2px] text-ink hover:border-gold"
  return <div className="border border-rule bg-parchment p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm italic text-ink-light">A timber-lined bucket well and a natural pool, with open access for drawing and dipping water.</p>
      <div className="flex gap-2">
        <button type="button" className={button} onClick={() => setView(v => (v + 1) % 4)}>Rotate</button>
        <button type="button" className={button} aria-pressed={drinking} onClick={() => setDrinking(v => !v)}>Show drinking</button>
        <button type="button" className={button} aria-pressed={overlap} onClick={() => setOverlap(v => !v)}>Check overlap</button>
      </div>
    </div>
    <div className="h-[360px] overflow-hidden border border-rule" role="img" aria-label="Timber-lined well and natural watering hole beside monks for scale">
      <PreviewCanvas zoom={75} view={view}>
        <mesh position={[0, -.04, 0]}><boxGeometry args={[6.5, .18, 3.5]} /><meshLambertMaterial color="#77864b" /></mesh>
        <WaterSources placements={placements} />
        <Suspense fallback={null}><PixelCharacters>{placements.map((p, index) => <group key={p.kind} position={[p.x + (drinking || overlap ? 0 : -.65), p.y, drinking ? WATER_SOURCE_DEFINITIONS[p.kind].access[0].stand[2] : overlap ? -1.03 : .95]} rotation={[0, drinking ? Math.PI : 0, 0]} userData={{ moving: false, activity: drinking ? p.kind === "well" ? "drinking" : "drinkingLow" : undefined, playbackRate: 1 }}>
          <CharacterSprite type="friar" name="monk" selected={selection?.kind === "monk" && selection.id === index} onClick={event => { selectElement({ kind: "monk", id: index }, event) }} outlineColor={encodeObjectId(residentObjectId(index))} characterModel="base" characterScale={1.5} visualOverride={monkVisual(30)} />
        </group>)}</PixelCharacters></Suspense>
        <OutlinePass objects={{ buildings: [], travelers: [], monks: [{ id: 0 }, { id: 1 }] }} />
      </PreviewCanvas>
    </div>
    <ul className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs italic text-ink-light">
      {Object.values(WATER_SOURCE_DEFINITIONS).map(def => <li key={def.label}>{def.label}</li>)}
      <li><a className="underline" href="/assets/characters?clip=drinking">Edit drinking rig</a></li>
      <li><a className="underline" href={WATER_SOURCE_ATLAS.color} download>Color sprite sheet</a></li>
      <li><a className="underline" href={WATER_SOURCE_ATLAS.depth} download>Depth sprite sheet</a></li>
    </ul>
    <p className="mt-4 text-center text-sm italic text-ink-light">Thirsty walkers and settlers take turns drinking for free, then return to their journey or work.</p>
  </div>
}
