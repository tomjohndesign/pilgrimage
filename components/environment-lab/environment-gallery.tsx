"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { ENVIRONMENT_KINDS, ENVIRONMENT_LABELS } from "@/lib/game/environment/elements"

const EnvironmentLineup = dynamic(() => import("./environment-lineup").then((m) => m.EnvironmentLineup), { ssr: false })

export function EnvironmentGallery() {
  const [seed, setSeed] = useState(42)
  const [view, setView] = useState(0)
  const button = "border border-rule bg-parchment-dark px-3 py-2 font-display text-[10px] uppercase tracking-[2px] text-ink hover:border-gold"
  return (
    <div className="border border-rule bg-parchment p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm italic text-ink-light">Meadow patches, wildflowers, and small outcrops. Room to breathe.</p>
        <div className="flex gap-2">
          <button type="button" className={button} onClick={() => setSeed((s) => s + 1)}>New variations</button>
          <button type="button" className={button} onClick={() => setView((v) => (v + 1) % 4)}>Rotate</button>
        </div>
      </div>
      <div className="h-[360px] overflow-hidden border border-rule" role="img" aria-label="Three variations each of shrubs, textured meadow grass, loose stones, boulders, groundcover, and wildflowers">
        <EnvironmentLineup seed={seed} view={view} />
      </div>
      <ul className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs italic text-ink-light">
        {ENVIRONMENT_KINDS.map((kind) => <li key={kind}>{ENVIRONMENT_LABELS[kind]}</li>)}
      </ul>
      <p className="mt-4 text-center text-sm italic text-ink-light">Individual variations above; see them grow in clusters across the landscape in the map preview below.</p>
    </div>
  )
}
