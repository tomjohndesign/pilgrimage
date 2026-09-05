"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { useCameraStore } from "@/lib/game/camera-store"
import {
  arrivalOdds,
  computeDangerField,
  DANGER_THRESHOLDS,
  dangerLabel,
} from "@/lib/game/map/danger"
import { clampRoadTier, ROAD_TIERS } from "@/lib/game/map/road"
import { MIN_MAP_SIZE } from "@/lib/game/map/generate-map"
import { TERRAIN } from "@/lib/game/map/terrain"
import { tileAt, type GameMap } from "@/lib/game/map/types"
import { nerve } from "@/lib/game/route-choice"
import { parseSeed } from "@/lib/game/rng"
import { CURRENT_VERSION } from "@/lib/changelog"
import { SITE_MENU } from "@/lib/site-menu"
import { ACTIVITY_LABELS, formatGameTime, simRegistry, type SimTraveler } from "@/lib/game/sim"
import { MONK_ACTIVITY_LABELS, monkRegistry, type Monk, type MonkActivity } from "@/lib/game/monks"
import { relicTitle, type Relic } from "@/lib/game/relic"
import type { Traveler } from "@/lib/game/travelers"

import type { MapSettings } from "./game-shell"
import { Minimap } from "./minimap"
import { MusicPlayer } from "./music-player"

const CONTROLS: Array<[string, string]> = [
  ["Click", "Inspect traveler"],
  ["Drag", "Pan"],
  ["Scroll", "Zoom"],
  ["Q / E", "Rotate view"],
  ["W A S D", "Pan"],
  ["O", "Cycle outlines"],
  ["0", "Reset camera"],
]

const PANEL_SHADOW = "shadow-[0_2px_16px_rgba(0,0,0,0.6)]"

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`pointer-events-none border border-rule bg-parchment/95 px-4 py-3 ${className}`}>
      {children}
    </div>
  )
}

/**
 * One category inside the merged World panel: a gold header that folds the
 * body away, with a rule between neighbours. Everything stays in one column so
 * the tuning knobs read as a single instrument rather than a stack of cards.
 */
function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-1 border-t border-rule/70 py-2 first:border-t-0 first:pt-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="pointer-events-auto flex w-full items-baseline justify-between gap-3 text-left"
      >
        <span className="font-display text-[9px] font-black uppercase tracking-[2px] text-black">
          {title}
        </span>
        <span className="font-display text-[9px] text-gold/70">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="flex flex-col gap-1">{children}</div>}
    </section>
  )
}

/** Ghost control for the transparent header: parchment text straight on the scene. */
const HEADER_BUTTON =
  "pointer-events-auto border border-parchment/30 bg-[#14100a]/40 px-3 py-1.5 font-display text-[10px] uppercase tracking-[2px] text-parchment backdrop-blur-[2px] transition-colors hover:border-gold-light hover:text-gold-light"

const HEADER_TEXT_SHADOW =
  "[text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_0_12px_rgba(0,0,0,0.85)]"

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
  const fraction = max > min ? (value - min) / (max - min) : 0
  return (
    <div className="group flex items-center">
      <span className="w-16 shrink-0 text-[13px] font-medium text-ink-light">{label}</span>
      <div className="relative h-8 flex-1 overflow-hidden rounded-[6px] bg-parchment-dark">
        {/* Fill and knob are drawn; the real range input sits on top, invisible. */}
        <div
          className="absolute inset-y-0 left-0 rounded-[6px] bg-gold"
          style={{ width: `${fraction * 100}%` }}
        />
        {/* The handle is a notch in the panel's own parchment, shown only while the
            row is hovered. It rides 6px inside the fill's leading edge, never touching
            the rim, and stops short of the value at the far end so the two never collide. */}
        <div
          className="absolute top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-parchment opacity-0 group-hover:opacity-100"
          style={{ left: `clamp(4px, calc(${fraction * 100}% - 8px), calc(100% - 32px))` }}
        />
        <span className="absolute right-1 top-1/2 -translate-y-1/2 font-display text-[11px] font-black text-ink-light">
          {display}
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(event) => onChange(Number(event.target.value))}
          className="pointer-events-auto absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
    </div>
  )
}

/** A stepped choice drawn as the same box as a tuner track, with the option's name inside. */
function Chooser({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: number
  options: string[]
  onChange: (index: number) => void
}) {
  return (
    <div className="flex items-center">
      <span className="w-16 shrink-0 text-[13px] font-medium text-ink-light">{label}</span>
      <div className="relative h-8 flex-1 rounded-[6px] bg-parchment-dark">
        <span className="absolute inset-x-1.5 top-1/2 -translate-y-1/2 truncate font-display text-[11px] font-black text-ink-light">
          {options[value]}
        </span>
        <select
          value={value}
          aria-label={label}
          onChange={(event) => onChange(Number(event.target.value))}
          className="pointer-events-auto absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {options.map((option, index) => (
            <option key={option} value={index}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/** Top-level navigation, folded into the play view. Controls live in here too. */
function MenuPanel() {
  const [showControls, setShowControls] = useState(false)

  return (
    <div
      className={`pointer-events-auto absolute right-0 top-full mt-2 w-44 border border-rule bg-parchment/95 px-4 py-3 ${PANEL_SHADOW}`}
    >
      <nav className="flex flex-col gap-1.5">
        {SITE_MENU.map((item) => (
          <div key={item.href} className="flex flex-col gap-1">
            <Link
              href={item.href}
              className="font-display text-[11px] uppercase tracking-[2px] text-ink hover:text-red"
            >
              {item.label}
            </Link>
            {item.children?.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                className="pl-3 font-display text-[10px] uppercase tracking-[2px] text-ink-light hover:text-red"
              >
                {child.label}
              </Link>
            ))}
          </div>
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

  // Follow the shell when the seed changes elsewhere (reroll, URL load).
  useEffect(() => {
    if (seed !== null) setInput(String(seed))
  }, [seed])

  const apply = () => {
    const parsed = parseSeed(input)
    if (parsed === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onSeedChange(parsed)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-stretch gap-1.5">
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
        className={`pointer-events-auto min-w-0 flex-1 border bg-parchment px-2 py-1 text-[13px] text-ink outline-none ${
          invalid ? "border-red" : "border-rule focus:border-gold"
        }`}
        />
        <HudButton onClick={apply}>Apply</HudButton>
      </div>
      {invalid && <div className="text-[11px] italic text-red">Digits only</div>}
    </div>
  )
}

/** One 0–100 attribute as a labelled bar, styled after the zoom meter. */
function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-[11px] italic text-ink-light">{label}</span>
      <div className="h-1 w-20 bg-parchment-dark">
        <div className="h-full bg-gold" style={{ width: `${value}%` }} />
      </div>
      <span className="w-5 text-right font-display text-[9px] text-ink">{value}</span>
    </div>
  )
}

/**
 * The sim mutates stats at frame rate outside React; sample the selected
 * traveler's slice a few times a second instead of subscribing.
 */
function useLiveStats(travelerId: number): SimTraveler | null {
  const [live, setLive] = useState<SimTraveler | null>(null)
  useEffect(() => {
    const read = () => {
      const s = simRegistry.current?.travelers.get(travelerId)
      setLive(s ? { ...s } : null)
    }
    read()
    const timer = setInterval(read, 250)
    return () => clearInterval(timer)
  }, [travelerId])
  return live
}

/** Game clock, sampled from the running sim on the HUD's own schedule. */
function ClockPanel() {
  const [time, setTime] = useState<number | null>(null)
  useEffect(() => {
    const read = () => setTime(simRegistry.current?.time ?? null)
    read()
    const timer = setInterval(read, 500)
    return () => clearInterval(timer)
  }, [])
  if (time === null) return null
  const [day, clock] = formatGameTime(time).split(" — ")
  return (
    <div className="flex py-0.5 font-display text-lg leading-5 text-ink">
      <span className="w-1/2">{day}</span>
      <span className="w-1/2">{clock}</span>
    </div>
  )
}

/** Who the player clicked on the road: name, calling, and what drives them. */
function TravelerPanel({ traveler }: { traveler: Traveler }) {
  const a = traveler.attributes
  const live = useLiveStats(traveler.id)
  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-4">
        <Label>Traveler</Label>
        <button
          type="button"
          onClick={() => useCameraStore.getState().select(null)}
          aria-label="Dismiss traveler"
          className="pointer-events-auto font-display text-[10px] text-ink-light hover:text-red"
        >
          ✕
        </button>
      </div>
      <div className="pt-1">
        <div className="font-display text-xs text-ink">{traveler.name}</div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 border border-rule"
            style={{ backgroundColor: traveler.type.color }}
          />
          <span className="text-[13px] italic text-ink-light">
            {traveler.type.label}, {a.age} years
          </span>
        </div>
        {live && (
          <div className="text-[11px] italic text-gold">
            {ACTIVITY_LABELS[live.activity]}
            {live.track && " · on the dark track"}
          </div>
        )}
        {live && live.fled > 0 && (
          <div className="text-[11px] italic text-red">
            Turned back {live.fled === 1 ? "once" : `${live.fled} times`}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-0.5 border-t border-rule pt-2">
        <StatBar label="Status" value={a.status} />
        <StatBar label="Piety" value={a.piety} />
        <StatBar label="Hunger" value={Math.round(live?.hunger ?? a.hunger)} />
        <StatBar label="Thirst" value={Math.round(live?.thirst ?? a.thirst)} />
        <StatBar label="Stamina" value={Math.round(live?.stamina ?? a.stamina)} />
      </div>

      <div className="mt-2 border-t border-rule pt-2">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[11px] italic text-ink-light">Gold</span>
          <span className="font-display text-[10px] text-ink">{live?.gold ?? a.gold} ✦</span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[11px] italic text-ink-light">Jobless</span>
          <span className="font-display text-[10px] text-ink">{a.jobless ? "Yes" : "No"}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[11px] italic text-ink-light">Skills</span>
          <span className="max-w-32 text-right text-[11px] italic text-ink">
            {a.skills.length > 0 ? a.skills.join(", ") : "none"}
          </span>
        </div>
      </div>
    </Panel>
  )
}

/** The everyman pilgrim and a knight, as the HUD forecasts them. */
const PILGRIM_NERVE = nerve({ type: "pilgrim", piety: 50, stamina: 100 })
const KNIGHT_NERVE = nerve({ type: "knight", piety: 50, stamina: 100 })

/**
 * What the danger field says about the road and its tracks: the share of
 * pilgrims and knights forecast to walk each end to end, plus the danger of
 * whatever tile is under the cursor — the tuning readout for dark forests.
 */
function DangerForecast({ map }: { map: GameMap }) {
  const hovered = useCameraStore((s) => s.hovered)
  const danger = useMemo(() => computeDangerField(map), [map])
  const road = map.road ?? []
  const tracks = map.shortcuts ?? []
  const hoveredTerrain = hovered ? tileAt(map, hovered.x, hovered.z) : null
  const hoveredDanger = hovered && hoveredTerrain ? danger[hovered.z * map.width + hovered.x] : null

  const pct = (route: Array<{ x: number; z: number }>, nerveValue: number) =>
    `${Math.round(arrivalOdds(danger, map, route, nerveValue) * 100)}%`

  return (
    <div className="mt-2 border-t border-rule pt-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[11px] italic text-ink-light">Road, {road.length} tiles</span>
        <span className="font-display text-[10px] text-ink">
          {pct(road, PILGRIM_NERVE)} · {pct(road, KNIGHT_NERVE)}
        </span>
      </div>
      {tracks.map((track, index) => (
        <div key={index} className="flex items-baseline justify-between gap-4">
          <span className="text-[11px] italic text-ink-light">
            Track {index + 1}, {track.tiles.length} for {track.exit - track.entry + 1}
          </span>
          <span className="font-display text-[10px] text-red">
            {pct(track.tiles, PILGRIM_NERVE)} · {pct(track.tiles, KNIGHT_NERVE)}
          </span>
        </div>
      ))}
      <div className="text-[10px] italic text-ink-light">pilgrims · knights arriving</div>
      {hoveredTerrain && hoveredDanger !== null && (
        <div className="mt-1 flex items-baseline justify-between gap-4">
          <span className="text-[11px] italic text-ink-light">{TERRAIN[hoveredTerrain].label}</span>
          <span
            className={`font-display text-[10px] ${
              hoveredDanger >= DANGER_THRESHOLDS.dangerous ? "text-red" : "text-ink"
            }`}
          >
            {dangerLabel(hoveredDanger)}
          </span>
        </div>
      )}
    </div>
  )
}

/** What the monks keep in the hovel: the relic's name, nature, and pull. */
function RelicPanel({ relic }: { relic: Relic }) {
  const s = relic.stats
  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-4">
        <Label>Relic</Label>
        <button
          type="button"
          onClick={() => useCameraStore.getState().select(null)}
          aria-label="Dismiss relic"
          className="pointer-events-auto font-display text-[10px] text-ink-light hover:text-red"
        >
          ✕
        </button>
      </div>
      <div className="pt-1">
        <div className="font-display text-xs text-ink">{relicTitle(relic)}</div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 border border-rule"
            style={{ backgroundColor: relic.color }}
          />
          <span className="text-[13px] italic capitalize text-ink-light">{relic.kind}</span>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-0.5 border-t border-rule pt-2">
        <StatBar label="Sanctity" value={s.sanctity} />
        <StatBar label="Spectacle" value={s.spectacle} />
        <StatBar label="Doubt" value={s.doubt} />
        <StatBar label="Renown" value={s.renown} />
      </div>
    </Panel>
  )
}

/** The scene writes monk activities at frame rate; sample on the HUD's own schedule. */
function useMonkActivity(monkId: number): MonkActivity | null {
  const [activity, setActivity] = useState<MonkActivity | null>(null)
  useEffect(() => {
    const read = () => setActivity(monkRegistry.current?.get(monkId) ?? null)
    read()
    const timer = setInterval(read, 250)
    return () => clearInterval(timer)
  }, [monkId])
  return activity
}

/** One of the brothers: name, office, and what he brought with him. */
function MonkPanel({ monk }: { monk: Monk }) {
  const a = monk.attributes
  const activity = useMonkActivity(monk.id)
  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-4">
        <Label>Brother</Label>
        <button
          type="button"
          onClick={() => useCameraStore.getState().select(null)}
          aria-label="Dismiss monk"
          className="pointer-events-auto font-display text-[10px] text-ink-light hover:text-red"
        >
          ✕
        </button>
      </div>
      <div className="pt-1">
        <div className="font-display text-xs text-ink">{monk.name}</div>
        <div className="text-[13px] italic text-ink-light">
          {monk.duty}, {a.age} years
        </div>
        {activity && (
          <div className="text-[11px] italic text-gold">{MONK_ACTIVITY_LABELS[activity]}</div>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-0.5 border-t border-rule pt-2">
        <StatBar label="Piety" value={a.piety} />
      </div>

      <div className="mt-2 border-t border-rule pt-2">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[11px] italic text-ink-light">Skills</span>
          <span className="max-w-32 text-right text-[11px] italic text-ink">
            {a.skills.join(", ")}
          </span>
        </div>
      </div>
    </Panel>
  )
}

/**
 * The play-screen chrome: transparent header, one World panel of tuning knobs,
 * the inspector, and the minimap dock.
 *
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0 — HUD layout frame
 */
export function GameHud({
  map,
  seed,
  relic,
  monks,
  travelers,
  relicTraffic,
  settings,
  onSettingsChange,
  onReroll,
  onSeedChange,
}: {
  map: GameMap | null
  seed: number | null
  relic: Relic | null
  monks: Monk[]
  travelers: Traveler[]
  /** How many of the travelers turn aside for the relic. */
  relicTraffic: number
  settings: MapSettings
  onSettingsChange: (settings: MapSettings) => void
  onReroll: () => void
  onSeedChange: (seed: number) => void
}) {
  const set = (patch: Partial<MapSettings>) => onSettingsChange({ ...settings, ...patch })
  const selection = useCameraStore((s) => s.selection)
  const [menuOpen, setMenuOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    Seed: true,
    Forest: true,
    Relic: true,
    Road: true,
    Water: true,
  })
  const toggleSection = (title: string) =>
    setOpenSections((open) => ({ ...open, [title]: !open[title] }))
  const section = (title: string) => ({
    title,
    open: openSections[title] ?? true,
    onToggle: () => toggleSection(title),
  })

  const selectedTraveler =
    selection?.kind === "traveler" ? (travelers.find((t) => t.id === selection.id) ?? null) : null
  const selectedMonk =
    selection?.kind === "monk" ? (monks.find((m) => m.id === selection.id) ?? null) : null
  const selectedRelic = selection?.kind === "relic"

  return (
    <>
      {/* Header: title and version just right of the sidebar, menu on the right,
          no backing — it sits straight on the scene like a title card. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between py-4 pl-[244px] pr-4">
        <div className={`flex items-baseline gap-3 ${HEADER_TEXT_SHADOW}`}>
          <Link
            href="/"
            className="pointer-events-auto font-display text-sm font-bold tracking-[4px] text-parchment hover:text-gold-light"
          >
            PILGRIMAGE
          </Link>
          <span className="font-display text-[9px] uppercase tracking-[2px] text-parchment/80">
            {CURRENT_VERSION}
          </span>
        </div>

        <div className="relative flex items-center gap-2">
          <button type="button" onClick={onReroll} className={HEADER_BUTTON}>
            ✦ New Map
          </button>
          <MusicPlayer className={HEADER_BUTTON} />
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            className={HEADER_BUTTON}
          >
            ☰ Menu
          </button>
          {menuOpen && <MenuPanel />}
        </div>
      </header>

      {/* World: a full-height sidebar of tuning knobs, grouped under fold-away headers. */}
      <aside
        className={`pointer-events-auto absolute inset-y-0 left-0 z-10 flex w-[228px] flex-col overflow-y-auto border border-rule bg-parchment/95 px-2 py-3 ${PANEL_SHADOW}`}
      >
        <Section {...section("Seed")}>
          <SeedField seed={seed} onSeedChange={onSeedChange} />
          <Tuner
            label="Size"
            value={settings.size}
            display={String(settings.size)}
            min={MIN_MAP_SIZE}
            max={512}
            step={32}
            onChange={(size) => set({ size })}
          />
        </Section>

        <Section {...section("Forest")}>
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
            label="Dark forests"
            value={settings.darkForests}
            display={String(settings.darkForests)}
            min={0}
            max={4}
            onChange={(darkForests) => set({ darkForests })}
          />
        </Section>

        <Section {...section("Relic")}>
          {relic && (
            <div className="text-[11px] italic text-ink-light">{relicTitle(relic)}</div>
          )}
          <div className="flex items-baseline justify-between pb-1 text-[11px] text-ink-light">
            <span className="italic">Turn aside</span>
            <span className="font-display text-[10px] uppercase tracking-[1px]">
              {relicTraffic} of {travelers.length} folk
            </span>
          </div>
          <Tuner
            label="Distance"
            value={settings.relicDistance}
            display={String(settings.relicDistance)}
            min={6}
            max={72}
            onChange={(relicDistance) => set({ relicDistance })}
          />
        </Section>

        <Section {...section("Road")}>
          <Tuner
            label="Traffic"
            value={settings.traffic}
            display={String(settings.traffic)}
            min={0}
            max={60}
            onChange={(traffic) => set({ traffic })}
          />
          <Tuner
            label="Pace"
            value={settings.walkSpeed}
            display={settings.walkSpeed.toFixed(1)}
            min={0.2}
            max={5}
            step={0.1}
            onChange={(walkSpeed) => set({ walkSpeed })}
          />
          {map && <DangerForecast map={map} />}
          {/* Stand-in for progression: the road builds up as the pilgrimage grows. */}
          <Chooser
            label="Path"
            value={clampRoadTier(settings.road)}
            options={ROAD_TIERS.map((tier) => tier.label)}
            onChange={(road) => set({ road })}
          />
          {/* The surface's look, to explore: how solid, how dark, and the edge line. */}
          <Tuner
            label="Opacity"
            value={settings.roadOpacity}
            display={`${Math.round(settings.roadOpacity * 100)}%`}
            min={0}
            max={1}
            step={0.05}
            onChange={(roadOpacity) => set({ roadOpacity })}
          />
          <Tuner
            label="Shade"
            value={settings.roadShade}
            display={`${Math.round(settings.roadShade * 100)}%`}
            min={0.3}
            max={1.5}
            step={0.05}
            onChange={(roadShade) => set({ roadShade })}
          />
          <Tuner
            label="Edge line"
            value={settings.roadEdgeLine}
            display={settings.roadEdgeLine === 0 ? "None" : `${Math.round(settings.roadEdgeLine * 100)}%`}
            min={0}
            max={1}
            step={0.05}
            onChange={(roadEdgeLine) => set({ roadEdgeLine })}
          />
          <Tuner
            label="Edge width"
            value={settings.roadEdgeWidth}
            display={`${settings.roadEdgeWidth.toFixed(1)} px`}
            min={0.5}
            max={6}
            step={0.5}
            onChange={(roadEdgeWidth) => set({ roadEdgeWidth })}
          />
        </Section>

        <Section {...section("Water")}>
          <Tuner
            label="Coverage"
            value={settings.water}
            display={`${settings.water}%`}
            min={0}
            max={20}
            onChange={(water) => set({ water })}
          />
          <Tuner
            label="Rivers"
            value={settings.rivers}
            display={settings.rivers < 0 ? "Seeded" : String(settings.rivers)}
            min={-1}
            max={3}
            onChange={(rivers) => set({ rivers })}
          />
          <Tuner
            label="Lakes"
            value={settings.lakes}
            display={settings.lakes < 0 ? "Seeded" : String(settings.lakes)}
            min={-1}
            max={2}
            onChange={(lakes) => set({ lakes })}
          />
          <Tuner
            label="Ponds"
            value={settings.ponds}
            display={settings.ponds < 0 ? "Seeded" : String(settings.ponds)}
            min={-1}
            max={3}
            onChange={(ponds) => set({ ponds })}
          />
        </Section>
      </aside>

      {/* Inspector: whoever or whatever the player clicked, tucked against the sidebar. */}
      {selectedTraveler && (
        <div className="absolute bottom-0 left-[228px] z-10">
          <TravelerPanel traveler={selectedTraveler} />
        </div>
      )}
      {selectedMonk && (
        <div className="absolute bottom-0 left-[228px] z-10">
          <MonkPanel monk={selectedMonk} />
        </div>
      )}
      {selectedRelic && relic && (
        <div className="absolute bottom-0 left-[228px] z-10">
          <RelicPanel relic={relic} />
        </div>
      )}

      {/* Dock: the minimap in the bottom-right corner with the calendar above it. */}
      {map && (
        <div
          className={`pointer-events-none absolute bottom-0 right-0 z-10 flex flex-col gap-2 bg-parchment/95 px-4 pb-4 pt-3 ${PANEL_SHADOW}`}
        >
          <ClockPanel />
          <Minimap map={map} />
        </div>
      )}
    </>
  )
}
