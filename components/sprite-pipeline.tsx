"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import * as THREE from "three"
import { DEFAULT_DESIGN, PALETTE_TONES, PERSON_PRESETS, personRecipe, type PersonDesign } from "@/lib/game/base-person/design"
import { usePersonDesignStore } from "@/lib/game/base-person/design-store"
import { personFrameRenderer } from "@/lib/game/base-person/bake"
import { inspectRig } from "@/lib/game/base-person/rig-inspection"
import { RIG_BONES } from "@/lib/game/base-person/rig-joints"
import { PERSON_CLIPS, type BaseClip } from "@/lib/game/base-person/pose"

const card = "border border-rule bg-parchment p-5 shadow-[0_0_0_3px_var(--parchment-dark),0_0_0_4px_var(--rule),4px_4px_24px_rgba(0,0,0,0.6)]"
const kicker = "font-display text-[9px] uppercase tracking-[2px] text-gold"
const heading = "font-display text-base font-semibold uppercase tracking-[3px] text-ink"
const prose = "mt-2 text-[13px] leading-relaxed text-ink-light"
const control = "border border-rule bg-transparent p-2 text-xs text-ink"
/** The playground's own preview backdrops: transparency, night and bare ground. */
const BACKDROPS = {
  checker: {
    backgroundColor: "#c5c1b1",
    backgroundImage: "conic-gradient(#b6b3a5 25%, transparent 0 50%, #b6b3a5 0 75%, transparent 0)",
    backgroundSize: "24px 24px",
  },
  dark: { backgroundColor: "#191912" },
  ground: { backgroundColor: "#cdbb9a" },
} as const

/** The primitives the rig is assembled from, coloured by geometry so the parts list reads at a glance. */
const GEOMETRY_COLORS: Record<string, string> = {
  LatheGeometry: "#c8791f", CylinderGeometry: "#2f6f96", SphereGeometry: "#a33a54",
  BoxGeometry: "#4c7f36", ExtrudeGeometry: "#6f4a97", TubeGeometry: "#a08a1c",
  TorusGeometry: "#2c8676", ShapeGeometry: "#b45a25", ConeGeometry: "#8a4433",
  PlaneGeometry: "#5c6470", BufferGeometry: "#6b6257",
}
/** `inkPart` ids, in the priority order the ink pass ranks them. */
const PART_COLORS: Record<number, string> = {
  1: "#d8a45e", 2: "#7a4a2c", 3: "#4b7791", 5: "#6a4a2f", 6: "#5f9c4d",
  7: "#3d7530", 8: "#c05a70", 9: "#7d3348", 10: "#e0cd8c", 11: "#b08a54",
}
const SCALE = 6

interface Shot { url: string; width: number; height: number; display: number }
interface Legend { color: string; label: string }
interface Stages {
  cellSize: number
  palette: { color: string; tone: number }[]
  primitives: Shot; wireframe: Shot; geometry: Legend[]; meshes: number
  rig: Shot; sides: Shot
  shaded: Shot; sprite: Shot; padding: number
  mask: Shot; decoded: Shot; parts: Legend[]
  depth: Shot | null; shadow: Shot | null
  directions: Shot; sheet: Shot
}

const shot = (canvas: HTMLCanvasElement, display = canvas.width): Shot =>
  ({ url: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, display })

function blank(width: number, height: number) {
  const canvas = document.createElement("canvas")
  canvas.width = width; canvas.height = height
  return canvas
}
function copy(source: HTMLCanvasElement) {
  const out = blank(source.width, source.height)
  out.getContext("2d")!.drawImage(source, 0, 0)
  return out
}
function shown(object: THREE.Object3D) {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (!node.visible) return false
  return true
}
function planesOf(material: THREE.Material | THREE.Material[]) {
  return (Array.isArray(material) ? material[0] : material).clippingPlanes ?? null
}

/** Every stage comes from the shipped bake session, so nothing here can drift from the exported sheets. */
function buildStages(design: PersonDesign, clip: BaseClip, row: number, frame: number): Stages {
  const recipe = personRecipe(design)
  const size = recipe.cellSize, frames = PERSON_CLIPS[clip].frames, phase = frame / frames
  const session = personFrameRenderer(design)
  const large = personFrameRenderer(design, [], { cellSize: size * SCALE, viewSize: recipe.camera.viewSize,
    anchor: [recipe.anchor[0] * SCALE, recipe.anchor[1] * SCALE] })
  const temporary: THREE.Material[] = []
  try {
    // Geometry passes borrow the diagnostic path: posed and lit as usual, but never inked or quantized.
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
    const counts = new Map<string, number>()
    const materials = new Map<string, THREE.MeshBasicMaterial>()
    const restore = () => { for (const [mesh, material] of swapped) mesh.material = material; swapped.length = 0 }
    const primitives = copy(large.render(clip, phase, row, true, rig => {
      rig.trackSides(false)
      rig.root.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !shown(object)) return
        const type = object.geometry.type
        counts.set(type, (counts.get(type) ?? 0) + 1)
        const key = `${type}:${planesOf(object.material) ? "clipped" : "full"}`
        if (!materials.has(key)) {
          const material = new THREE.MeshBasicMaterial({ color: GEOMETRY_COLORS[type] ?? "#6b6257", clippingPlanes: planesOf(object.material) })
          materials.set(key, material); temporary.push(material)
        }
        swapped.push([object, object.material])
        object.material = materials.get(key)!
      })
    }).canvas)
    restore()
    const wire = new Map<string, THREE.MeshBasicMaterial>()
    const wireframe = copy(large.render(clip, phase, row, true, rig => {
      rig.trackSides(false)
      rig.root.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !shown(object)) return
        const key = planesOf(object.material) ? "clipped" : "full"
        if (!wire.has(key)) {
          const material = new THREE.MeshBasicMaterial({ color: "#2f6f96", wireframe: true, clippingPlanes: planesOf(object.material) })
          wire.set(key, material); temporary.push(material)
        }
        swapped.push([object, object.material])
        object.material = wire.get(key)!
      })
    }).canvas)
    restore()
    const shaded = copy(session.render(clip, phase, row, true, rig => rig.trackSides(false)).canvas)
    const sides = copy(session.render(clip, phase, row, true).canvas)
    const mask = copy(session.render(clip, phase, row, true, rig => { rig.trackSides(false); rig.inkMask(true) }).canvas)
    session.rig.inkMask(false)

    const rendered = session.render(clip, phase, row, false)
    const sprite = copy(rendered.canvas)
    const depth = rendered.depth ? copy(rendered.depth) : null
    const shadow = rendered.shadow ? copy(rendered.shadow) : null

    // Part ids run 1–11 out of 255: readable as data, invisible as an image.
    const raw = mask.getContext("2d")!.getImageData(0, 0, size, size)
    const decoded = blank(size, size)
    const image = decoded.getContext("2d")!.createImageData(size, size)
    const seen = new Map<number, number>()
    for (let i = 0; i < raw.data.length; i += 4) {
      if (raw.data[i + 3] < 128) continue
      const id = raw.data[i], tone = raw.data[i + 1]
      seen.set(id, (seen.get(id) ?? 0) + 1)
      const hex = PART_COLORS[id] ?? "#6b6257"
      const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16))
      // Reserved tones sit a step apart from the shared parts sharing their id.
      const tinted = channels.map(value => Math.min(255, value * (tone === PALETTE_TONES.skin ? 1.25 : tone === PALETTE_TONES.hair ? 0.7 : 1)))
      image.data.set([...tinted, 255], i)
    }
    decoded.getContext("2d")!.putImageData(image, 0, 0)

    const overlay = blank(size * SCALE, size * SCALE)
    const context = overlay.getContext("2d")!
    context.imageSmoothingEnabled = false
    context.globalAlpha = 0.3
    context.drawImage(sprite, 0, 0, overlay.width, overlay.height)
    context.globalAlpha = 1
    const joints = inspectRig(design, clip, frame, row)
    // A pale backing keeps every bone legible over both light cloth and dark ink.
    for (const [width, stroke] of [[6, "#f6efdd"], [3, "#8a2f1e"]] as const) {
      context.lineWidth = width
      context.strokeStyle = stroke
      for (const [from, to] of RIG_BONES) {
        const a = joints[from], b = joints[to]
        if (!a || !b) continue
        context.beginPath()
        context.moveTo(a.screen[0] * SCALE, a.screen[1] * SCALE)
        context.lineTo(b.screen[0] * SCALE, b.screen[1] * SCALE)
        context.stroke()
      }
    }
    for (const joint of Object.values(joints)) {
      context.beginPath()
      context.arc(joint.screen[0] * SCALE, joint.screen[1] * SCALE, joint.editable ? 6 : 4, 0, Math.PI * 2)
      context.fillStyle = joint.editable ? "#1f6f8b" : "#5b5346"
      context.strokeStyle = "#f6efdd"
      context.lineWidth = 2
      context.fill(); context.stroke()
    }

    const directions = blank(size * 8, size)
    const directionContext = directions.getContext("2d")!
    for (let index = 0; index < 8; index++) directionContext.drawImage(session.render(clip, phase, index, false).canvas, index * size, 0)
    const sheet = blank(size * frames, size)
    const sheetContext = sheet.getContext("2d")!
    for (let index = 0; index < frames; index++) sheetContext.drawImage(session.render(clip, index / frames, row, false).canvas, index * size, 0)

    return {
      cellSize: size,
      palette: recipe.renderPalette.map((color, index) => ({ color, tone: recipe.paletteTones[index] })),
      primitives: shot(primitives), wireframe: shot(wireframe), meshes: [...counts.values()].reduce((sum, n) => sum + n, 0),
      geometry: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([type, n]) =>
        ({ color: GEOMETRY_COLORS[type] ?? "#6b6257", label: `${n}× ${type.replace("Geometry", "")}` })),
      rig: shot(overlay), sides: shot(sides, size * SCALE),
      shaded: shot(shaded, size * SCALE), sprite: shot(sprite, size * SCALE), padding: rendered.padding,
      mask: shot(mask, size * SCALE), decoded: shot(decoded, size * SCALE),
      parts: [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([id, n]) =>
        ({ color: PART_COLORS[id] ?? "#6b6257", label: `id ${id} · ${n}px` })),
      depth: depth && shot(depth, size * SCALE), shadow: shadow && shot(shadow, size * SCALE),
      directions: shot(directions, size * 8 * 2), sheet: shot(sheet),
    }
  } finally {
    for (const material of temporary) material.dispose()
    large.dispose(); session.dispose()
  }
}

function Frame({ image, name, tone = "checker" }: { image: Shot; name: string; tone?: keyof typeof BACKDROPS }) {
  return <span className="inline-flex border border-rule p-2" style={BACKDROPS[tone]}>
    <img src={image.url} alt={name} width={image.width} height={image.height}
      style={{ width: image.display, height: image.display * image.height / image.width, imageRendering: "pixelated" }} />
  </span>
}

function Stage({ number, title, children, note, legend, footnote }: {
  number: string; title: string; note: ReactNode; legend?: Legend[]; footnote?: ReactNode; children: ReactNode
}) {
  return <article className={card}>
    <p className={kicker}>Stage {number}</p>
    <h2 className={`${heading} mt-1`}>{title}</h2>
    <p className={prose}>{note}</p>
    <div className="mt-4 flex flex-wrap items-center gap-4">{children}</div>
    {legend && <Legend items={legend} />}
    {footnote && <p className={prose}>{footnote}</p>}
  </article>
}

function Legend({ items }: { items: Legend[] }) {
  return <ul className="mt-4 flex list-none flex-wrap gap-x-4 gap-y-1 border-t border-rule p-0 pt-3 text-[11px] text-ink-light">
    {items.map(item => <li key={item.label} className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 border border-rule" style={{ background: item.color }} />{item.label}
    </li>)}
  </ul>
}

/**
 * One figure carried through every stage of the sprite bake, rendered live by the
 * same modules the exporter uses: rig, camera, lighting, ink, depth and shadow.
 */
export function SpritePipeline() {
  const saved = usePersonDesignStore(state => state.design)
  const [preset, setPreset] = useState("Traveler")
  const [clip, setClip] = useState<BaseClip>("walk")
  const [row, setRow] = useState(7)
  const [frame, setFrame] = useState(5)
  const [stages, setStages] = useState<Stages | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { void usePersonDesignStore.getState().hydrate() }, [])
  const design = useMemo(() => preset === "saved" ? saved ?? DEFAULT_DESIGN : PERSON_PRESETS[preset] ?? DEFAULT_DESIGN, [preset, saved])
  const frames = PERSON_CLIPS[clip].frames
  const directions = personRecipe(design).directions
  useEffect(() => {
    let cancelled = false
    setStages(null); setError("")
    // Let the controls paint before the bake takes the main thread.
    const handle = requestAnimationFrame(() => {
      try {
        const built = buildStages(design, clip, row, Math.min(frame, frames - 1))
        if (!cancelled) setStages(built)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "This design could not be rendered.")
      }
    })
    return () => { cancelled = true; cancelAnimationFrame(handle) }
  }, [design, clip, row, frame, frames])

  return <div className="flex w-full max-w-5xl flex-col gap-6">
    <div className={`${card} flex flex-wrap items-end gap-4`}>
      <label className="flex flex-col gap-1 text-xs text-ink-light">Character
        <select aria-label="Character" className={control} value={preset} onChange={event => setPreset(event.target.value)}>
          {saved && <option value="saved">Playground design</option>}
          {Object.keys(PERSON_PRESETS).map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-light">Clip
        <select aria-label="Clip" className={control} value={clip} onChange={event => {
          const next = event.target.value as BaseClip
          setClip(next); setFrame(current => Math.min(current, PERSON_CLIPS[next].frames - 1))
        }}>
          {Object.entries(PERSON_CLIPS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-light">Facing
        <select aria-label="Facing" className={control} value={row} onChange={event => setRow(Number(event.target.value))}>
          {directions.map((direction, index) => <option key={direction} value={index}>{direction}</option>)}
        </select>
      </label>
      <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-ink-light">
        <span className="flex justify-between">Frame<span className="font-mono text-ink">{Math.min(frame, frames - 1) + 1}/{frames}</span></span>
        <input aria-label="Frame" className="w-full accent-[#94742f]" type="range" min={0} max={frames - 1} step={1}
          value={Math.min(frame, frames - 1)} onChange={event => setFrame(Number(event.target.value))} />
      </label>
      <p className="w-full text-[12px] text-ink-light" role="status">
        {error || (stages ? `${stages.cellSize} × ${stages.cellSize} px cell · ${stages.palette.length} colours · ${stages.padding} px safe margin` : "Rendering the pipeline…")}
      </p>
    </div>

    {stages && <>
      <Stage number="0" title="Design → recipe → palette"
        note={<><code>personRecipe()</code> turns the chosen design into body dimensions and a colour ramp: five skin steps, three hair, four tunic, four timber, plus cloth and accent. Skin and hair entries are reserved by tone, so a recolour cannot repaint a staff, a robe or a boot.</>}>
        <div className="person-palette">
          {stages.palette.map((entry, index) => <span key={`${index}-${entry.color}`} style={{ background: entry.color }}
            title={`${entry.color} · ${entry.tone === PALETTE_TONES.skin ? "skin" : entry.tone === PALETTE_TONES.hair ? "hair" : "shared"}`} />)}
        </div>
      </Stage>

      <Stage number="1" title="Base elements — three.js primitives"
        note={<><code>createBasePersonRig()</code> builds {stages.meshes} visible meshes for this pose. No textures anywhere: flat-shaded <code>MeshLambertMaterial</code>, colour only. Shown at {SCALE}× the bake resolution.</>}
        legend={stages.geometry}
        footnote="Lathes run 8–12 radial segments, leg cylinders six, hands an 8 × 6 sphere. At a 30–35px figure those facets are the shading steps once the palette snaps them.">
        <Frame image={stages.primitives} name="Rig meshes coloured by geometry type" />
        <Frame image={stages.wireframe} name="Rig wireframe" />
      </Stage>

      <Stage number="2" title="Rig — no skinning, no bone weights"
        note={<>Rigid parts hang off <code>pelvis → chest → head</code> and <code>shoulder → elbow</code> groups. Legs are unit cylinders stretched between solved joints by <code>bone()</code>; arms use the analytic two-bone IK in <code>reach()</code>. Blue handles are editable, grey ones are carried by the joints around them. The only real vertex deformation is the tunic lathe, rewritten from a rest copy each pose. Right: the shipped side diagnostic, where blue is always anatomical left.</>}>
        <Frame image={stages.rig} name="Rig joints and bones" />
        <Frame image={stages.sides} name="Anatomical side diagnostic" />
      </Stage>

      <Stage number="3" title="Colour pass — baked at final resolution"
        note={<>One fixed orthographic camera (35.264° pitch), ambient and hemisphere light plus a single directional sun, no shadow maps, antialias off. Rendered straight into a {stages.cellSize} px cell — never downsampled from a larger image.</>}>
        <Frame image={stages.shaded} name="Raw colour pass" />
      </Stage>

      <Stage number="4" title="Part-ID pass — the same frame as data"
        note={<><code>rig.inkMask(true)</code> swaps every material for a <code>MeshBasicMaterial</code> writing the part id into red and the body tone into green, then re-renders. Raw it is almost black, so it is false-coloured here; skin tones are lifted a step and hair dropped one.</>} legend={stages.parts}>
        <Frame image={stages.mask} name="Raw part-id pass" tone="dark" />
        <Frame image={stages.decoded} name="Part ids, false-coloured" />
      </Stage>

      <Stage number="5" title="Ink and palette quantize — the shipped sprite"
        note={<><code>inkPersonFrame()</code> reads both buffers: a one-pixel contour outside the silhouette, interior edges only where a neighbour&apos;s part id ranks lower, softened to a quarter strength at same-cloth sleeve and torso joins. Every pixel then snaps to the nearest palette entry, skin only onto skin steps and hair onto hair. This frame kept {stages.padding} px of transparent margin; four is the floor.</>}>
        <Frame image={stages.sprite} name="Finished sprite" />
      </Stage>

      {stages.depth && <Stage number="6" title="Depth atlas — view-offset-rg16-v1"
        note={<>The same posed rig through the same camera. Red and green hold a 16-bit distance toward the camera from the rig origin and blue marks geometry, so buildings and terrain occlude the flat billboard correctly. Ink pixels inherit the depth of the solid neighbour they took their colour from.</>}>
        <Frame image={stages.depth} name="Depth atlas frame" tone="dark" />
      </Stage>}

      {stages.shadow && <Stage number="7" title="Cast shadow — a separate translucent sheet"
        note={<><code>personCastShadow()</code> fills the finished silhouette and projects it from the fixed foot anchor with a 2D canvas transform, a 0.35px blur and 16% opacity. The road draws it with ground depth, no depth writes and no selection id.</>}>
        <Frame image={stages.shadow} name="Cast shadow frame" tone="ground" />
      </Stage>}

      <Stage number="8" title={`The sheet — 8 directions × ${frames} poses`}
        note={<>Directions come from turning the rig on <code>root.rotation.y</code>; the light never moves and a dressed frame is never mirrored. Above: this pose in all eight rows at 2×. Below: the whole clip in the chosen row, at native size.</>}>
        <div className="w-full overflow-x-auto">
          <Frame image={stages.directions} name="This pose in all eight directions" />
        </div>
        <div className="w-full overflow-x-auto">
          <Frame image={stages.sheet} name={`${PERSON_CLIPS[clip].label} row`} />
        </div>
      </Stage>
    </>}
  </div>
}
