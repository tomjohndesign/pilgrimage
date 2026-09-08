"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { DEFAULT_FOLIAGE, FOLIAGE_SPECIES, isFoliageSpecies, type FoliageAtlas, type FoliageDesigns } from "@/lib/game/trees/foliage/design"
import { DEFAULT_FOLIAGE_ATLAS } from "@/lib/game/trees/foliage/assets"

import { TREE_SPECIES, type TreeSpeciesId } from "@/lib/game/trees/species"

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
      aria-pressed={active}
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
        aria-label={label}
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
// --- The lab -------------------------------------------------------------------

export function TreeLab() {
  const species = TREE_SPECIES
  const [foliage, setFoliage] = useState<FoliageDesigns>(() => structuredClone(DEFAULT_FOLIAGE))
  const [atlas, setAtlas] = useState<FoliageAtlas>(DEFAULT_FOLIAGE_ATLAS)
  const [baking, setBaking] = useState(false)
  const [bakeError, setBakeError] = useState("")
  useEffect(() => {
    let cancelled = false
    const target = window as unknown as { __foliageAtlas?: FoliageAtlas; __bakeTreeFoliage?: () => Promise<FoliageAtlas> }
    target.__bakeTreeFoliage = async () => {
      const { bakeFoliage } = await import("@/lib/game/trees/foliage/bake")
      return bakeFoliage(foliage)
    }
    if (JSON.stringify(foliage) === JSON.stringify(DEFAULT_FOLIAGE)) {
      setAtlas(DEFAULT_FOLIAGE_ATLAS); target.__foliageAtlas = DEFAULT_FOLIAGE_ATLAS
      setBaking(false); setBakeError("")
      return () => { delete target.__bakeTreeFoliage; delete target.__foliageAtlas }
    }
    setBaking(true); setBakeError("")
    const timer = setTimeout(async () => {
      try {
        const { bakeFoliage } = await import("@/lib/game/trees/foliage/bake")
        const result = await bakeFoliage(foliage, () => cancelled)
        if (!cancelled) { setAtlas(result); target.__foliageAtlas = result }
      } catch (error) {
        if (!cancelled) setBakeError(error instanceof Error ? error.message : "The trees could not be baked.")
      } finally { if (!cancelled) setBaking(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer); delete target.__bakeTreeFoliage; delete target.__foliageAtlas }
  }, [foliage])
  const [selected, setSelected] = useState<TreeSpeciesId | "all">("all")
  const [lineupSeed, setLineupSeed] = useState(1)
  const [lineupView, setLineupView] = useState(0)
  const [darkForest, setDarkForest] = useState(false)
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
    if (wanted && isFoliageSpecies(wanted)) {
      setSelected(wanted as TreeSpeciesId)
    }
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(foliage, null, 2))
    setCopied(true)
  }


  return (
    <div className="flex w-full flex-col gap-8">
      <Card
        title="Species"
        subtitle="All six species: branching silhouettes, simplified foliage and a darker woodland palette. Monks show the game’s native pixel scale."
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {baking && <span className="text-[12px] italic text-ink-light">Updating foliage…</span>}
          {bakeError && <span role="alert" className="text-[12px] text-red">{bakeError}</span>}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <LabButton active={selected === "all"} onClick={() => setSelected("all")}>
            All species
          </LabButton>
          {FOLIAGE_SPECIES.map((id) => (
            <LabButton key={id} active={selected === id} onClick={() => setSelected(id)}>
              {species[id].label}
            </LabButton>
          ))}
          <span className="flex-1" />
          <LabButton active={darkForest} onClick={() => setDarkForest(value => !value)}>Dark forest</LabButton>
          <LabButton onClick={() => setLineupView((v) => (v + 1) % 4)}>View {lineupView + 1}</LabButton>
          <LabButton onClick={() => setLineupSeed(randomSeed())}>Reroll</LabButton>
        </div>

        {(selected === "all" ? [0, 1] : [0]).map(speciesPage => <div key={speciesPage} className="mb-3">
          <div className="aspect-[3/1] w-full border border-rule">
            <TreeLineup species={selected} seed={lineupSeed} view={lineupView} darkForest={darkForest} speciesPage={speciesPage} atlas={atlas} />
          </div>
          {selected === "all" && <div className="mt-2 grid grid-cols-3 text-center font-display text-[9px] uppercase tracking-[2px] text-gold">
            {FOLIAGE_SPECIES.slice(speciesPage * 3, speciesPage * 3 + 3).map(id => <span key={id}>{species[id].label}</span>)}
          </div>}
        </div>)}

        <div className="mt-5">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {(selected !== "all" && isFoliageSpecies(selected) ? [selected] : FOLIAGE_SPECIES).map(id => <div key={id}>
                <Label>{species[id].label}</Label>
                {([
                  ["height", "Height", 1.4, 3.25, 0.05],
                  ["spread", "Branch spread", 0.55, 1.2, 0.05],
                  ["density", "Foliage density", 0.4, 1.4, 0.05],
                  ["leafSize", "Leaf clusters", 0.6, 1.3, 0.05],
                ] as const).map(([key, label, min, max, step]) => <Slider key={key} label={label} value={foliage[id][key]} min={min} max={max} step={step} format={v => v.toFixed(2)}
                  onChange={value => setFoliage(old => ({ ...old, [id]: { ...old[id], [key]: value } }))} />)}
              </div>)}
            </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-1.5 border-t border-rule pt-4">
          <span className="flex-1" />
          <LabButton onClick={copyJson}>Copy species JSON</LabButton>
          {copied && <span className="text-[11px] italic text-ink-light">Copied ✦</span>}
          <LabButton onClick={() => setFoliage(structuredClone(DEFAULT_FOLIAGE))}>Reset foliage</LabButton>
        </div>
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
            <TreeMapPreview seed={mapSeed} size={mapSize} atlas={atlas} />
          )}
        </div>
      </Card>
    </div>
  )
}
