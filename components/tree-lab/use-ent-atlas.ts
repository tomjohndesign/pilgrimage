"use client"
import { useEffect, useState } from "react"
import { bakeEnts, DEFAULT_ENT_ATLAS, type EntAtlas } from "@/lib/game/trees/ent-bake"
import { useEntStore } from "@/lib/game/trees/ent-store"
import type { EntDesign } from "@/lib/game/trees/ent-rig"
import type { FoliageSpecies } from "@/lib/game/trees/foliage/design"

/** Publish art and rig parameters together: in-flight editor bakes cannot slide game feet. */
export function useEntAtlas(enabled = true) {
  const designs = useEntStore(s => s.designs)
  const [ready, setReady] = useState<{ atlas: EntAtlas; designs: Partial<Record<FoliageSpecies, EntDesign>> }>({ atlas: DEFAULT_ENT_ATLAS, designs: {} })
  const [error, setError] = useState("")
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setError("")
    if (!Object.keys(designs).length) { setReady({ atlas: DEFAULT_ENT_ATLAS, designs }); return }
    const timer = setTimeout(() => {
      bakeEnts(designs, () => cancelled).then(atlas => { if (!cancelled) setReady({ atlas, designs }) })
        .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Ent bake failed") })
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [designs, enabled])
  return { ...ready, error, baking: ready.designs !== designs && !error }
}
