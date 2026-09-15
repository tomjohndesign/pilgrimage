"use client"

import dynamic from "next/dynamic"
import { AssetEditorHelp } from "./asset-editor-frame"

import { TEXTURES } from "@/lib/game/render/textures"

/* three.js touches browser globals on import, so previews are client-only. */
const TexturePreview = dynamic(
  () => import("./texture-preview").then((m) => m.TexturePreview),
  { ssr: false },
)

function CellLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-display text-[9px] uppercase tracking-[2px] text-gold">
      {children}
    </div>
  )
}

export function TextureGallery() {
  return (
    <div className="grid w-full max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
      {TEXTURES.map((entry) => (
        <article
          key={entry.id}
          className="workspace-catalogue-item"
        >
          <h2 className="mb-1 font-display text-base font-semibold uppercase tracking-[3px] text-ink">
            {entry.label}
          </h2>
          <AssetEditorHelp label={entry.label}>{entry.appliedTo} {entry.source}</AssetEditorHelp>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <CellLabel>Texture</CellLabel>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.url}
                alt={`${entry.label} texture`}
                className="aspect-square w-full border border-rule bg-ink object-cover [image-rendering:pixelated]"
              />
            </div>
            <div>
              <CellLabel>In game</CellLabel>
              <div className="aspect-square w-full border border-rule">
                <TexturePreview entry={entry} />
              </div>
            </div>
          </div>


        </article>
      ))}
    </div>
  )
}
