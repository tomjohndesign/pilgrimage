"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { BasePersonLab } from "./base-person-lab"
import type { AssetEditorMode } from "./asset-editor-frame"

const AnimalLab = dynamic(() => import("./animal-lab").then(m => m.AnimalLab), { ssr: false })
const ProceduralWorkshop = dynamic(() => import("./building-lab/procedural-workshop").then(m => m.ProceduralWorkshop), { ssr: false })

/** Keep each editor's draft mounted across asset changes; pause hidden previews. */
export function AssetPlayground() {
  const search = useSearchParams(), router = useRouter()
  const asset = search.get("asset")
  const mode: AssetEditorMode = asset === "buildings" ? "buildings" : ["animals", "donkey", "horse"].includes(asset ?? "") ? "animals" : "characters"
  const [visited, setVisited] = useState({ characters: mode === "characters", animals: mode === "animals", buildings: mode === "buildings" })
  useEffect(() => { setVisited(old => old[mode] ? old : { ...old, [mode]: true }) }, [mode])
  const onModeChange = (next: AssetEditorMode) => {
    if (next === mode) return
    const params = new URLSearchParams(search.toString())
    params.set("asset", next)
    router.push(`/assets/characters?${params.toString()}`, { scroll: false })
  }
  return <>
    {(visited.characters || mode === "characters") && <div hidden={mode !== "characters"}><BasePersonLab mode={mode} onModeChange={onModeChange} active={mode === "characters"} /></div>}
    {(visited.animals || mode === "animals") && <div hidden={mode !== "animals"}><AnimalLab mode={mode} onModeChange={onModeChange} active={mode === "animals"} /></div>}
    {(visited.buildings || mode === "buildings") && <div hidden={mode !== "buildings"}><ProceduralWorkshop mode={mode} onModeChange={onModeChange} active={mode === "buildings"} /></div>}
  </>
}
