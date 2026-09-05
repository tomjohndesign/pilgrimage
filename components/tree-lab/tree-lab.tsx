"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

import {
  TREE_SPECIES_ORDER,
  type Range,
  type TreeSpeciesDef,
  type TreeSpeciesId,
} from "@/lib/game/trees/species"
import { isSpeciesTuned, useTreeTuningStore } from "@/lib/game/trees/tree-tuning-store"

/* three.js touches browser globals on import, so the canvases are client-only. */
const TreeLineup = dynamic(() => import("./tree-lineup").then((m) => m.TreeLineup), {
  ssr: false,
})
const TreeMapPreview = dynamic(
  () => import("./tree-map-preview").then((m) => m.TreeMapPreview),
  { ssr: false },
)

const MAP_SIZES = [32, 48, 64]

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

// --- Small parchment UI atoms ------------------------------------------------

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <article className="border border-rule bg-parchment p-5 shadow-[0_0_0_3px_var(--parchment-dark),0_0_0_4px_var(--rule),4px_4px_24px_rgba(0,0,0,0.6)]">
      <h2 className="mb-1 font-display text-base font-semibold uppercase tracking-[3px] text-ink">
        {title}
      </h2>
      {subtitle && <p className="mb-4 text-[14px] italic text-ink-light">{subtitle}</p>}
      {children}
    </article>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-display text-[9px] uppercase tracking-[2px] text-gold">{children}</div>
  )
}

function LabButton({
  children,
  onClick,
  active = false,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-2 py-1 font-display text-[9px] uppercase tracking-[2px] transition-colors hover:border-gold hover:text-red ${
        active ? "border-gold bg-gold text-parchment hover:text-parchment" : "border-rule bg-parchment-dark text-ink"
      }`}
    >
      {children}
    </button>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v: number) => String(v),
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  format?: (value: number) => string
}) {
  return (
    <div className="pt-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[13px] italic text-ink-light">{label}</span>
        <span className="font-display text-[10px] text-ink">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-0.5 h-1 w-full cursor-pointer accent-gold"
      />
    </div>
  )
}

/** Min and max of a range on one row. Dragging one past the other drags both. */
function RangeSlider({
  label,
  range,
  min,
  max,
  step,
  onChange,
  format = (v: number) => v.toFixed(2),
}: {
  label: string
  range: Range
  min: number
  max: number
  step: number
  onChange: (range: Range) => void
  format?: (value: number) => string
}) {
  return (
    <div className="pt-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[13px] italic text-ink-light">{label}</span>
        <span className="font-display text-[10px] text-ink">
          {format(range.min)} – {format(range.max)}
        </span>
      </div>
      <div className="mt-0.5 grid grid-cols-2 gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={range.min}
          aria-label={`${label} minimum`}
          onChange={(event) => {
            const value = Number(event.target.value)
            onChange({ min: value, max: Math.max(value, range.max) })
          }}
          className="h-1 w-full cursor-pointer accent-gold"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={range.max}
          aria-label={`${label} maximum`}
          onChange={(event) => {
            const value = Number(event.target.value)
            onChange({ min: Math.min(value, range.min), max: value })
          }}
          className="h-1 w-full cursor-pointer accent-gold"
        />
      </div>
    </div>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 pt-1.5">
      <span className="text-[13px] italic text-ink-light">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-display text-[10px] text-ink">{value}</span>
        <input
          type="color"
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          className="h-5 w-8 cursor-pointer border border-rule bg-parchment-dark p-0"
        />
      </span>
    </div>
  )
}

// --- Species editor ----------------------------------------------------------

function SpeciesEditor({ def }: { def: TreeSpeciesDef }) {
  const patchSpecies = useTreeTuningStore((s) => s.patchSpecies)
  const resetSpecies = useTreeTuningStore((s) => s.resetSpecies)
  const trunk = (patch: Partial<TreeSpeciesDef["trunk"]>) => patchSpecies(def.id, { trunk: patch })
  const crown = (patch: Partial<TreeSpeciesDef["crown"]>) => patchSpecies(def.id, { crown: patch })
  const habitat = (patch: Partial<TreeSpeciesDef["habitat"]>) =>
    patchSpecies(def.id, { habitat: patch })

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <span className="font-display text-sm font-semibold tracking-[2px] text-ink">
            {def.label}
          </span>
          <span className="ml-2 text-[13px] italic text-ink-light">{def.latin}</span>
        </div>
        {isSpeciesTuned(def) && (
          <LabButton onClick={() => resetSpecies(def.id)}>Reset {def.label}</LabButton>
        )}
      </div>
      <p className="mt-1 text-[13px] text-ink-light">{def.blurb}</p>

      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-3">
        <div>
          <Label>Trunk</Label>
          <RangeSlider
            label="Height"
            range={def.trunk.height}
            min={0.1}
            max={2}
            step={0.01}
            onChange={(height) => trunk({ height })}
          />
          <RangeSlider
            label="Radius"
            range={def.trunk.radius}
            min={0.02}
            max={0.2}
            step={0.005}
            format={(v) => v.toFixed(3)}
            onChange={(radius) => trunk({ radius })}
          />
          <Slider
            label="Taper"
            value={def.trunk.taper}
            min={0.3}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(taper) => trunk({ taper })}
          />
          <Slider
            label="Lean"
            value={def.trunk.lean}
            min={0}
            max={0.3}
            step={0.01}
            format={(v) => `${Math.round((v * 180) / Math.PI)}°`}
            onChange={(lean) => trunk({ lean })}
          />
          <ColorField label="Bark" value={def.trunk.color} onChange={(color) => trunk({ color })} />
        </div>

        <div>
          <Label>Crown</Label>
          <div className="flex items-center justify-between gap-4 pt-1.5">
            <span className="text-[13px] italic text-ink-light">Shape</span>
            <span className="flex gap-1">
              <LabButton active={def.crown.shape === "blob"} onClick={() => crown({ shape: "blob" })}>
                Blob
              </LabButton>
              <LabButton active={def.crown.shape === "cone"} onClick={() => crown({ shape: "cone" })}>
                Cone
              </LabButton>
            </span>
          </div>
          <RangeSlider
            label="Branches"
            range={def.crown.blobs}
            min={1}
            max={6}
            step={1}
            format={(v) => String(v)}
            onChange={(blobs) => crown({ blobs })}
          />
          <RangeSlider
            label="Radius"
            range={def.crown.radius}
            min={0.1}
            max={0.8}
            step={0.01}
            onChange={(radius) => crown({ radius })}
          />
          <RangeSlider
            label="Squash"
            range={def.crown.squash}
            min={0.3}
            max={2.5}
            step={0.05}
            onChange={(squash) => crown({ squash })}
          />
          <Slider
            label="Lift"
            value={def.crown.lift}
            min={-0.5}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(lift) => crown({ lift })}
          />
          <Slider
            label="Spread"
            value={def.crown.spread}
            min={0}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(spread) => crown({ spread })}
          />
          <Slider
            label="Colour jitter"
            value={def.crown.colorJitter}
            min={0}
            max={0.3}
            step={0.01}
            format={(v) => `±${Math.round(v * 100)}%`}
            onChange={(colorJitter) => crown({ colorJitter })}
          />
          <ColorField label="Foliage" value={def.crown.color} onChange={(color) => crown({ color })} />
        </div>

        <div>
          <Label>Habitat</Label>
          <Slider
            label="Abundance"
            value={def.habitat.weight}
            min={0}
            max={2}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(weight) => habitat({ weight })}
          />
          <Slider
            label="Edge bias"
            value={def.habitat.edgeBias}
            min={-1}
            max={1}
            step={0.1}
            format={(v) => (v === 0 ? "indifferent" : v > 0 ? `edge +${v.toFixed(1)}` : `interior ${v.toFixed(1)}`)}
            onChange={(edgeBias) => habitat({ edgeBias })}
          />
          <Slider
            label="Grouping"
            value={def.habitat.grouping}
            min={0}
            max={1}
            step={0.05}
            format={(v) => (v === 0 ? "scattered" : `${Math.round(v * 100)}%`)}
            onChange={(grouping) => habitat({ grouping })}
          />
          <Slider
            label="Grove size"
            value={def.habitat.groveSize}
            min={2}
            max={20}
            step={1}
            format={(v) => `${v} tiles`}
            onChange={(groveSize) => habitat({ groveSize })}
          />
          <Slider
            label="Footprint"
            value={def.habitat.footprint}
            min={0.1}
            max={0.8}
            step={0.05}
            format={(v) => `${v.toFixed(2)} tiles`}
            onChange={(footprint) => habitat({ footprint })}
          />
          <Slider
            label="Per tile"
            value={def.habitat.perTile}
            min={1}
            max={3}
            step={1}
            format={(v) => (v === 1 ? "1 tree" : `${v} trees`)}
            onChange={(perTile) => habitat({ perTile })}
          />
          <p className="mt-3 text-[12px] text-ink-light">
            Abundance is the species&apos; share of the forest; edge bias pulls it toward tiles
            that border open ground (positive) or away from them (negative). Grouping keeps the
            species to groves of about the given size, with mixing along their seams. Footprint
            is the ground a trunk claims — no other trunk stands closer — and per tile caps how
            many of the species one tile can hold.
          </p>
        </div>
      </div>
    </div>
  )
}

// --- The lab -------------------------------------------------------------------

export function TreeLab() {
  const species = useTreeTuningStore((s) => s.species)
  const variance = useTreeTuningStore((s) => s.variance)
  const setVariance = useTreeTuningStore((s) => s.setVariance)
  const resetAll = useTreeTuningStore((s) => s.resetAll)

  const [selected, setSelected] = useState<TreeSpeciesId | "all">("all")
  const [lineupSeed, setLineupSeed] = useState(1)
  const [lineupView, setLineupView] = useState(0)
  const [mapSeed, setMapSeed] = useState<number | null>(null)
  const [mapSize, setMapSize] = useState(48)
  const [copied, setCopied] = useState(false)

  // Roll the map seed client-side so server and client never disagree.
  useEffect(() => {
    if (mapSeed === null) setMapSeed(randomSeed())
  }, [mapSeed])

  // ?species=oak opens the lab on that species, so a tuning session is linkable.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("species")
    if (wanted && (TREE_SPECIES_ORDER as string[]).includes(wanted)) {
      setSelected(wanted as TreeSpeciesId)
    }
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(species, null, 2))
    setCopied(true)
  }

  const anyTuned = TREE_SPECIES_ORDER.some((id) => isSpeciesTuned(species[id])) || variance !== 1

  return (
    <div className="flex w-full flex-col gap-8">
      <Card
        title="Species"
        subtitle="Each tree samples its trunk, crown and branch count from its species' ranges, so no two are identical and none is out of character."
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <LabButton active={selected === "all"} onClick={() => setSelected("all")}>
            All species
          </LabButton>
          {TREE_SPECIES_ORDER.map((id) => (
            <LabButton key={id} active={selected === id} onClick={() => setSelected(id)}>
              {species[id].label}
              {isSpeciesTuned(species[id]) ? " ✦" : ""}
            </LabButton>
          ))}
          <span className="flex-1" />
          <LabButton onClick={() => setLineupView((v) => (v + 1) % 4)}>View {lineupView + 1}</LabButton>
          <LabButton onClick={() => setLineupSeed(randomSeed())}>Reroll</LabButton>
        </div>

        <div className="aspect-[3/1] w-full border border-rule">
          <TreeLineup species={selected} seed={lineupSeed} view={lineupView} />
        </div>

        <div className="mt-5">
          {selected === "all" ? (
            <p className="text-[13px] text-ink-light">
              One of each, left to right:{" "}
              {TREE_SPECIES_ORDER.map((id) => species[id].label).join(", ")}. Pick a species above
              to see several individuals and tune it.
            </p>
          ) : (
            <SpeciesEditor def={species[selected]} />
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-1.5 border-t border-rule pt-4">
          <div className="w-52">
            <Slider
              label="Variance"
              value={variance}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={setVariance}
            />
          </div>
          <span className="flex-1" />
          <LabButton onClick={copyJson}>Copy species JSON</LabButton>
          {copied && <span className="text-[11px] italic text-ink-light">Copied ✦</span>}
          {anyTuned && <LabButton onClick={resetAll}>Reset all</LabButton>}
        </div>
        <p className="mt-2 text-[12px] text-ink-light">
          Variance narrows every range toward its midpoint — 0% makes each species a clone.
          Tuned values live only on this page; paste the JSON into{" "}
          <code className="text-[11px]">lib/game/trees/species.ts</code> to keep them.
        </p>
      </Card>

      <Card
        title="Forest"
        subtitle="The real game canvas on a generated map. Drag to pan, scroll to zoom, Q and E to rotate, O to cycle outlines."
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Label>Size</Label>
          {MAP_SIZES.map((size) => (
            <LabButton key={size} active={mapSize === size} onClick={() => setMapSize(size)}>
              {size}
            </LabButton>
          ))}
          <span className="flex-1" />
          {mapSeed !== null && (
            <span className="font-display text-[10px] text-ink-light">seed {mapSeed}</span>
          )}
          <LabButton onClick={() => setMapSeed(randomSeed())}>New map</LabButton>
        </div>
        <div className="relative aspect-[16/9] w-full border border-rule bg-[#14100a]">
          {mapSeed !== null && (
            <TreeMapPreview seed={mapSeed} size={mapSize} />
          )}
        </div>
      </Card>
    </div>
  )
}
