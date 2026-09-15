"use client"

import { ThemeToggle } from "../chrome-provider"

import { ChromeSelect, ChromeButton } from "@/components/ui/chrome-controls"
import { AppearancePanel } from "./appearance-panel"
import { PlayerColorPicker } from "./player-color"

import { isChapel } from "@/lib/game/shrine-layout"
import { CHURCH_COST, CHURCH_RENOWN_BONUS, CHAPEL_MONKS, CHURCH_MONKS } from "@/lib/game/shrine-upgrade"
import { isComplete, isHouse, isMonkShelter } from "@/lib/game/construction"
import { BUILDING_KINDS, buildingKind } from "@/lib/game/buildings"
import { housingBeds, housingCapacity, monkBeds } from "@/lib/game/housing"
import { FOOD_TYPES, FOOD_LABELS, STOREHOUSE_FOOD_CAPACITY, emptyFoodStock, storedFood } from "@/lib/game/storage"

import { ELEVATION_CONTROLS, type ElevationSettings } from "@/lib/game/map/elevation"

import Link from "next/link"
import { Tooltip } from "@base-ui/react/tooltip"
import { ArrowLeft, ChevronRight, Dices, Menu, Settings, X } from "lucide-react"
import "./game-hud.css"
import { useEffect, useId, useMemo, useState } from "react"
import { useBuildStore } from "@/lib/game/build-store"
import { useCameraStore } from "@/lib/game/camera-store"
import { useVoiceSubtitleStore } from "@/lib/game/voice-subtitle-store"
import {
  arrivalOdds,
  computeDangerField,
  DANGER_THRESHOLDS,
  dangerLabel,
} from "@/lib/game/map/danger"
import { clampRoadTier, ROAD_TIERS } from "@/lib/game/map/road"
import { TERRAIN } from "@/lib/game/map/terrain"
import { tileAt, type BuildingDef, type GameMap } from "@/lib/game/map/types"
import { nerve } from "@/lib/game/route-choice"
import { CHANGELOG, CURRENT_VERSION } from "@/lib/changelog"
import { SITE_MENU } from "@/lib/site-menu"
import { ACTIVITY_LABELS, BEGGAR_RECOVERY_GOLD, simRegistry, type SimTraveler } from "@/lib/game/sim"
import { useRelicProcessionStore } from "@/lib/game/relic-procession-store"
import { MONK_TIRED_AT } from "@/lib/game/monk-work"
import { useMonkEvangelismStore } from "@/lib/game/monk-evangelism-store"
import { MONK_ACTIVITY_LABELS, monkStaminaRegistry, monkRegistry, monkPositionRegistry, type Monk, type MonkActivity } from "@/lib/game/monks"
import { relicTitle, type Relic } from "@/lib/game/relic"
import { DEFAULT_TRAFFIC, MAX_TRAFFIC, type Traveler } from "@/lib/game/travelers"
import type { PixelationProps } from "@/components/pixel-canvas"

import type { MapSettings } from "./game-shell"
import { AnimalInspector } from "./animal-inspector"
import { FollowButton } from "./follow-button"
import { ResourceInspector } from "./resource-inspector"
import { Minimap } from "./minimap"
import { SettlementPanel } from "./settlement-panel"
import type { useSettlement } from "@/hooks/use-settlement"
import { demolitionTargets, individualRenown, relicRenown } from "@/lib/game/settlement"
import { DemolishBuildingDialog } from "./demolish-building-dialog"

import { buildCatalog, buildingIncomeLabel } from "@/lib/game/balance"
import { useBalanceStore } from "@/lib/game/balance-store"
import { SceneAudioLifecycle } from "@/components/scene-audio-lifecycle"
import { MusicPlayer } from "./music-player"
import { HudButton } from "./hud-button"
import { BugReportDialog } from "./bug-report-dialog"
import { MapSizeControl } from "./map-size-control"
import { NewMapDialog, type NewWorld } from "./new-map-dialog"
import { randomSeed } from "@/lib/game/rng"
import { NewWorldFields } from "./new-world-fields"
import { SeedField } from "./seed-field"
import { Switch } from "@/components/ui/switch"
import { browserDiagnostics, diagnosticsSchema, type BugReportDiagnostics } from "@/lib/bug-report"
import { useBugReportRuntime } from "@/hooks/use-bug-report-runtime"
import { useSimulationStore } from "@/lib/game/simulation-store"
import { DEFAULT_SCENE_VISIBILITY, VISIBILITY_TOGGLES } from "@/lib/game/scene-visibility"
import { Section, Tuner } from "./property-controls"
import { BuildControls, HudClock, HudResources } from "./hud-controls";

const CONTROLS: Array<[string, string]> = [
  ["Tap / click", "Inspect people, trees & piles"],
  ["Drag", "Pan"],
  ["Pinch / scroll", "Zoom"],
  ["Q / E", "Rotate view"],
  ["W A S D", "Pan"],
  ["O", "Cycle outlines"],
  ["0", "Reset camera"],
  ["B / L", "Build menu / woodcutter’s hut"],
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
        max={MAX_TRAFFIC}
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
  labelClassName = "w-16",
}: {
  label: string
  value: number
  options: string[]
  onChange: (index: number) => void
  labelClassName?: string
}) {
  return (
    <div className="flex items-center">
      <span className={`${labelClassName} shrink-0 text-[13px] font-medium text-ink-light`}>{label}</span>
      <div className="hud-choice-track relative h-8 flex-1 rounded-[6px] bg-parchment-dark">
        <span className="absolute inset-x-1.5 top-1/2 -translate-y-1/2 truncate font-display text-[11px] font-black text-ink-light">
          {options[value]}
        </span>
        <ChromeSelect
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
        </ChromeSelect>
      </div>
    </div>
  )
}

/** An on/off preference as the shared switch, recoloured for the HUD's dark parchment. */
function ToggleRow({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="hud-switch-row flex items-center justify-between gap-3 py-0.5">
      <label htmlFor={id} className={`text-[13px] font-medium text-ink-light ${disabled ? "opacity-50" : ""}`}>{label}</label>
      <Switch id={id} className="hud-switch" checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

/** Top-level navigation, folded into the play view. Controls live in here too. */
function MenuPanel({ onClose, playing, playerColor, onColorChange }: { onClose: () => void; playing: boolean; playerColor: string; onColorChange: (color: string) => void }) {
  const [showControls, setShowControls] = useState(false)

  return (
    <div
      className={`hud-menu pointer-events-auto absolute right-0 top-full mt-2 w-56 border border-rule bg-parchment/95 px-4 py-3 ${PANEL_SHADOW}`}
    >
      <div className="hud-world-heading"><span>Menu</span><ChromeButton type="button" className="hud-close" aria-label="Close menu" onClick={onClose}><X size={16} /></ChromeButton></div>
      <div className="mb-3 border-b border-rule pb-3"><PlayerColorPicker value={playerColor} onChange={onColorChange} /></div>
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
        {playing && <ChromeButton
          type="button"
          onClick={() => setShowControls((open) => !open)}
          aria-expanded={showControls}
          className="text-left font-display text-[11px] uppercase tracking-[2px] text-ink hover:text-red"
        >
          Controls {showControls ? "▾" : "▸"}
        </ChromeButton>}
        {playing && <ChromeButton type="button" onClick={() => { useCameraStore.getState().reset(); onClose() }}
          className="text-left font-display text-[11px] uppercase tracking-[2px] text-ink hover:text-red">Reset camera</ChromeButton>}
        {playing && showControls && (
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
function TravelerPanel({ traveler, travelers, map, monk }: { traveler: Traveler; travelers: Traveler[]; map: GameMap | null; monk?: Monk }) {
  const a = traveler.attributes
  const live = useLiveStats(traveler.id)
  const sim = simRegistry.current
  const party = live?.partyId === undefined ? undefined : sim?.parties.get(live.partyId)
  const companions = traveler.party ? travelers.filter(t => t.party?.id === traveler.party!.id) : []
  const [view, setView] = useState<"party" | "members" | "person">(monk ? "person" : traveler.party ? "party" : "person")
  useEffect(() => { setView(monk ? "person" : traveler.party ? "party" : "person") }, [traveler.party?.id])
  const waitingLabel = live?.partyGathering?.back ? "Rejoining the company"
    : party?.gathering ? `${live?.partyGathering?.arrived ? "Waiting for" : "Joining"} companions · ${party.gathering.label}`
    : "Waiting for companions"
  const focusParty = () => {
    const members = party?.members.flatMap(id => sim?.travelers.get(id) ? [sim.travelers.get(id)!] : []) ?? []
    if (!members.length) return
    const minX = Math.min(...members.map(s => s.x)), maxX = Math.max(...members.map(s => s.x))
    const minZ = Math.min(...members.map(s => s.z)), maxZ = Math.max(...members.map(s => s.z))
    const camera = useCameraStore.getState()
    camera.panTo((minX + maxX) / 2, (minZ + maxZ) / 2)
    camera.zoomBy(Math.max(12, Math.hypot(maxX - minX, maxZ - minZ) + 8) / camera.viewSize)
  }
  const named = (id: string | null | undefined) => map?.buildings.find(b => b.id === id)?.label
  // The barks are in Old English and Latin, so the panel carries the meaning.
  const spokenLine = useVoiceSubtitleStore(s => s.travelerId === traveler.id ? s.line : null)
  if (monk && view === "person") return <MonkPanel monk={monk} onBack={() => setView("members")} />
  if (companions.length > 0 && view !== "person") return <Panel>
    <div className="flex items-center justify-between gap-2">
      {view === "members" ? <ChromeButton className="chrome-back" onClick={() => setView("party")}><ArrowLeft size={14} />Party</ChromeButton> : <Label>Travel party</Label>}
      <ChromeButton className="chrome-icon-button" aria-label="Dismiss party" onClick={() => useCameraStore.getState().select(null)}><X size={14} /></ChromeButton>
    </div>
    <h2 className="page-title hud-selection-name">{view === "members" ? "Party members" : traveler.party!.name}</h2>
    {view === "party" ? <>
      <p className="text-xs text-ink-light">{party?.members.length ?? companions.length} members{party ? ` · ${party.reason}` : " · Former companions"}</p>
      <div className="mt-3 flex gap-2"><FollowButton subject="party" />{party && <ChromeButton className="hud-action" onClick={focusParty}>Find party</ChromeButton>}</div>
      <ChromeButton className="chrome-nav-row mt-3" onClick={() => setView("members")}><span>Members</span><ChevronRight size={14} /></ChromeButton>
    </> : <nav className="hud-party-members" aria-label="Party members">{companions.map(person => {
      const state = sim?.travelers.get(person.id), monk = sim?.joinedMonks.get(person.id)
      return <ChromeButton key={person.id} className="chrome-nav-row" onClick={() => {
        setView("person")
        const camera = useCameraStore.getState()
        camera.select(monk ? {kind:"monk",id:monk.id} : {kind:"traveler",id:person.id})
        if (state) camera.panTo(state.x,state.z)
      }}><span><span className="page-title hud-party-member-name">{person.name}</span><small>{monk || state?.home || state?.employer ? "Settled" : state?.partyWaiting ? "Waiting" : person.type.label}</small></span><ChevronRight size={14} /></ChromeButton>
    })}</nav>}
  </Panel>
  return (
    <Panel>
      <div className="flex items-center justify-between gap-4">
        {companions.length > 0 ? <ChromeButton className="chrome-back" onClick={() => setView("members")}><ArrowLeft size={14} />Members</ChromeButton> : <Label>Traveler</Label>}
        <div className="flex items-center gap-2">
          <FollowButton subject="traveler" />
          <ChromeButton
            type="button"
            onClick={() => useCameraStore.getState().select(null)}
            aria-label="Dismiss traveler"
            className="pointer-events-auto font-display text-[10px] text-ink-light hover:text-red"
          >
            ✕
          </ChromeButton>
        </div>
      </div>
      <div className="pt-1">
        <h2 className="page-title hud-selection-name">{traveler.name}</h2>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 border border-rule"
            style={{ backgroundColor: traveler.type.color }}
          />
          <span className="text-[13px] italic text-ink-light">
            {live?.beggar ? `Beggar · ${traveler.type.label}` : traveler.type.label}, {a.age} years
          </span>
        </div>
        {live && (
          <div className="text-[11px] italic text-gold">
            {live.praying ? "Kneeling in prayer before the relic" : live.partyWaiting ? waitingLabel : ACTIVITY_LABELS[live.activity]}
            {(live.employer || live.home) && " · Settler"}
            {live.track && " · on the dark track"}
          </div>
        )}
        {spokenLine && (
          <div className="pt-0.5 text-[11px] text-ink" aria-live="polite">
            <span className="italic">&ldquo;{spokenLine.text}&rdquo;</span>
            <span className="text-ink-light"> · {spokenLine.gloss}</span>
          </div>
        )}
        {live?.beggar && <div className="text-[11px] italic text-ink-light">Needs {BEGGAR_RECOVERY_GOLD} gold to return to their calling</div>}
        {live?.employer && (
          <div className="text-[11px] text-ink-light">
            Works at {named(live.employer) ?? "a settlement building"}
            {live.home ? ` · lives at ${named(live.home) ?? "a house"}` : " · no house yet"}
          </div>
        )}
        {live?.home && !live.employer && <div className="text-[11px] text-ink-light">Lives at {named(live.home) ?? "a house"} · Looking for work</div>}

      </div>

      <div className="mt-2 flex flex-col gap-0.5 border-t border-rule pt-2">
        <StatBar label="Piety" value={Math.round(live?.piety ?? a.piety)} />
        <StatBar label="Happiness" value={Math.round(live?.happiness ?? a.happiness)} />
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
        <ChromeButton
          type="button"
          onClick={() => useCameraStore.getState().select(null)}
          aria-label="Dismiss relic"
          className="pointer-events-auto font-display text-[10px] text-ink-light hover:text-red"
        >
          ✕
        </ChromeButton>
      </div>
      <div className="pt-1">
        <h2 className="page-title hud-selection-name">{relicTitle(relic)}</h2>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 border border-rule"
            style={{ backgroundColor: relic.color }}
          />
          <span className="text-[13px] italic capitalize text-ink-light">{relic.kind}</span>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-0.5 border-t border-rule pt-2">
        {procession.monkId !== null && <ChromeButton type="button" className="hud-action mb-2"
          disabled={procession.returnRequested || procession.stage === "returning" || procession.stage === "lowering"}
          onClick={procession.returnRelic}>Return relic</ChromeButton>}
        <StatBar label="Sanctity" value={s.sanctity} />
        <StatBar label="Spectacle" value={s.spectacle} />
        <StatBar label="Doubt" value={s.doubt} />
        <div className="mt-1 text-[11px] text-ink-light">Contributes +{relicRenown(relic, balance)} shrine renown</div>
      </div>
    </Panel>
  )
}

function ConstructionStatus({ building }: { building: BuildingDef }) {
  const read = () => building.construction ? Math.round(100 * building.construction.work / building.construction.required) : 100
  const [progress, setProgress] = useState(read)
  useEffect(() => {
    setProgress(read())
    const timer = setInterval(() => setProgress(read()), 250)
    return () => clearInterval(timer)
  }, [building])
  if (progress >= 100) return null
  return <div className="mt-2">
    <StatBar label="Construction" value={progress} />
    <p className="mt-1 max-w-56 text-[11px] italic text-ink-light">Anyone at the enclave with hands free helps raise this, the trades fastest and the brothers slowest. Benefits begin when construction finishes.</p>
  </div>
}

/** Sample the brothers' live activity and piety on the HUD's own schedule. */
function useMonkLiveState(monkId: number) {
  const [live, setLive] = useState<{ activity: MonkActivity | null; piety?: number; happiness?: number }>({ activity: null })
  useEffect(() => {
    const read = () => setLive({ activity: monkRegistry.current?.get(monkId) ?? null, piety: monkPositionRegistry.current?.get(monkId)?.piety, happiness: monkPositionRegistry.current?.get(monkId)?.happiness })
    read()
    const timer = setInterval(read, 250)
    return () => clearInterval(timer)
  }, [monkId])
  return live
}

/** One of the brothers: name, office, and what he brought with him. */
function MonkPanel({ monk, onBack }: { monk: Monk; onBack?: () => void }) {
  const balance = useBalanceStore((s) => s.balance)
  const a = monk.attributes
  const { activity, piety, happiness } = useMonkLiveState(monk.id)
  const [stamina, setStamina] = useState(100)
  useEffect(() => {
    const read = () => setStamina(monkStaminaRegistry.current?.get(monk.id) ?? 100)
    read()
    const timer = setInterval(read, 250)
    return () => clearInterval(timer)
  }, [monk.id])
  const procession = useRelicProcessionStore()
  const carryingRelic = procession.monkId === monk.id
  const evangelism = useMonkEvangelismStore()
  const evangelizing = evangelism.assigned.has(monk.id)
  return (
    <Panel>
      <div className="flex items-center justify-between gap-4">
        {onBack ? <ChromeButton className="chrome-back" onClick={onBack}><ArrowLeft size={14} />Members</ChromeButton> : <Label>Brother</Label>}
        <div className="flex items-center gap-2">
          <FollowButton subject="monk" />
          <ChromeButton
            type="button"
            onClick={() => useCameraStore.getState().select(null)}
            aria-label="Dismiss monk"
            className="pointer-events-auto font-display text-[10px] text-ink-light hover:text-red"
          >
            ✕
          </ChromeButton>
        </div>
      </div>
      <div className="pt-1">
        <h2 className="page-title hud-selection-name">{monk.name}</h2>
        <div className="text-[13px] italic text-ink-light">
          {monk.duty}, {a.age} years
        </div>
        {activity && (
          <div className="text-[11px] italic text-gold">{evangelizing && activity === "sleeping" ? "Sleeping on an evangelism mission" : MONK_ACTIVITY_LABELS[activity]}</div>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-0.5 border-t border-rule pt-2">
        <StatBar label="Piety" value={Math.round(piety ?? a.piety)} />
        <StatBar label="Happiness" value={Math.round(happiness ?? a.happiness)} />
        <StatBar label="Stamina" value={Math.round(stamina)} />
        <div className="mt-1 text-[11px] text-ink-light">Contributes +{individualRenown(monk, balance)} shrine renown</div>
      </div>

      <div className="mt-2 border-t border-rule pt-2">
        <ChromeButton type="button" className="hud-action" title="Preach on the main road for up to three days, or recall earlier. Nearby travelers gain an extra chance to visit the relic."
          disabled={monk.duty === "Keeper of the Relic" || !evangelizing && (!evangelism.available || carryingRelic || activity === "flying" || stamina <= MONK_TIRED_AT)}
          onClick={() => evangelizing ? evangelism.recall(monk.id) : evangelism.request(monk.id)}>
          {evangelizing ? "Recall from preaching" : "Evangelize on the main road"}
        </ChromeButton>
      </div>

      <div className="mt-2 border-t border-rule pt-2">
        <ChromeButton type="button" className="hud-action" title="Carry the relic to the main road. Nearby travelers gain piety once per procession." disabled={monk.duty === "Keeper of the Relic" || !procession.available || evangelizing || activity === "toEvangelize" || activity === "preaching" || activity === "flying" ||
          (procession.monkId !== null && !carryingRelic) || (carryingRelic && (procession.returnRequested || procession.stage === "lowering" || procession.stage === "returning"))}
          onClick={() => carryingRelic ? procession.returnRelic() : procession.request(monk.id)}>
          {carryingRelic ? "Return relic" : "Carry relic in procession"}
        </ChromeButton>
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
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/D4R-0 — Proposed refined game HUD
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/D7K-0 — Proposed refined building placement
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/DC0-0 — Proposed refined building selection
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/DFN-0 — Proposed light game HUD
 */
export function GameHud({
  playing,
  starting,
  canStart,
  onPlay,
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
  onNewMap,
  onSeedChange,
  cheats,
  continueHref = null,
}: {
  playing: boolean
  /** Where the saved world resumes, when this browser has one; shown on the landing page. */
  continueHref?: string | null
  starting: boolean
  canStart: boolean
  onPlay: () => void
  cheats: { blasterPastor: boolean; lastMarch: boolean; masterBuilder: boolean }
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
  /** Replace the current map with a fresh world of this size and seed. */
  onNewMap: (world: NewWorld) => void
  onSeedChange: (seed: number) => void
}) {
  const [seedValid, setSeedValid] = useState(true)
  const readRuntime = useBugReportRuntime()
  const [report, setReport] = useState<BugReportDiagnostics | null>(null)
  const [reportError, setReportError] = useState("")
  function openBugReport() {
    const build = useBuildStore.getState()
    const buildings = map?.buildings ?? []
    const snapshot = diagnosticsSchema.safeParse({
      version: CHANGELOG[0].version,
      environment: process.env.NODE_ENV === "development" ? "development" : "production",
      ...readRuntime(),
      ...browserDiagnostics(navigator.userAgent, window.innerWidth),
      seed, settings, pixelation,
      camera: useCameraStore.getState(),
      simulation: { ...useSimulationStore.getState(), time: build.simulation?.time ?? build.time },
      population: { travelers: travelers.length, monks: monks.length, residents: economy.residents.length, relicTraffic },
      settlement: { ...economy.settlement.resources, visits: economy.visits,
        shrineAdmission: economy.settlement.shrineAdmission, felledTrees: build.felled.size, woodPiles: build.piles.length },
      buildings: buildings.slice(0, 100).map(building => ({
        x: building.x, z: building.z, w: building.w, d: building.d, rotation: building.rotation ?? 0,
        type: !building.buildType ? "founding"
          : ["shelter", "monk-shelter", "workshop", "garden", "cross", "hall", "storehouse"].includes(building.buildType) ? building.buildType : "other",
        construction: building.construction ?? null,
      })),
      omittedBuildings: Math.max(0, buildings.length - 100),
      cheats,
    })
    if (!snapshot.success) {
      setReportError("Session diagnostics could not be captured. Try opening the report again after the map has loaded.")
      return
    }
    setReportError("")
    setReport(snapshot.data)
  }
  const set = (patch: Partial<MapSettings>) => onSettingsChange({ ...settings, ...patch })
  const selection = useCameraStore((s) => s.selection)
  const [menuOpen, setMenuOpen] = useState(false)
  const [minimapOpen, setMinimapOpen] = useState(false)
  const [panel, setPanel] = useState<"build" | "world" | "settlement" | null>(null)

  const toggleBuild = () => {
    setPanel((current) => current === "build" ? null : "build")
    setMenuOpen(false)
    economy.chooseBuild(null)
    useCameraStore.getState().select(null)
  }

  useEffect(() => {
    if (!selection) return
    setPanel(current => SHOW_PROPERTY_PANELS && current === "world" ? current : null)
    economy.chooseBuild(null)
  }, [selection, economy.chooseBuild])

  useEffect(() => {
    // Dismiss stale placement UI; keep World open while its sliders rebuild the map.
    setPanel((current) => current === "build" ? null : current)
  }, [map?.road])

  useEffect(() => {
    if (!playing) return
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
          if (map) economy.chooseBuild("workshop")
        } else {
          setPanel((current) => current === "build" ? null : "build")
          economy.chooseBuild(null)
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [map, economy.chooseBuild, playing])
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
  const selectedPartyMember = selectedTraveler ?? (selectedMonk ? travelers.find(t => t.id === selectedMonk.id && t.party) : undefined)
  const piles = useBuildStore((s) => s.piles)
  const selectedBuilding = selection?.kind === "building" ? map?.buildings.find((b) => b.id === selection.id) : null
  const demolition = map && selectedBuilding ? demolitionTargets(map, selectedBuilding.id) : []
  const selectedDefinition = buildCatalog(economy.balance).find((item) => item.id === selectedBuilding?.buildType)
  const foodStores = useBuildStore(s => s.foodStores)
  const foodStock = foodStores.get(selectedBuilding?.id ?? "") ?? emptyFoodStock()
  const storedWood = piles.reduce((sum, pile) => sum + (pile.campId === selectedBuilding?.id ? pile.wood : 0), 0)
  // Live occupancy of the selected workplace or house, read from the running sim.
  const selectedKind = buildingKind(selectedBuilding?.buildType)
  const household = selectedBuilding && isHouse(selectedBuilding)
    ? [...(simRegistry.current?.travelers.values() ?? [])].filter(s => s.home === selectedBuilding.id).length : 0
  const beds = map && selectedBuilding && isMonkShelter(selectedBuilding) ? monkBeds(map) : []
  const brothersAtHome = selectedBuilding ? monks.filter((monk, index) =>
    (monk.home ?? beds[index]?.home) === selectedBuilding.id).length : 0
  const staff = selectedBuilding && selectedKind
    ? [...(simRegistry.current?.travelers.values() ?? [])].filter(s => s.employer === selectedBuilding.id).length : 0
  const selectedRelic = selection?.kind === "relic"

  return (
    <Tooltip.Provider delay={180}>
    <SceneAudioLifecycle active={playing} />
    <BugReportDialog diagnostics={report} onClose={() => setReport(null)} />
    <div className="game-hud" data-landing={!playing} data-panel={menuOpen ? "menu" : panel ?? (selection ? "selection" : "none")}>
      <div className="hud-frame" aria-hidden="true" />
      <header className="hud-header">
        <div className="hud-resource-bar">
          {playing ? <HudResources economy={economy} settlers={economy.residents.length - monks.length} open={panel === "settlement"} onToggle={() => {
            setPanel((current) => current === "settlement" ? null : "settlement")
            setMenuOpen(false)
            economy.chooseBuild(null)
            useCameraStore.getState().select(null)
          }} /> : <nav className="hud-site-links" aria-label="Site navigation">
            {SITE_MENU.filter(item => item.href !== "/play").map(item => <Link key={item.href} href={item.href} title={item.description}>{item.label}</Link>)}
          </nav>}
        </div>
        <div className="hud-header-right">
        <div className="hud-header-actions">
          {playing && <ChromeButton type="button" className="hud-header-button" aria-label="Random map" title="Random map: regenerate at this size with a random seed"
            onClick={() => onNewMap({ size: settings.size, seed: randomSeed() })}><Dices size={16} /></ChromeButton>}
          {playing && <NewMapDialog defaultSize={settings.size} onCreate={onNewMap} />}
          <MusicPlayer className="hud-header-button" compact /><ThemeToggle />
          {playing && <ChromeButton type="button" className="hud-header-button" aria-label="World settings" title="World settings"
            aria-expanded={panel === "world"} aria-controls="world-settings" onClick={() => {
              setPanel((current) => current === "world" ? null : "world")
              setMenuOpen(false)
              economy.chooseBuild(null)
              if (!SHOW_PROPERTY_PANELS) useCameraStore.getState().select(null)
            }}><Settings size={16} /></ChromeButton>}
          {playing && <ChromeButton type="button" className="hud-header-button" aria-label="Menu" title="Menu"
            aria-expanded={menuOpen} onClick={() => {
              setMenuOpen((open) => !open)
              useCameraStore.getState().select(null)
              setPanel(null)
              economy.chooseBuild(null)
            }}><Menu size={16} /></ChromeButton>}
          {playing && menuOpen && <MenuPanel playerColor={settings.playerColor} onColorChange={playerColor => set({ playerColor })} playing={playing} onClose={() => setMenuOpen(false)} />}
        </div>

        </div>
      </header>

      {!starting && <div className="hud-landing-heading">
        <h1 className="hud-landing-title">Pilgrimage</h1>
        <p className="hud-landing-subtitle">A medieval settlement builder</p>
      </div>}
      {!starting && <form className="hud-landing-setup hud-well" aria-label="Start a settlement" onSubmit={event => {
        event.preventDefault()
        if (canStart && seedValid) onPlay()
      }}>
        {continueHref && <>
          <Link href={continueHref} className="hud-action hud-action-primary hud-landing-play">Continue</Link>
          <div className="hud-landing-divider" role="separator">or</div>
        </>}
        <PlayerColorPicker value={settings.playerColor} onChange={playerColor => set({ playerColor })} />
        <NewWorldFields seedId="landing-seed" size={settings.size} seed={seed}
          onSizeChange={size => set({ size })} onSeedChange={onSeedChange} onSeedValidityChange={setSeedValid} />
        <ChromeButton type="submit" className={`hud-action hud-landing-play${continueHref ? "" : " hud-action-primary"}`} disabled={!canStart || !seedValid}>
          {continueHref ? "New world" : "Play"}
        </ChromeButton>
      </form>}
      {!starting && <footer className="hud-landing-footer">
        <span>Created by <a href="https://twitter.com/tomjohndesign" target="_blank" rel="noopener noreferrer">Tomjohn</a></span>
        <a href="https://www.youtube.com/@pilgrimagegame" target="_blank" rel="noopener noreferrer">Devblog</a>
        <a href="https://github.com/tomjohndesign/pilgrimage" target="_blank" rel="noopener noreferrer">Github</a>
        <Link href="/changelog">{CURRENT_VERSION}</Link>
      </footer>}

      {playing && panel === "world" && <aside id="world-settings" className="hud-world hud-well" aria-label="World settings">
        <div className="hud-world-heading"><span>World</span><ChromeButton type="button" aria-label="Close world settings" onClick={() => setPanel(null)}><X size={16} /></ChromeButton></div>
        <div className="mb-4 flex flex-wrap gap-2">
          <HudButton id="bug-report-button" onClick={openBugReport}>Report a bug</HudButton>
        </div>
        {reportError && <p role="alert" className="mb-4 text-sm text-red">{reportError}</p>}
        <Section {...section("Visibility")}>
          {VISIBILITY_TOGGLES.map(([key, label]) => (
            <ToggleRow key={key} label={label} checked={settings[key]} onChange={(shown) => set({ [key]: shown })} />
          ))}
          <ToggleRow label="Buildings" checked={settings.buildingVisibility !== "hidden"}
            onChange={(shown) => set({ buildingVisibility: shown ? "auto" : "hidden" })} />
          <ToggleRow label="All interiors" checked={settings.buildingVisibility === "interiors"} disabled={settings.buildingVisibility === "hidden"}
            onChange={(all) => set({ buildingVisibility: all ? "interiors" : "auto" })} />
          <p className="py-1 text-[11px] italic text-ink-light">Interiors open on their own when you select a building or someone inside; All interiors keeps every roof off. Scenery includes rocks, plants and the signpost. Hidden objects keep working.</p>
          <HudButton onClick={() => set(DEFAULT_SCENE_VISIBILITY)}>Reset visibility</HudButton>
        </Section>
        {SHOW_PROPERTY_PANELS && <>
        {map && <AppearancePanel map={map} />}
        <Section {...section("Seed")}>
          <SeedField seed={seed} onSeedChange={onSeedChange} />
          <MapSizeControl label="Size" value={settings.size} onChange={(size) => set({ size })} />
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

      {playing && <BuildControls economy={economy} open={panel === "build"} onToggle={toggleBuild} playerColor={settings.playerColor}
        minimapOpen={minimapOpen} onToggleMinimap={() => {
          setMinimapOpen((open) => !open)
          setMenuOpen(false)
          setPanel(null)
          economy.chooseBuild(null)
          useCameraStore.getState().select(null)
        }} />}
      {playing && map && (selection || panel === "settlement") && <aside className="hud-selection-dock hud-well" aria-label="Selected item">
        {panel === "settlement" && <div className="hud-inspector" id="settlement-details">
          <SettlementPanel economy={economy} monks={monks} relic={relic} onClose={() => setPanel(null)} />
        </div>}
        {selection && <div className="hud-inspector" aria-label="Selection details">
          {(selection.kind === "tree" || selection.kind === "pile") && <ResourceInspector selection={selection} />}
          {selectedBuilding && (
            <Panel>
            <div className="flex items-center justify-between gap-4"><Label>{selectedDefinition?.category === "scenery" ? "Scenery" : "Building"}</Label><ChromeButton type="button" aria-label="Dismiss building" onClick={() => useCameraStore.getState().select(null)} className="pointer-events-auto text-xs text-ink-light">✕</ChromeButton></div>
            <h2 className="page-title hud-selection-name">{selectedBuilding.label}</h2>
            <ConstructionStatus building={selectedBuilding} />
            {selectedBuilding.buildType === "inn" && <p className="mt-1 text-[11px] text-ink-light">Open dormitory · {selectedBuilding.supportId ? "Upper floor · ladder access" : "Ground floor"} · {selectedBuilding.fireplace ? "Hearth" : "Unheated"}</p>}
            {map?.buildings.filter(b=>b.id===selectedBuilding.supportId || b.supportId===selectedBuilding.id).map(floor=><ChromeButton key={floor.id} type="button" className="mt-2 block text-[11px] text-ink underline underline-offset-2" onClick={()=>useCameraStore.getState().select({kind:"building",id:floor.id})}>
              Inspect {floor.label.toLowerCase()} {floor.supportId ? "upstairs" : "downstairs"}
            </ChromeButton>)}
            {selectedBuilding.owner === "independent" && <p className="mt-2 max-w-56 text-[11px] text-ink-light">Independent · joins when your influence reaches this building.</p>}
            {isMonkShelter(selectedBuilding) && isComplete(selectedBuilding) && <p className="mt-1 text-[11px] text-ink-light">{brothersAtHome} / {housingBeds(selectedBuilding)} monks · {Math.max(0, housingBeds(selectedBuilding) - brothersAtHome)} spaces available.</p>}
            {isHouse(selectedBuilding) && isComplete(selectedBuilding) && <p className="mt-1 text-[11px] text-ink-light">
              {household} / {housingCapacity(selectedBuilding)} settlers · {housingBeds(selectedBuilding)} bunks.
            </p>}
            {selectedKind && isComplete(selectedBuilding) && <p className="mt-1 text-[11px] text-ink-light">
              {staff} of {BUILDING_KINDS[selectedKind].jobs} {BUILDING_KINDS[selectedKind].vendorKept ? "kept by a settled vendor" : "jobs taken"}
              {selectedBuilding.buildType === "tavern" && staff === 0 ? " · nobody is serving yet" : ""}
            </p>}
            {selectedBuilding.id === map?.site?.hovelId && !isComplete(selectedBuilding) && (
              <p className="mt-3 max-w-56 text-[11px] text-ink-light">Relic visits paused during the upgrade.</p>
            )}
            {selectedBuilding.id === map?.site?.hovelId && isComplete(selectedBuilding) && (
              <div className="mt-3 flex flex-col gap-1.5">
                <p className="max-w-56 text-[11px] text-ink-light">{isChapel(selectedBuilding)
                  ? `1 visitor place · Up to ${CHAPEL_MONKS} monks`
                  : `2 visitor places · Up to ${CHURCH_MONKS} monks · +${CHURCH_RENOWN_BONUS} renown`}</p>
                {isChapel(selectedBuilding) && <>
                  <ChromeButton type="button" onClick={economy.upgradeShrine} disabled={!!economy.churchUpgradeError} title="Adds a second visitor place, larger donations and room for more monks. Side-wing plots are marked while building."
                    className="rounded border border-rule bg-parchment-dark px-2 py-1.5 text-left text-[11px] text-ink hover:text-red disabled:opacity-50">
                    Upgrade to church · {CHURCH_COST.gold} gold · {CHURCH_COST.wood} wood
                  </ChromeButton>
                  {economy.churchUpgradeError && <p className="max-w-56 text-[11px] text-ink-light">{economy.churchUpgradeError}</p>}
                </>}
                <p className="text-[11px] text-ink-light">Donated · {economy.settlement.collectedAdmission} gold</p>
                {map.buildings.filter(b => b.churchId === selectedBuilding.id).map(wing => <ChromeButton key={wing.id} type="button" className="mt-2 block text-left text-[11px] text-ink underline underline-offset-2"
                  onClick={() => useCameraStore.getState().select({ kind: "building", id: wing.id })}>
                  Inspect {wing.label.toLowerCase()}
                </ChromeButton>)}
                <ChromeButton type="button" disabled={isChapel(selectedBuilding)} title={isChapel(selectedBuilding) ? "Complete the church upgrade before adding a residence." : undefined}
                  className="mt-2 block text-left text-[11px] text-ink underline underline-offset-2 disabled:opacity-50" onClick={() => {
                  useCameraStore.getState().select(null)
                  setPanel("build")
                  setMenuOpen(false)
                  economy.chooseBuild("monk-shelter")
                }}>Build monks’ residence</ChromeButton>
              </div>
            )}
            {(selectedBuilding.buildType === "workshop" || selectedBuilding.buildType === "storehouse") && (
              <p className="mt-2 text-[11px] text-ink"><span className="text-ink-light">Stored wood</span> · {storedWood} wood</p>
            )}
            {selectedBuilding.buildType === "storehouse" && <div className="mt-2 text-[11px] text-ink-light">
              <p>Food stored · {storedFood(foodStock)} / {STOREHOUSE_FOOD_CAPACITY}</p>
              {FOOD_TYPES.filter(type => foodStock[type] > 0).map(type => <p key={type}>{FOOD_LABELS[type]} · {foodStock[type]}</p>)}
            </div>}
            {selectedBuilding.buildType === "sheep-pen" && <p className="mt-2 text-[11px] text-ink-light">Up to 8 sheep and goats · Food platform: {foodStock.meat} meat · {foodStock.milk} milk</p>}
            {selectedBuilding.owner !== "independent" && selectedDefinition && isComplete(selectedBuilding) && <>
              {selectedDefinition.renown > 0 && <p className="mt-2 text-[11px] text-ink-light">+{selectedDefinition.renown} shrine renown</p>}
              <p className="mt-1 text-[11px] text-ink-light">{buildingIncomeLabel(selectedDefinition, economy.balance)}</p>
            </>}
            {demolition.length > 0 && <DemolishBuildingDialog key={selectedBuilding.id}
              targets={[selectedBuilding, ...demolition.filter(b => b.id !== selectedBuilding.id)]}
              onDemolish={() => {
                economy.demolish(selectedBuilding.id)
                useCameraStore.getState().select(null)
              }} />}
          </Panel>
          )}
          {selection?.kind === "animal" && <AnimalInspector id={selection.id} />}
          {selectedPartyMember && <TravelerPanel traveler={selectedPartyMember} travelers={travelers} map={map} monk={selectedMonk ?? undefined} />}
          {selectedMonk && !selectedPartyMember && <MonkPanel monk={selectedMonk} />}
          {selectedRelic && relic && <RelicPanel relic={relic} />}
        </div>}
      </aside>}
      {playing && map && <aside id="minimap-dock" data-map-open={minimapOpen} data-inspecting={!!selection || panel === "settlement"} className="hud-details-dock hud-well" aria-label="Minimap and playback">
        <div className="hud-minimap">
          <Minimap map={map} />
          <span className="hud-minimap-north" aria-hidden="true">N ↑</span>
        </div>
        <div className="hud-time-controls">
          <HudClock />
          <section className="hud-traffic" aria-label="Traffic">
            <Tuner label="Characters" display={String(travelers.length)} min={0} max={MAX_TRAFFIC} value={settings.traffic} onChange={traffic => set({ traffic })} />
          </section>
        </div>
      </aside>}
    </div>
    </Tooltip.Provider>
  )
}
