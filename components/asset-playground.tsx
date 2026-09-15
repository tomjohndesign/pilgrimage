"use client"

import { Suspense, lazy, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { playgroundHref, playgroundTool, type PlaygroundTool } from "@/lib/asset-playground"
import { AssetEditorFrame, type AssetEditorNavigation } from "./asset-editor-frame"
import type { ComponentType } from "react"

const EDITORS: Record<PlaygroundTool, ComponentType<AssetEditorNavigation & { active?: boolean }>> = {
  tuning: lazy(() => import("./tuning/balance-editor").then(m => ({ default: m.BalanceEditor }))),
  trees: lazy(() => import("./tree-lab/tree-lab").then(m => ({ default: m.TreeLab }))),
  textures: lazy(() => import("./texture-workspace").then(m => ({ default: m.TextureWorkspace }))),
  pipeline: lazy(() => import("./sprite-pipeline").then(m => ({ default: m.SpritePipeline }))),
  characters: lazy(() => import("./base-person-lab").then(m => ({ default: m.BasePersonLab }))),
  animals: lazy(() => import("./animal-lab").then(m => ({ default: m.AnimalLab }))),
  buildings: lazy(() => import("./building-lab/procedural-workshop").then(m => ({ default: m.ProceduralWorkshop }))),
  ents: lazy(() => import("./tree-lab/ent-lab").then(m => ({ default: m.EntLab }))),
  maps: lazy(() => import("./map-lab/map-lab").then(m => ({ default: m.MapLab }))),
  paths: lazy(() => import("./path-lab/path-lab").then(m => ({ default: m.PathLab }))),
  town: lazy(() => import("./path-lab/town-lab").then(m => ({ default: m.TownLab }))),
  placement: lazy(() => import("./placement-lab/placement-lab").then(m => ({ default: m.PlacementLab }))),
  rendering: lazy(() => import("./render-lab/render-lab").then(m => ({ default: m.RenderLab }))),
}

/** One playground. Keep drafts when switching tools and pause hidden previews. */
export function AssetPlayground() {
  const search = useSearchParams()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const mode = playgroundTool(search.get("asset"))
  const [visited, setVisited] = useState<PlaygroundTool[]>([mode])
  const queries = useRef(new Map<PlaygroundTool, string>())
  // Include browser back/forward destinations as well as selector changes.
  if (!visited.includes(mode)) setVisited(old => [...old, mode])
  const onModeChange = (next: PlaygroundTool) => {
    if (next === mode) return
    queries.current.set(mode, search.toString())
    window.history.pushState(null, "", playgroundHref(next, new URLSearchParams(queries.current.get(next))))
  }
  const loading = (tool: PlaygroundTool) => <AssetEditorFrame mode={tool} onModeChange={onModeChange} label="Loading playground tool" version="" controlsOpen={false} onControlsToggle={() => {}} status="Loading…" detail="">
    <p role="status" className="p-6 text-ink-light">Loading…</p>
  </AssetEditorFrame>
  // These editors use browser-only renderers. Load them after hydration.
  if (!mounted) return loading(mode)
  return <>{visited.map(tool => {
    const Editor = EDITORS[tool]
    return <div key={tool} hidden={tool !== mode}><Suspense fallback={loading(tool)}><Editor mode={tool} onModeChange={onModeChange} active={tool === mode} /></Suspense></div>
  })}</>
}
