"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { useCameraStore } from "@/lib/game/camera-store"
import { TERRAIN } from "@/lib/game/map/terrain"
import { tileAt, type GameMap } from "@/lib/game/map/types"
import { parseSeed } from "@/lib/game/rng"
import { saveSeed } from "@/lib/game/seed-storage"
import {
  DEFAULT_VIEW_SIZE,
  MAX_VIEW_SIZE,
  MIN_VIEW_SIZE,
  normalizeViewIndex,
} from "@/lib/game/render/iso"
import { OUTLINE_MODE_LABELS } from "@/lib/game/render/outline"
import { SITE_MENU } from "@/lib/site-menu"

import type { MapSettings } from "./game-shell"

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

/** Top-level navigation, folded into the play view. */
function MenuPanel() {
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
  const viewIndex = useCameraStore((s) => s.viewIndex)
  const viewSize = useCameraStore((s) => s.viewSize)
  const hovered = useCameraStore((s) => s.hovered)
  const outlineMode = useCameraStore((s) => s.outlineMode)
  const [menuOpen, setMenuOpen] = useState(false)

  const view = normalizeViewIndex(viewIndex)
  // Relative to the default zoom, so 100% is where the camera starts and
  // bigger reads as closer.
  const zoomPercent = Math.round((DEFAULT_VIEW_SIZE / viewSize) * 100)
  const hoveredTerrain = hovered && map ? tileAt(map, hovered.x, hovered.z) : null

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
            min={30}
            max={90}
            onChange={(coverage) => set({ coverage })}
          />
          <Tuner
            label="Glades"
            value={settings.glades}
            display={String(settings.glades)}
            min={1}
            max={12}
            onChange={(glades) => set({ glades })}
          />
          <Tuner
            label="Clearings"
            value={settings.clearings}
            display={String(settings.clearings)}
            min={0}
            max={30}
            onChange={(clearings) => set({ clearings })}
          />
          <Tuner
            label="Trees per tile"
            value={settings.treeDensity}
            display={String(settings.treeDensity)}
            min={1}
            max={6}
            onChange={(treeDensity) => set({ treeDensity })}
          />
        </Panel>
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
