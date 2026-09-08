"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { Download, Pause, Play, RotateCcw, Upload, Volume2, VolumeX } from "lucide-react"
import { TRAVELER_TYPES, type TravelerTypeId } from "@/lib/game/travelers"
import { SPRITE_DIRECTIONS, spriteFrame, type CharacterAsset, type CharacterModel } from "@/lib/game/character-assets"
import { useCharacterAssetStore, validateCharacterAssets, type AssetTable } from "@/lib/game/character-asset-store"
import { playCharacterSound, stopCharacterSound } from "@/lib/game/character-audio"

const CharacterPreview = dynamic(() => import("./character-preview").then((m) => m.CharacterPreview), { ssr: false })
// Archived four-frame drafts; new callings live in the shared rig playground.
const TYPES = Object.values(TRAVELER_TYPES).filter(type => type.id !== "beggar")
const button = "inline-flex items-center justify-center gap-2 border border-rule px-3 py-2 text-xs text-ink transition hover:bg-parchment-dark focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-40"
const label = "font-display text-[10px] uppercase tracking-[2px] text-ink-light"

export function SpriteTile({ sheet, row = 0, frame = 1, zoom = 1, name }: {
  sheet: string; row?: number; frame?: number; zoom?: number; name: string
}) {
  return <span role="img" aria-label={name} className="inline-block shrink-0" style={{
    width: 64 * zoom, height: 64 * zoom, imageRendering: "pixelated",
    backgroundImage: `url("${sheet}")`, backgroundSize: `${256 * zoom}px ${512 * zoom}px`,
    backgroundPosition: `${-frame * 64 * zoom}px ${-row * 64 * zoom}px`,
  }} />
}

function downloadSettings(assets: AssetTable) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(assets, null, 2) + "\n"], { type: "application/json" }))
  const link = document.createElement("a")
  link.href = url; link.download = "character-settings.json"; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function checkFiles(asset: CharacterAsset) {
  const [picture, sound] = await Promise.all([fetch(asset.sheet), fetch(asset.sound)])
  if (!picture.ok || !sound.ok) throw new Error("The PNG or WAV could not be found. Import the files into public first.")
  const bitmap = await createImageBitmap(await picture.blob())
  const valid = bitmap.width === 256 && bitmap.height === 512
  bitmap.close()
  if (!valid) throw new Error("The sprite sheet must be 256 × 512 pixels. Run the sprite importer first.")
  const wav = new Uint8Array(await sound.arrayBuffer())
  const text = new TextDecoder()
  if (wav.length < 44 || text.decode(wav.slice(0, 4)) !== "RIFF" || text.decode(wav.slice(8, 12)) !== "WAVE") {
    throw new Error("The sound must be a valid WAV file.")
  }
}

export function CharacterLab() {
  const [id, setId] = useState<TravelerTypeId>("peasant")
  const [row, setRow] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [seconds, setSeconds] = useState(0)
  const [manualFrame, setManualFrame] = useState(1)
  const [zoom, setZoom] = useState(3)
  const [background, setBackground] = useState("checker")
  const [showRoad, setShowRoad] = useState(false)
  const [previewModel, setPreviewModel] = useState<CharacterModel>("callings")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const { assets, patch, reset, replace, muted, setMuted } = useCharacterAssetStore()
  const asset = assets[id]
  const type = TRAVELER_TYPES[id]
  const [sheetPath, setSheetPath] = useState(asset.sheet)
  const [soundPath, setSoundPath] = useState(asset.sound)
  const upload = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("character")
    if (requested && requested in TRAVELER_TYPES) setId(requested as TravelerTypeId)
  }, [])
  useEffect(() => { setSheetPath(asset.sheet); setSoundPath(asset.sound) }, [id, asset.sheet, asset.sound])
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => setSeconds((s) => s + 1 / 30), 1000 / 30)
    return () => clearInterval(timer)
  }, [playing])
  useEffect(() => () => stopCharacterSound(), [])
  const frame = playing ? spriteFrame(seconds, asset.fps) : manualFrame
  const choose = (next: TravelerTypeId) => { setId(next); setMessage(""); stopCharacterSound() }

  async function applyFiles() {
    setBusy(true); setMessage("")
    try {
      const next = validateCharacterAssets({ ...assets, [id]: { ...asset, sheet: sheetPath, sound: soundPath } })
      await checkFiles(next[id]); patch(id, next[id]); setMessage("Files applied. The game uses this version in this browser.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not apply files.") }
    finally { setBusy(false) }
  }

  async function importSettings(file: File) {
    setBusy(true); setMessage("")
    try {
      if (file.size > 100_000) throw new Error("Settings must be a JSON file smaller than 100 KB.")
      const next = validateCharacterAssets(JSON.parse(await file.text()))
      await Promise.all(Object.values(next).map(checkFiles))
      replace(next); setMessage("Settings imported for all seven characters.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not import settings.") }
    finally { setBusy(false) }
  }

  return <section className="w-full max-w-6xl border border-rule bg-parchment text-ink shadow-[0_0_0_3px_var(--parchment-dark),0_0_0_4px_var(--rule),4px_4px_24px_rgba(0,0,0,0.6)]" aria-label="Character sprite playground">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule px-6 py-5">
      <div><p className={label}>The road folk · Sprite workshop</p><h2 className="mt-1 font-display text-xl tracking-wide">Small figures. A living road.</h2></div>
      <div className="flex flex-wrap gap-2">
        <button className={button} onClick={() => downloadSettings(assets)}><Download size={14} /> Export settings</button>
        <button className={button} disabled={busy} onClick={() => upload.current?.click()}><Upload size={14} /> Import settings</button>
        <input ref={upload} type="file" accept="application/json,.json" className="hidden" aria-label="Import character settings" onChange={(e) => {
          const file = e.target.files?.[0]; if (file) void importSettings(file); e.target.value = ""
        }} />
      </div>
    </div>

    <div className="grid lg:grid-cols-[180px_minmax(0,1fr)_260px]">
      <nav aria-label="Choose a character" className="flex overflow-x-auto border-b border-rule lg:flex-col lg:border-r lg:border-b-0">
        {TYPES.map((t) => <button key={t.id} aria-pressed={id === t.id} onClick={() => choose(t.id)}
          className={`flex min-w-[135px] items-center gap-1 border-b border-rule/40 px-3 py-1 text-left transition hover:bg-parchment-dark ${id === t.id ? "bg-[#d9d0b8] shadow-[inset_3px_0_0_#94742f]" : ""}`}>
          <SpriteTile sheet={assets[t.id].sheet} frame={spriteFrame(seconds, assets[t.id].fps, playing)} name={t.label} />
          <span><span className="block font-display text-xs">{t.label}</span><span className="text-[11px] text-ink-light">32 frames</span></span>
        </button>)}
      </nav>

      <div className="min-w-0 p-5 md:p-6">
        <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg">{type.label}</h3><span className={label}>8 angles / 4 steps</span></div>
        <div className="relative flex h-72 items-center justify-center overflow-hidden border border-rule" style={{
          backgroundColor: background === "grass" ? "#586347" : background === "dark" ? "#191912" : "#c5c1b1",
          backgroundImage: background === "checker" ? "conic-gradient(#b6b3a5 25%, transparent 0 50%, #b6b3a5 0 75%, transparent 0)" : undefined,
          backgroundSize: "24px 24px",
        }}>
          {showRoad ? <CharacterPreview type={type} characterModel={previewModel} /> : <SpriteTile sheet={asset.sheet} row={row} frame={frame} zoom={zoom} name={`${type.label}, ${SPRITE_DIRECTIONS[row]}, frame ${frame + 1}`} />}
          <span className="absolute top-3 left-3 bg-[#191912]/80 px-2 py-1 font-mono text-[10px] text-[#eee7d6]">{showRoad ? "IN GAME · IDLE" : `${zoom}× · ${SPRITE_DIRECTIONS[row]} · ${frame + 1}/4`}</span>
          {!showRoad && <div className="absolute right-3 bottom-3 flex items-center bg-[#191912]/80 px-2 text-[#eee7d6]"><span className="font-mono text-[9px]">1×</span><SpriteTile sheet={asset.sheet} row={row} frame={frame} name="Native size preview" /></div>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className={button} onClick={() => { setManualFrame(frame); setPlaying(!playing) }} aria-label={playing ? "Pause animation" : "Play animation"}>{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? "Pause" : "Play"}</button>
          <label className="flex items-center gap-2 text-xs">Zoom<select aria-label="Preview zoom" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="border border-rule bg-transparent p-2">{[1, 2, 3, 4].map((v) => <option key={v} value={v}>{v}×</option>)}</select></label>
          <select aria-label="Preview background" value={background} onChange={(e) => setBackground(e.target.value)} className="border border-rule bg-transparent p-2 text-xs"><option value="checker">Transparency</option><option value="grass">Grass</option><option value="dark">Dark</option></select>
          <button className={button} aria-pressed={showRoad} onClick={() => setShowRoad(!showRoad)}>{showRoad ? "Sprite view" : "On the road"}</button>
          {showRoad && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={previewModel === "base"} onChange={(e) => setPreviewModel(e.target.checked ? "base" : "callings")} />Use base person</label>}
        </div>
        <p className={`${label} mt-6 mb-2`}>Facing · click to inspect</p>
        <div className="grid grid-cols-4 gap-1 xl:grid-cols-8">{SPRITE_DIRECTIONS.map((direction, i) => <button key={direction} onClick={() => { setRow(i); setShowRoad(false) }} aria-label={`Face ${direction}`} aria-pressed={row === i}
          className={`flex min-w-0 flex-col items-center border pb-2 text-[10px] ${row === i ? "border-gold bg-[#d9d0b8]" : "border-rule/40"}`}>
          <SpriteTile sheet={asset.sheet} row={i} frame={frame} name={`${direction} view`} zoom={0.75} />{direction}
        </button>)}</div>
        <p className={`${label} mt-5 mb-2`}>Walk cycle · click to freeze a step</p>
        <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((f) => <button key={f} onClick={() => { setManualFrame(f); setPlaying(false); setShowRoad(false) }} aria-label={`Inspect frame ${f + 1}`} aria-pressed={frame === f}
          className={`flex flex-col items-center border pb-2 text-[10px] ${frame === f ? "border-gold bg-[#d9d0b8]" : "border-rule/40"}`}>
          <SpriteTile sheet={asset.sheet} row={row} frame={f} name={`Step ${f + 1}`} />{["Left contact", "Passing", "Right contact", "Passing"][f]}
        </button>)}</div>
      </div>

      <aside className="border-t border-rule p-5 lg:border-t-0 lg:border-l">
        <p className={label}>Animation & scale</p>
        <label className="mt-4 block text-sm">Walk speed <span className="float-right font-mono text-xs">{asset.fps} fps</span><input className="mt-2 w-full accent-[#94742f]" type="range" min="1" max="16" value={asset.fps} onChange={(e) => patch(id, { fps: Number(e.target.value) })} /></label>
        <label className="mt-4 block text-sm">Size in game <span className="float-right font-mono text-xs">{asset.scale.toFixed(2)}</span><input className="mt-2 w-full accent-[#94742f]" type="range" min="0.3" max="1.5" step="0.01" value={asset.scale} onChange={(e) => patch(id, { scale: Number(e.target.value) })} /></label>
        <p className="mt-1 text-xs leading-relaxed text-ink-light">48px figures in 64px cells. Nearest-neighbour rendering keeps the pixels crisp.</p>
        <div className="my-6 border-t border-rule" />
        <p className={label}>Selection sound</p>
        <p className="mt-3 text-sm">{asset.soundLabel}</p>
        <div className="mt-3 flex gap-2"><button className={button} disabled={muted} onClick={async () => setMessage(await playCharacterSound(id) ? `Playing ${type.label.toLowerCase()} cue.` : "Sound could not play. Check the sound file and browser audio settings.")}><Volume2 size={14} /> Audition</button>
          <button className={button} aria-label={muted ? "Unmute character sounds" : "Mute character sounds"} aria-pressed={muted} onClick={() => { setMuted(!muted); stopCharacterSound() }}>{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button></div>
        <label className="mt-4 block text-sm">Volume <span className="float-right font-mono text-xs">{Math.round(asset.volume * 100)}%</span><input className="mt-2 w-full accent-[#94742f]" type="range" min="0" max="1" step="0.01" value={asset.volume} onChange={(e) => patch(id, { volume: Number(e.target.value) })} /></label>
        <a href={asset.sound} download className="mt-2 inline-block text-xs underline underline-offset-4">Download WAV</a>
        <div className="my-6 border-t border-rule" />
        <details><summary className="cursor-pointer text-sm">Manage asset files</summary><div className="mt-3 space-y-3">
          <label className="block text-xs">Sprite sheet path<input value={sheetPath} onChange={(e) => setSheetPath(e.target.value)} className="mt-1 w-full border border-rule bg-transparent p-2 text-xs" /></label>
          <label className="block text-xs">Selection sound path<input value={soundPath} onChange={(e) => setSoundPath(e.target.value)} className="mt-1 w-full border border-rule bg-transparent p-2 text-xs" /></label>
          <button className={button} disabled={busy} onClick={() => void applyFiles()}>{busy ? "Checking files…" : "Apply files"}</button>
          <p className="text-xs leading-relaxed text-ink-light">Use versioned PNG and WAV files from the asset pipeline. Local paths start with /textures or /sounds.</p>
        </div></details>
        <button className={`${button} mt-5`} onClick={() => { reset(id); const defaults = useCharacterAssetStore.getState().assets[id]; setSheetPath(defaults.sheet); setSoundPath(defaults.sound); setMessage(`${type.label} restored to project defaults.`) }}><RotateCcw size={13} /> Reset {type.label.toLowerCase()}</button>
        <p className="mt-4 text-xs leading-relaxed text-ink-light">Changes save in this browser and carry into Play. Export settings to share them or make them project defaults.</p>
      </aside>
    </div>
    <div role="status" aria-live="polite" className="border-t border-rule px-6 py-3 text-xs text-ink-light">{message || "Ready · Seven callings, 224 frames. Choose a character to begin."}</div>
    <div className="flex flex-wrap justify-between gap-3 border-t border-rule px-6 py-4 text-xs">
      <Link href="/assets/textures#characters" className="underline underline-offset-4">Browse sprite sheets & source art →</Link>
      <Link href={`/play?characters=${previewModel}`} className="underline underline-offset-4">Meet them on the road →</Link>
    </div>
  </section>
}
