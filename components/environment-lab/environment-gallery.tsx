"use client"

import { AssetEditorHelp } from "../asset-editor-frame"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { ENVIRONMENT_KINDS, ENVIRONMENT_LABELS } from "@/lib/game/environment/elements"

const EnvironmentLineup = dynamic(() => import("./environment-lineup").then((m) => m.EnvironmentLineup), { ssr: false })

declare global { interface Window { __bakeEnvironment?: typeof import("@/lib/game/environment/bake").bakeEnvironment } }

export function EnvironmentGallery() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    const bake = async () => (await import("@/lib/game/environment/bake")).bakeEnvironment()
    window.__bakeEnvironment = bake
    return () => { delete window.__bakeEnvironment }
  }, [])
  const [seed, setSeed] = useState(42)
  const [view, setView] = useState(0)
  const button = "hud-action"
  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <AssetEditorHelp label="Preview">Meadow patches, wildflowers, and weathered outcrops, from loose stones to 1×2 and 2×2 boulder groups.</AssetEditorHelp>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} onClick={() => setSeed((s) => s + 1)}>New variations</button>
          <button type="button" className={button} onClick={() => setView((v) => (v + 1) % 4)}>Rotate</button>
        </div>
      </div>
      <div className="h-[480px] overflow-hidden border border-rule" role="img" aria-label="Three variations each of shrubs, meadow grass, loose stones, small boulders, groundcover, wildflowers, and 1 by 2 and 2 by 2 boulder groups">
        <EnvironmentLineup seed={seed} view={view} />
      </div>
      <ul className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs italic text-ink-light">
        {ENVIRONMENT_KINDS.map((kind) => <li key={kind}>{ENVIRONMENT_LABELS[kind]}</li>)}
        <li>1×2 boulder groups</li>
        <li>2×2 boulder groups</li>
      </ul>
    </div>
  )
}
