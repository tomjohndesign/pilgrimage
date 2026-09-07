"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight, SlidersHorizontal } from "lucide-react"
import "./game/game-hud.css"
import "./base-person-lab.css"

export type AssetEditorMode = "characters" | "animals" | "buildings"
export interface AssetEditorNavigation { mode: AssetEditorMode; onModeChange: (mode: AssetEditorMode) => void }

/** Shared character-playground frame, controls drawer and asset switch.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0 — Shared asset editor header, building workshop (214-0)
 */
export function AssetEditorFrame({ mode, onModeChange, version, controlsOpen, onControlsToggle, roadHref = "/play", label, status, detail, children }: AssetEditorNavigation & {
  version: string; controlsOpen: boolean; onControlsToggle: () => void; roadHref?: string;
  label: string; status: ReactNode; detail: ReactNode; children: ReactNode
}) {
  return <section className="game-hud person-editor" aria-label={label}>
    <div className="hud-frame" aria-hidden="true" />
    <header className="person-header">
      <div className="person-title"><Link href="/assets" className="hud-action" aria-label="Back to assets"><ArrowLeft size={14} /><span className="asset-back-label">Assets</span></Link><h1>Asset playground</h1><span className="person-version">{version}</span></div>
      <div className="person-view-buttons asset-mode-toggle" role="group" aria-label="Asset type">
        {(["characters", "animals", "buildings"] as const).map(value => <button key={value} className="hud-action" aria-pressed={mode === value} onClick={() => onModeChange(value)}>{value === "characters" ? "Characters" : value === "animals" ? "Animals" : "Buildings"}</button>)}
      </div>
      <nav aria-label="Editor navigation"><button className="hud-action person-controls-toggle" aria-label="Controls" aria-expanded={controlsOpen} onClick={onControlsToggle}><SlidersHorizontal size={14} /><span className="asset-controls-label">Controls</span></button><Link className="hud-action" aria-label="On the road" href={roadHref}><span className="person-road-label">On the road</span><ArrowUpRight size={14} /></Link></nav>
    </header>
    {children}
    <footer className="person-status"><span role="status">{status}</span><span className="person-status-detail">{detail}</span></footer>
  </section>
}
