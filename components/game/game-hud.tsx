"use client"

import { ELEVATION_CONTROLS, type ElevationSettings } from "@/lib/game/map/elevation"

import Link from "next/link"
import * as Tooltip from "@radix-ui/react-tooltip"
import { Menu, Settings, X } from "lucide-react"
import "./game-hud.css"
import { useEffect, useMemo, useState } from "react"
import { useBuildStore } from "@/lib/game/build-store"
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
import { ACTIVITY_LABELS, simRegistry, type SimTraveler } from "@/lib/game/sim"
import { useRelicProcessionStore } from "@/lib/game/relic-procession-store"
import { MONK_ACTIVITY_LABELS, monkRegistry, type Monk, type MonkActivity } from "@/lib/game/monks"
import { relicTitle, type Relic } from "@/lib/game/relic"
import { DEFAULT_TRAFFIC, type Traveler } from "@/lib/game/travelers"
import type { PixelationProps } from "@/components/pixel-canvas"

import type { MapSettings } from "./game-shell"
import { ResourceInspector } from "./resource-inspector"
import { Minimap } from "./minimap"
import { SettlementPanel } from "./settlement-panel"
import type { useSettlement } from "@/hooks/use-settlement"
import { individualRenown, relicRenown } from "@/lib/game/settlement"

import { buildCatalog, buildingIncomeLabel } from "@/lib/game/balance"
import { useBalanceStore } from "@/lib/game/balance-store"
import { MusicPlayer } from "./music-player"
import { Section, Tuner } from "./property-controls"
import { BuildControls, HudClock, HudHelp, HudResources } from "./hud-controls"

const CONTROLS: Array<[string, string]> = [
  ["Click", "Inspect people, trees & piles"],
  ["Drag", "Pan"],
  ["Scroll", "Zoom"],
  ["Q / E", "Rotate view"],
  ["W A S D", "Pan"],
  ["O", "Cycle outlines"],
  ["0", "Reset camera"],
  ["B / L", "Build menu / lumber camp"],
  ["Esc", "Close panel & cancel building"],
  ["Return", "Cheat code"],
]

const PANEL_SHADOW = "shadow-[0_2px_16px_rgba(0,0,0,0.6)]"

// Opt in per workspace; a production build must never expose the tuning UI.
const SHOW_PROPERTY_PANELS =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_PROPERTY_PANELS === "1"

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`hud-inspector-content border border-rule bg-parchment/95 px-4 py-3 ${className}`}>
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


function TrafficDensity({ value, travelerCount, onChange }: {
  value: number
  travelerCount: number
  onChange: (traffic: number) => void
}) {
  return (
    <>
      <Tuner
        label="Traffic density"
        value={value}
        display={`${Math.round((value / DEFAULT_TRAFFIC) * 100)}%`}
        min={0}
        max={60}
        onChange={onChange}
      />
      <p className="text-[11px] italic text-ink-light">
        {travelerCount} folk across the map.
      </p>
    </>
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
      className={`hud-menu pointer-events-auto absolute right-0 top-full mt-2 w-56 border border-rule bg-parchment/95 px-4 py-3 ${PANEL_SHADOW}`}
    >
      <nav className="flex flex-col gap-1.5">
        {SITE_MENU.map((item) => (
          <div key={item.href} className="flex flex-col gap-1">
            <Link
              href={item.href}
              target={item.href === "/tuning" ? "_blank" : undefined}
              rel={item.href === "/tuning" ? "noopener noreferrer" : undefined}
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
            {live.praying ? "Kneeling in prayer before the relic" : ACTIVITY_LABELS[live.activity]}
            {live.employer && " · Settler"}
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
        <StatBar label="Piety" value={Math.round(live?.piety ?? a.piety)} />
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
          <span className="font-display text-[10px] text-ink">{(live?.jobless ?? a.jobless) ? "Yes" : "No"}</span>
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

/** Live terrain measurements alongside the generation controls. */
function ElevationReadout({ map }: { map: GameMap }) {
  const hovered = useCameraStore((s) => s.hovered)
  if (!hovered || !map.elevation) return <p className="text-[10px] italic text-ink-light">Hover terrain to inspect height, slope, and water flow.</p>
  const i = hovered.z * map.width + hovered.x, e = map.elevation, water = map.water
  const wet = (water?.depth[i] ?? 0) > 0
  const values = wet ? [
    ["Water surface", water!.surface?.[i].toFixed(2)],
    ["River bed", e.height[i].toFixed(2)],
    ["Downstream drop", water!.drop?.[i].toFixed(3)],
    ["Water motion", water!.motion?.[i]],
  ] : [
    ["Elevation", `${e.height[i] >= 0 ? "+" : ""}${e.height[i].toFixed(2)}`],
    ["Steepest grade", `${Math.round(e.slope[i] * 100)}%`],
    ["Cliff edges", String(e.cliffs[i].toString(2).split("1").length - 1)],
  ]
  return <div className="mb-3 border-b border-rule pb-2 text-[10px] text-ink-light">
    <div className="mb-1">Tile {hovered.x}, {hovered.z}</div>
    {values.map(([label, value]) => <div key={label} className="flex justify-between gap-2"><span>{label}</span><span>{value}</span></div>)}
  </div>
}

/** What the monks keep in the hovel: the relic's name, nature, and pull. */
function RelicPanel({ relic }: { relic: Relic }) {
  const procession = useRelicProcessionStore()
  const balance = useBalanceStore((s) => s.balance)
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
        {procession.monkId !== null && <button type="button" className="hud-action mb-2"
          disabled={procession.returnRequested || procession.stage === "returning" || procession.stage === "lowering"}
          onClick={procession.returnRelic}>Return relic</button>}
        <StatBar label="Sanctity" value={s.sanctity} />
        <StatBar label="Spectacle" value={s.spectacle} />
        <StatBar label="Doubt" value={s.doubt} />
        <div className="mt-1 text-[11px] text-ink-light">Contributes +{relicRenown(relic, balance)} shrine renown</div>
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
  const balance = useBalanceStore((s) => s.balance)
  const a = monk.attributes
  const activity = useMonkActivity(monk.id)
  const procession = useRelicProcessionStore()
  const carryingRelic = procession.monkId === monk.id
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
        <div className="mt-1 text-[11px] text-ink-light">Contributes +{individualRenown(monk, balance)} shrine renown</div>
      </div>

      <div className="mt-2 border-t border-rule pt-2">
        <button type="button" className="hud-action" disabled={!procession.available || activity === "flying" ||
          (procession.monkId !== null && !carryingRelic) || (carryingRelic && (procession.returnRequested || procession.stage === "lowering" || procession.stage === "returning"))}
          onClick={() => carryingRelic ? procession.returnRelic() : procession.request(monk.id)}>
          {carryingRelic ? "Return relic" : "Carry relic in procession"}
        </button>
        <p className="mt-1 text-[11px] italic text-ink-light">Nearby folk kneel and pray. The relic returns to its table after the procession.</p>
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
 * Contextual game chrome: bottom-left actions and a shared minimap/selection dock on the right.
 * Build, world tuning, and object inspection open only when requested.
 *
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1SK-0 — nothing selected
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1GB-0 — Build open
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1N5-0 — hover details
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
  economy,
  pixelation,
  onPixelationChange,
  onReroll,
  onSeedChange,
}: {
  economy: ReturnType<typeof useSettlement>
  map: GameMap | null
  seed: number | null
  relic: Relic | null
  monks: Monk[]
  travelers: Traveler[]
  /** How many of the travelers turn aside for the relic. */
  relicTraffic: number
  settings: MapSettings
  onSettingsChange: (settings: MapSettings) => void
  pixelation: Required<PixelationProps>
  onPixelationChange: (patch: PixelationProps) => void
  onReroll: () => void
  onSeedChange: (seed: number) => void
}) {
  const set = (patch: Partial<MapSettings>) => onSettingsChange({ ...settings, ...patch })
  const selection = useCameraStore((s) => s.selection)
  const [menuOpen, setMenuOpen] = useState(false)
  const [panel, setPanel] = useState<"build" | "world" | "settlement" | null>(null)

  const closeBuild = () => {
    setPanel(null)
    economy.chooseBuild(null)
    document.getElementById("build-menu-button")?.focus()
  }
  const toggleBuild = () => {
    setPanel((current) => current === "build" ? null : "build")
    setMenuOpen(false)
    economy.chooseBuild(null)
    useCameraStore.getState().select(null)
  }

  useEffect(() => {
    if (!selection) return
    setPanel(null)
    economy.chooseBuild(null)
  }, [selection, economy.chooseBuild])

  useEffect(() => {
    // Dismiss stale placement UI; keep World open while its sliders rebuild the map.
    setPanel((current) => current === "build" ? null : current)
  }, [map?.road])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === "Escape") {
        setPanel(null)
        setMenuOpen(false)
        economy.chooseBuild(null)
        useCameraStore.getState().select(null)
        return
      }
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return
      if (event.key.toLowerCase() === "b" || event.key.toLowerCase() === "l") {
        event.preventDefault()
        useCameraStore.getState().select(null)
        setMenuOpen(false)
        if (event.key.toLowerCase() === "l") {
          setPanel("build")
          if (map) economy.chooseBuild("lumberCamp")
        } else {
          setPanel((current) => current === "build" ? null : "build")
          economy.chooseBuild(null)
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [map, economy.chooseBuild])
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    Seed: true,
    Pixelation: true,
    Forest: true,
    Relic: true,
    Road: true,
    Walking: true,
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
  const piles = useBuildStore((s) => s.piles)
  const selectedBuilding = selection?.kind === "building" ? map?.buildings.find((b) => b.id === selection.id) : null
  const selectedDefinition = buildCatalog(economy.balance).find((item) => item.id === selectedBuilding?.buildType)
  const storedWood = piles.reduce((sum, pile) => sum + (pile.campId === selectedBuilding?.id ? pile.wood : 0), 0)
  const selectedRelic = selection?.kind === "relic"

  return (
    <Tooltip.Provider delayDuration={180} skipDelayDuration={100}>
    <div className="game-hud">
      <div className="hud-frame" aria-hidden="true" />
      <header className="hud-header">
        <div className="hud-resource-bar">
          <HudResources economy={economy} settlers={economy.residents.length - monks.length} open={panel === "settlement"} onToggle={() => {
            setPanel((current) => current === "settlement" ? null : "settlement")
            setMenuOpen(false)
            economy.chooseBuild(null)
            useCameraStore.getState().select(null)
          }} />
          <Link href="/" className="hud-brand" title={`Pilgrimage ${CURRENT_VERSION}`}>Pilgrimage</Link>
        </div>
        <div className="hud-header-right">
        <div className="hud-header-actions">
          <MusicPlayer className="hud-header-button" compact />
          <button type="button" className="hud-header-button" aria-label="World settings" title="World settings"
            aria-expanded={panel === "world"} aria-controls="world-settings" onClick={() => {
              setPanel((current) => current === "world" ? null : "world")
              setMenuOpen(false)
              economy.chooseBuild(null)
              useCameraStore.getState().select(null)
            }}><Settings size={16} /></button>
          <button type="button" className="hud-header-button" aria-label="Menu" title="Menu"
            aria-expanded={menuOpen} onClick={() => {
              setMenuOpen((open) => !open)
              setPanel(null)
              economy.chooseBuild(null)
            }}><Menu size={16} /></button>
          {menuOpen && <MenuPanel />}
        </div>
        <HudClock />
        </div>
      </header>
      <HudHelp content={<><div className="hud-help-title">Traffic density</div><p>{travelers.length} folk across the map.</p></>}>
        <section className="hud-traffic" aria-label="Traffic">
          <label htmlFor="traffic-density">Traffic</label>
          <input id="traffic-density" type="range" aria-label="Traffic density" min={0} max={60} step={1} value={settings.traffic} onChange={(event) => set({ traffic: Number(event.target.value) })} />
          <output htmlFor="traffic-density">{Math.round(settings.traffic / DEFAULT_TRAFFIC * 100)}%</output>
        </section>
      </HudHelp>

      {panel === "world" && <aside id="world-settings" className="hud-world hud-well" aria-label="World settings">
        <div className="hud-world-heading"><span>World</span><button type="button" aria-label="Close world settings" onClick={() => setPanel(null)}><X size={16} /></button></div>
        <div className="mb-4"><HudButton onClick={onReroll}>✦ New Map</HudButton></div>
        {SHOW_PROPERTY_PANELS && <>
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

        <Section {...section("Pixelation")}>
          <Chooser
            label="Look"
            value={pixelation.pixelated ? 1 : 0}
            options={["Original", "Pixelated"]}
            onChange={(value) => onPixelationChange({ pixelated: value === 1 })}
          />
          {pixelation.pixelated && (
            <>
              <Tuner
                label="Detail"
                value={pixelation.pixelsPerUnit}
                display={String(pixelation.pixelsPerUnit)}
                min={1}
                max={64}
                showHandle
                onChange={(pixelsPerUnit) => onPixelationChange({ pixelsPerUnit })}
              />
              <p className="text-[11px] italic text-ink-light">Less detail makes larger pixels.</p>
              <Tuner
                label="Edges"
                value={pixelation.outputDpr}
                display={`${pixelation.outputDpr.toFixed(1)}×`}
                min={0.5}
                max={2}
                step={0.5}
                showHandle
                onChange={(outputDpr) => onPixelationChange({ outputDpr })}
              />
              <p className="text-[11px] italic text-ink-light">Higher gives finer edges while zooming.</p>
            </>
          )}
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
            <span className="italic">Initial visit forecast</span>
            <span className="font-display text-[10px] uppercase tracking-[1px]">
              {relicTraffic} of {travelers.length} folk
            </span>
          </div>
          <p className="mb-2 text-[11px] italic text-ink-light">The brothers offer free food, drink, lodging and blessings. Hungry, thirsty and tired folk seek their care.</p>
          <Tuner
            label="Distance"
            value={settings.relicDistance}
            display={String(settings.relicDistance)}
            min={6}
            max={72}
            onChange={(relicDistance) => set({ relicDistance })}
          />
        </Section>

        <Section {...section("Walking")}>
          <Chooser label="Timing" value={settings.walkSync ? 0 : 1}
            options={["Match travel", "Fixed FPS"]} onChange={(index) => set({ walkSync: index === 0 })} />
          <Tuner
            label="Pace"
            value={settings.walkSpeed}
            display={settings.walkSpeed.toFixed(2)}
            min={0.1}
            max={5}
            step={0.01}
            onChange={(walkSpeed) => set({ walkSpeed })}
          />
          <Tuner
            label="Anim FPS"
            value={settings.characterFps}
            display={`${settings.characterFps} fps`}
            min={1}
            max={24}
            onChange={(characterFps) => set({ characterFps })}
          />
          <Tuner label="Stride" value={settings.stride} display={`${settings.stride.toFixed(2)} tiles`}
            min={0.15} max={1.2} step={0.01} onChange={(stride) => set({ stride })} />
          <p className="py-1 text-[11px] leading-relaxed text-ink-light">{settings.walkSync ?
            "Pace and stride scale with each person’s size and step reach. Stride is tiles per two steps at the reference size. Match travel keeps feet in time with movement; FPS controls other activities." :
            "FPS sets the walk cadence directly. Switch to Match travel to use Stride."}</p>
          <Tuner label="Variation" value={settings.paceVariation} display={`${Math.round(settings.paceVariation * 100)}%`}
            min={0} max={0.4} step={0.01} onChange={(paceVariation) => set({ paceVariation })} />
          <Tuner label="Path ease" value={settings.pathEase} display={`${Math.round(settings.pathEase * 100)}%`}
            min={0} max={1} step={0.05} onChange={(pathEase) => set({ pathEase })} />
          <Tuner label="Accel" value={settings.acceleration} display={`${settings.acceleration.toFixed(2)} s`}
            min={0} max={1.5} step={0.05} onChange={(acceleration) => set({ acceleration })} />
          <p className="py-1 text-[11px] leading-relaxed text-ink-light">Variation adds a personal rhythm. Path ease softens corners and camp arrivals. Accel smooths starts and pace changes.</p>
        </Section>

        <Section {...section("Road")}>
          <Chooser
            label="Models"
            value={settings.characterModel === "base" ? 0 : 1}
            options={["Base person", "Character drafts"]}
            onChange={(index) => set({ characterModel: index === 0 ? "base" : "callings" })}
          />
          <Tuner
            label="Base size"
            value={settings.baseSize}
            display={`${Math.round(settings.baseSize * 100)}%`}
            min={0.5}
            max={4}
            step={0.05}
            onChange={(baseSize) => set({ baseSize })}
          />
          <Tuner
            label="Draft size"
            value={settings.draftSize}
            display={`${Math.round(settings.draftSize * 100)}%`}
            min={0.5}
            max={4}
            step={0.05}
            onChange={(draftSize) => set({ draftSize })}
          />
          <TrafficDensity value={settings.traffic} travelerCount={travelers.length} onChange={(traffic) => set({ traffic })} />
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

        <Section {...section("Elevation")}>
          {map && <ElevationReadout map={map} />}
          {(Object.keys(ELEVATION_CONTROLS) as (keyof ElevationSettings)[]).map((key) => {
            const control = ELEVATION_CONTROLS[key]
            const value = settings.elevation[key] ?? control.value
            return <Tuner key={key} label={control.label} value={value}
              display={String(Number(value.toFixed(3)))}
              min={control.min} max={control.max} step={control.step}
              onChange={(value) => set({ elevation: { ...settings.elevation, [key]: value } })} />
          })}
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
        </>}
      </aside>}

      <BuildControls economy={economy} open={panel === "build"} onToggle={toggleBuild} onClose={closeBuild} />
      {map && <aside className="hud-details-dock hud-well" aria-label="Minimap and selection" data-selected={!!selection || panel === "settlement"}>
        {panel === "settlement" && <div className="hud-inspector" id="settlement-details">
          <SettlementPanel economy={economy} monks={monks} relic={relic} onClose={() => setPanel(null)} />
        </div>}
        {selection && <div className="hud-inspector" aria-label="Selection details">
          {(selection.kind === "tree" || selection.kind === "pile") && <ResourceInspector selection={selection} />}
          {selectedBuilding && (
            <Panel>
            <div className="flex items-center justify-between gap-4"><Label>{selectedDefinition?.category === "scenery" ? "Scenery" : "Building"}</Label><button type="button" aria-label="Dismiss building" onClick={() => useCameraStore.getState().select(null)} className="pointer-events-auto text-xs text-ink-light">✕</button></div>
            <p className="mt-1 font-display text-xs text-ink">{selectedBuilding.label}</p>
            {selectedBuilding.id === map?.site?.hovelId && (
              <div className="mt-3 flex flex-col gap-1.5">
                <label htmlFor="shrine-admission" className="text-[11px] text-ink-light">Admission · gold per visitor</label>
                <input id="shrine-admission" type="number" min={0} step={1}
                  value={economy.settlement.shrineAdmission}
                  onChange={event => economy.setShrineAdmission(event.target.valueAsNumber)}
                  className="pointer-events-auto w-24 border border-rule bg-parchment px-2 py-1 text-[13px] text-ink outline-none focus:border-gold" />
                <p className="max-w-56 text-[11px] text-ink-light">Paid on entry. Only paying visitors gain piety. Set 0 for free entry without a piety reward.</p>
                <p className="text-[11px] text-ink-light">Collected · {economy.settlement.collectedAdmission} gold</p>
              </div>
            )}
            {selectedBuilding.buildType === "lumberCamp" && (
              <p className="mt-2 text-[11px] text-ink"><span className="text-ink-light">Stored wood</span> · {storedWood} wood</p>
            )}
            {selectedDefinition && <>
              <p className="mt-2 text-[11px] text-ink-light">Contributes +{selectedDefinition.renown} shrine renown</p>
              <p className="mt-1 max-w-56 text-[11px] italic text-ink-light">{selectedDefinition.description}</p>
              <p className="mt-1 text-[11px] text-ink-light">{buildingIncomeLabel(selectedDefinition, economy.balance)}</p>
            </>}
          </Panel>
          )}
          {selectedTraveler && <TravelerPanel traveler={selectedTraveler} />}
          {selectedMonk && <MonkPanel monk={selectedMonk} />}
          {selectedRelic && relic && <RelicPanel relic={relic} />}
        </div>}
        <div className="hud-minimap">
          <Minimap map={map} />
          <span className="hud-minimap-north" aria-hidden="true">N ↑</span>
        </div>
      </aside>}
    </div>
    </Tooltip.Provider>
  )
}
