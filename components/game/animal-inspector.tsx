"use client"

import { useEffect, useState } from "react"
import { useCameraStore } from "@/lib/game/camera-store"
import { wildlifeRegistry } from "@/lib/game/wildlife/registry"
import { activityLabel } from "@/lib/game/wildlife/behavior"
import { isBird, isDomestic, WILDLIFE_PROFILES } from "@/lib/game/wildlife/species"

/** Uses the shared contextual inspector styling for living map wildlife. */
export function AnimalInspector({ id }: { id: number }) {
  const [, refresh] = useState(0)
  useEffect(() => { const timer = setInterval(() => refresh(n => n + 1), 250); return () => clearInterval(timer) }, [])
  const world = wildlifeRegistry.current, animal = world?.animals[id]
  if (!animal || animal.reserve) return null
  const group = world!.animals.filter(other => other.group === animal.group && !other.concealed).length
  const activity = activityLabel(animal)
  return <div className="hud-inspector-content w-[250px] border border-rule bg-parchment/95 px-4 py-3 text-[11px] text-ink">
    <div className="mb-2 flex items-center justify-between gap-3"><span className="font-display text-xs">{WILDLIFE_PROFILES[animal.kind].label}</span><button aria-label="Dismiss animal" onClick={() => useCameraStore.getState().select(null)}>✕</button></div>
    <div className="flex justify-between py-0.5"><span className="italic text-ink-light">Activity</span><span>{activity}</span></div>
    <div className="flex justify-between py-0.5"><span className="italic text-ink-light">Group</span><span>{group > 1 ? `${group} animals` : "Solitary"}</span></div>
    <p className="mt-2 italic text-ink-light">{isBird(animal.kind) ? "Flies between trees and rests in the canopy." : isDomestic(animal.kind) ? "Stays with its herd, comfortable near paths and people." : animal.kind === "fox" || animal.kind === "boar" ? "Keeps near the forest, away from busy areas." : "Prefers quiet open ground away from paths and people."}</p>
  </div>
}
