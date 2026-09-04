"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { loadSavedSeed, useCameraStore } from "@/lib/game/camera-store"
import { PROTOTYPE_MAP } from "@/lib/game/map/prototype-map"
import { TERRAIN } from "@/lib/game/map/terrain"
import { tileAt } from "@/lib/game/map/types"
import { parseSeed } from "@/lib/game/rng"
import {
  DEFAULT_VIEW_SIZE,
  MAX_VIEW_SIZE,
  MIN_VIEW_SIZE,
  normalizeViewIndex,
} from "@/lib/game/render/iso"
import { OUTLINE_MODE_LABELS } from "@/lib/game/render/outline"
import { SITE_MENU } from "@/lib/site-menu"

const CONTROLS: Array<[string, string]> = [
  ["Drag", "Pan"],
  ["Scroll", "Zoom"],
  ["Q / E", "Rotate view"],
  ["W A S D", "Pan"],
  ["O", "Cycle outlines"],
  ["0", "Reset camera"],
]

const PANEL_SHADOW = "shadow-[0_2px_16px_rgba(0,0,0,0.6)]"

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className={`pointer-events-none border border-rule bg-parchment/95 px-4 py-3 ${PANEL_SHADOW}`}>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-display text-[9px] uppercase tracking-[2px] text-gold">{children}</div>
  )
}

function MenuButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="border border-rule bg-parchment-dark px-2.5 py-1 font-display text-[10px] uppercase tracking-[2px] text-ink hover:border-gold hover:text-red"
    >
      {children}
    </button>
  )
}

function MenuPanel() {
  const seed = useCameraStore((s) => s.seed)
  const [seedInput, setSeedInput] = useState(String(seed))
  const [invalid, setInvalid] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  // Follow the store when the seed changes elsewhere (saved-seed load, debug).
  useEffect(() => setSeedInput(String(seed)), [seed])

  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [justSaved])

  const apply = (): boolean => {
    const parsed = parseSeed(seedInput)
    if (parsed === null) {
      setInvalid(true)
      return false
    }
    setInvalid(false)
    useCameraStore.getState().setSeed(parsed)
    return true
  }

  const save = () => {
    if (!apply()) return
    useCameraStore.getState().saveSeed()
    setJustSaved(true)
  }

  return (
    <div className={`pointer-events-auto w-52 border border-rule bg-parchment/95 px-4 py-3 ${PANEL_SHADOW}`}>
      <nav className="flex flex-col gap-1.5">
        {SITE_MENU.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="font-display text-[11px] uppercase tracking-[2px] text-ink hover:text-red"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-3 border-t border-rule pt-2.5">
        <Label>World seed</Label>
        <input
          value={seedInput}
          onChange={(event) => {
            setSeedInput(event.target.value)
            setInvalid(false)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") apply()
          }}
          inputMode="numeric"
          spellCheck={false}
          aria-label="World seed"
          aria-invalid={invalid}
          className={`mt-1.5 w-full border bg-parchment px-2 py-1 text-[13px] text-ink outline-none ${
            invalid ? "border-red" : "border-rule focus:border-gold"
          }`}
        />
        {invalid && <div className="mt-1 text-[11px] italic text-red">Digits only</div>}
        <div className="mt-2 flex items-center gap-2">
          <MenuButton onClick={apply}>Apply</MenuButton>
          <MenuButton onClick={save}>Save</MenuButton>
          {justSaved && <span className="text-[11px] italic text-ink-light">Saved ✦</span>}
        </div>
      </div>
    </div>
  )
}

export function GameHud() {
  const viewIndex = useCameraStore((s) => s.viewIndex)
  const viewSize = useCameraStore((s) => s.viewSize)
  const hovered = useCameraStore((s) => s.hovered)
  const outlineMode = useCameraStore((s) => s.outlineMode)
  const [menuOpen, setMenuOpen] = useState(false)

  // A seed the player saved in an earlier session takes over after mount.
  // (After mount, not during render, so SSR and hydration agree.)
  useEffect(() => {
    const saved = loadSavedSeed()
    if (saved !== null) useCameraStore.getState().setSeed(saved)
  }, [])

  const view = normalizeViewIndex(viewIndex)
  // Relative to the default zoom, so 100% is where the camera starts and
  // bigger reads as closer.
  const zoomPercent = Math.round((DEFAULT_VIEW_SIZE / viewSize) * 100)
  const hoveredTerrain = hovered ? tileAt(PROTOTYPE_MAP, hovered.x, hovered.z) : null

  return (
    <>
      <div className="absolute left-5 top-5 z-10 flex flex-col items-start gap-2">
        <Panel>
          <div className="font-display text-sm font-bold tracking-[3px] text-ink">PILGRIMAGE</div>
          <div className="font-display text-[9px] uppercase tracking-[2px] text-gold">
            Prototype — Camera &amp; Map
          </div>
        </Panel>

        <button
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          className={`pointer-events-auto border border-rule bg-parchment/95 px-4 py-2 font-display text-[10px] uppercase tracking-[2px] text-ink hover:text-red ${PANEL_SHADOW}`}
        >
          ☰ Menu
        </button>

        {menuOpen && <MenuPanel />}
      </div>

      <div className="absolute right-5 top-5 z-10 flex flex-col gap-2">
        <Panel>
          <Label>View</Label>
          <div className="flex items-center gap-1.5 pt-1">
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                className={`flex h-5 w-5 items-center justify-center border font-display text-[10px] ${
                  index === view
                    ? "border-gold bg-gold text-parchment"
                    : "border-rule bg-parchment-dark text-ink-light"
                }`}
              >
                {index + 1}
              </span>
            ))}
          </div>
        </Panel>

        <Panel>
          <Label>Zoom</Label>
          <div className="pt-1 font-display text-xs text-ink">{zoomPercent}%</div>
          <div className="mt-1.5 h-1 w-28 bg-parchment-dark">
            <div
              className="h-full bg-gold"
              style={{
                width: `${
                  ((MAX_VIEW_SIZE - viewSize) / (MAX_VIEW_SIZE - MIN_VIEW_SIZE)) * 100
                }%`,
              }}
            />
          </div>
        </Panel>

        <Panel>
          <Label>Outlines</Label>
          <div className="pt-1 text-[13px] italic text-ink-light">
            {OUTLINE_MODE_LABELS[outlineMode]}
          </div>
        </Panel>
      </div>

      <div className="absolute bottom-5 left-5 z-10">
        <Panel>
          <Label>Tile</Label>
          {hovered && hoveredTerrain ? (
            <div className="pt-1">
              <div className="font-display text-xs text-ink">
                {hovered.x}, {hovered.z}
              </div>
              <div className="text-[13px] italic text-ink-light">
                {TERRAIN[hoveredTerrain].label}
              </div>
            </div>
          ) : (
            <div className="pt-1 text-[13px] italic text-ink-light">—</div>
          )}
        </Panel>
      </div>

      <div className="absolute bottom-5 right-5 z-10">
        <Panel>
          <Label>Controls</Label>
          <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
            {CONTROLS.map(([key, action]) => (
              <div key={key} className="contents">
                <dt className="font-display text-[10px] text-gold">{key}</dt>
                <dd className="text-[13px] text-ink-light">{action}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </>
  )
}
