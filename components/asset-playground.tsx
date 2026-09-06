"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { BasePersonLab } from "./base-person-lab"
import type { AssetEditorMode } from "./asset-editor-frame"

const ProceduralWorkshop = dynamic(() => import("./building-lab/procedural-workshop").then(m => m.ProceduralWorkshop), { ssr: false })

/** Keep each editor's draft mounted across asset changes; pause hidden previews. */
export function AssetPlayground() {
  const search = useSearchParams(), router = useRouter()
  const mode: AssetEditorMode = search.get("asset") === "buildings" ? "buildings" : "characters"
  const [visited, setVisited] = useState({ characters: mode === "characters", buildings: mode === "buildings" })
  useEffect(() => { setVisited(old => old[mode] ? old : { ...old, [mode]: true }) }, [mode])
  const onModeChange = (next: AssetEditorMode) => {
    if (next === mode) return
    const params = new URLSearchParams(search.toString())
    params.set("asset", next)
    router.push(`/assets/characters?${params.toString()}`, { scroll: false })
  }
  return <>
    {(visited.characters || mode === "characters") && <div hidden={mode !== "characters"}><BasePersonLab mode={mode} onModeChange={onModeChange} active={mode === "characters"} /></div>}
    {(visited.buildings || mode === "buildings") && <div hidden={mode !== "buildings"}><ProceduralWorkshop mode={mode} onModeChange={onModeChange} active={mode === "buildings"} /></div>}
  </>
}
