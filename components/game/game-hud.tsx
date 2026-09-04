"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import type { GameMap } from "@/lib/game/map/types"
import { parseSeed } from "@/lib/game/rng"
import { saveSeed } from "@/lib/game/seed-storage"
import { SITE_MENU } from "@/lib/site-menu"

import type { MapSettings } from "./game-shell"
import { Minimap } from "./minimap"

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

function HudButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pointer-events-auto border border-rule bg-parchment-dark px-2 py-1 font-display text-[9px] uppercase tracking-[2px] text-ink transition-colors hover:border-gold hover:text-red"
    >
      {children}
    </button>
  )
}

function Tuner({
  label,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <div className="pt-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[13px] italic text-ink-light">{label}</span>
        <span className="font-display text-[10px] text-ink">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="pointer-events-auto mt-0.5 h-1 w-36 cursor-pointer accent-gold"
      />
    </div>
  )
}

/** Top-level navigation, folded into the play view. Controls live in here too. */
function MenuPanel() {
  const [showControls, setShowControls] = useState(false)

  return (
    <div className={`pointer-events-auto w-40 border border-rule bg-parchment/95 px-4 py-3 ${PANEL_SHADOW}`}>
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
        <button
          type="button"
          onClick={() => setShowControls((open) => !open)}
          aria-expanded={showControls}
          className="text-left font-display text-[11px] uppercase tracking-[2px] text-ink hover:text-red"
        >
          Controls {showControls ? "▾" : "▸"}
        </button>
        {showControls && (
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
            {CONTROLS.map(([key, action]) => (
              <div key={key} className="contents">
                <dt className="font-display text-[10px] text-gold">{key}</dt>
                <dd className="text-[13px] text-ink-light">{action}</dd>
              </div>
            ))}
          </dl>
        )}
      </nav>
    </div>
  )
}

/**
 * The seed as an editable field: paste a value and apply it, or save it as the
 * default for future sessions. The shell owns the seed; this only reports.
 */
function SeedField({
  seed,
  onSeedChange,
}: {
  seed: number | null
  onSeedChange: (seed: number) => void
}) {
  const [input, setInput] = useState(seed === null ? "" : String(seed))
  const [invalid, setInvalid] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  // Follow the shell when the seed changes elsewhere (reroll, URL load).
  useEffect(() => {
    if (seed !== null) setInput(String(seed))
  }, [seed])

  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [justSaved])

  const apply = (): number | null => {
    const parsed = parseSeed(input)
    if (parsed === null) {
      setInvalid(true)
      return null
    }
    setInvalid(false)
    onSeedChange(parsed)
    return parsed
  }

  const save = () => {
    const parsed = apply()
    if (parsed === null) return
    saveSeed(parsed)
    setJustSaved(true)
  }

  return (
    <div>
      <input
        value={input}
        onChange={(event) => {
          setInput(event.target.value)
          setInvalid(false)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") apply()
        }}
        inputMode="numeric"
        spellCheck={false}
        aria-label="World seed"
        aria-invalid={invalid}
        className={`pointer-events-auto mt-1 w-36 border bg-parchment px-2 py-1 text-[13px] text-ink outline-none ${
          invalid ? "border-red" : "border-rule focus:border-gold"
        }`}
      />
      {invalid && <div className="mt-1 text-[11px] italic text-red">Digits only</div>}
      <div className="mt-1.5 flex items-center gap-1.5">
        <HudButton onClick={apply}>Apply</HudButton>
        <HudButton onClick={save}>Save</HudButton>
        {justSaved && <span className="text-[11px] italic text-ink-light">Saved ✦</span>}
      </div>
    </div>
  )
}

export function GameHud({
  map,
  seed,
  settings,
  onSettingsChange,
  onReroll,
  onSeedChange,
}: {
  map: GameMap | null
  seed: number | null
  settings: MapSettings
  onSettingsChange: (settings: MapSettings) => void
  onReroll: () => void
  onSeedChange: (seed: number) => void
}) {
  const set = (patch: Partial<MapSettings>) => onSettingsChange({ ...settings, ...patch })
  const [menuOpen, setMenuOpen] = useState(false)

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
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          className={`pointer-events-auto border border-rule bg-parchment/95 px-4 py-2 font-display text-[10px] uppercase tracking-[2px] text-ink hover:text-red ${PANEL_SHADOW}`}
        >
          ☰ Menu
        </button>

        {menuOpen && <MenuPanel />}

        <Panel>
          <Label>Seed</Label>
          <SeedField seed={seed} onSeedChange={onSeedChange} />
          <Tuner
            label="Size"
            value={settings.size}
            display={`${settings.size} × ${settings.size}`}
            min={32}
            max={128}
            step={16}
            onChange={(size) => set({ size })}
          />
          <div className="mt-1.5">
            <HudButton onClick={onReroll}>New Map</HudButton>
          </div>
        </Panel>

        <Panel>
          <Label>Forest</Label>
          <Tuner
            label="Coverage"
            value={settings.coverage}
            display={`${settings.coverage}%`}
            min={0}
            max={50}
            onChange={(coverage) => set({ coverage })}
          />
          <Tuner
            label="Forests"
            value={settings.clusters}
            display={String(settings.clusters)}
            min={1}
            max={8}
            onChange={(clusters) => set({ clusters })}
          />
          <Tuner
            label="Groves"
            value={settings.groves}
            display={String(settings.groves)}
            min={0}
            max={30}
            onChange={(groves) => set({ groves })}
          />
        </Panel>
      </div>

      {map && (
        <div className="absolute bottom-5 right-5 z-10">
          <Panel>
            <Label>Map</Label>
            <Minimap map={map} />
          </Panel>
        </div>
      )}
    </>
  )
}
