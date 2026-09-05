"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useCameraStore, type Selection } from "@/lib/game/camera-store"
import { simRegistry } from "@/lib/game/sim"
import { TREE_SPECIES } from "@/lib/game/trees/species"
import { WOOD_PER_LOG, pileLogCount, AXE_DAMAGE_PER_HOUR, treeResource, treeStage } from "@/lib/game/trees/timber"

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex justify-between gap-4 py-0.5"><span className="italic text-ink-light">{label}</span><span>{children}</span></div>
}

/** The same tree identity can be inspected standing, fallen, or as a stump. */
export function ResourceInspector({ selection, className = "left-0" }: {
  selection: Extract<Selection, { kind: "tree" | "pile" }>
  className?: string
}) {
  const [, refresh] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => refresh((n) => n + 1), 250)
    return () => clearInterval(timer)
  }, [])
  const sim = simRegistry.current
  if (!sim) return null
  let title: string
  let content: ReactNode
  if (selection.kind === "tree") {
    const placement = sim.trees[selection.id]
    if (!placement) return null
    const tree = sim.treeResources.get(selection.id) ?? treeResource(placement, selection.id, sim.seed)
    title = `${TREE_SPECIES[placement.species].label} · ${treeStage(tree, sim.time)}`
    content = <>
      <Row label="Size">{Math.round(tree.size * 100)}%</Row>
      <Row label="Durability">{Math.ceil(tree.health)} / {tree.maxHealth}</Row>
      <div className="my-1 h-1.5 bg-rule/40"><div className="h-full bg-gold" style={{ width: `${tree.health / tree.maxHealth * 100}%` }} /></div>
      <Row label="Trunk height">{tree.trunkHeight.toFixed(2)} tiles</Row>
      <Row label="Trunk diameter">{(tree.trunkRadius * 2).toFixed(2)} tiles</Row>
      <Row label="Timber yield">{tree.wood} wood</Row>
      <Row label={tree.health > 0 ? "Felling work left" : "Timber on ground"}>
        {tree.health > 0 ? `${(tree.health / AXE_DAMAGE_PER_HOUR).toFixed(1)} game hours` : `${tree.remainingWood} wood`}
      </Row>
      {tree.stumpUntil !== null && <Row label="Stump remains">
        {Math.max(0, tree.stumpUntil - sim.time).toFixed(1)} game days
      </Row>}
    </>
  } else {
    const pile = sim.piles.get(selection.id)
    if (!pile) return null
    title = `Wood pile ${pile.slot + 1}`
    content = <>
      <Row label="Stored timber">{pile.wood} wood</Row>
      <Row label="Stacked logs">{pileLogCount(pile.wood)} · {WOOD_PER_LOG} wood each</Row>
      <Row label="Location">Lumber camp</Row>
      <Row label="Camp stock">{Array.from(sim.piles.values()).filter((p) => p.campId === pile.campId).reduce((sum, p) => sum + p.wood, 0)} wood</Row>
      <p className="mt-2 italic text-ink-light">Delivered here by the camp’s woodcutters.</p>
    </>
  }
  return <div className={`pointer-events-auto absolute bottom-0 z-10 w-[250px] border border-rule bg-parchment/95 px-4 py-3 text-[11px] text-ink ${className}`}>
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="font-display text-xs">{title}</span>
      <button type="button" aria-label="Dismiss resource" onClick={() => useCameraStore.getState().select(null)}>✕</button>
    </div>
    {content}
  </div>
}
