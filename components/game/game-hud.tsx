"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { useCameraStore } from "@/lib/game/camera-store"
import { clampRoadTier, MAX_ROAD_TIER, ROAD_TIERS } from "@/lib/game/map/road"
import { MIN_MAP_SIZE } from "@/lib/game/map/generate-map"
import type { GameMap } from "@/lib/game/map/types"
import { parseSeed } from "@/lib/game/rng"
import { saveSeed } from "@/lib/game/seed-storage"
import { SITE_MENU } from "@/lib/site-menu"
import { ACTIVITY_LABELS, formatGameTime, simRegistry, type SimTraveler } from "@/lib/game/sim"
import { MONK_ACTIVITY_LABELS, monkRegistry, type Monk, type MonkActivity } from "@/lib/game/monks"
import { relicTitle, type Relic } from "@/lib/game/relic"
import type { Traveler } from "@/lib/game/travelers"

import type { MapSettings } from "./game-shell"
import { Minimap } from "./minimap"

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
  return (
    <Panel>
      <Label>Time</Label>
      <div className="pt-1 font-display text-xs text-ink">{formatGameTime(time)}</div>
    </Panel>
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
          <div className="text-[11px] italic text-gold">{ACTIVITY_LABELS[live.activity]}</div>
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

  const selectedTraveler =
    selection?.kind === "traveler" ? (travelers.find((t) => t.id === selection.id) ?? null) : null
  const selectedMonk =
    selection?.kind === "monk" ? (monks.find((m) => m.id === selection.id) ?? null) : null
  const selectedRelic = selection?.kind === "relic"

  return (
    <>
      {/* Scrolls within the window: the tuning panels outgrow a short screen. */}
      <div className="absolute left-5 top-5 z-10 flex max-h-[calc(100vh-2.5rem)] flex-col items-start gap-2 overflow-y-auto pr-2 [scrollbar-width:none]">
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
            min={MIN_MAP_SIZE}
            max={256}
            step={32}
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
        </Panel>

        <Panel>
          <Label>Relic</Label>
          {relic && (
            <div className="pb-1 text-[11px] italic text-ink-light">{relicTitle(relic)}</div>
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
            display={`${settings.relicDistance} tiles off road`}
            min={6}
            max={48}
            onChange={(relicDistance) => set({ relicDistance })}
          />
        </Panel>

        <Panel>
          <Label>Road</Label>
          <Tuner
            label="Traffic"
            value={settings.traffic}
            display={`${settings.traffic} folk`}
            min={0}
            max={60}
            onChange={(traffic) => set({ traffic })}
          />
          <Tuner
            label="Pace"
            value={settings.walkSpeed}
            display={`${settings.walkSpeed.toFixed(1)} tiles/s`}
            min={0.2}
            max={5}
            step={0.1}
            onChange={(walkSpeed) => set({ walkSpeed })}
          />
          {/* Stand-in for progression: the road builds up as the pilgrimage grows. */}
          <Tuner
            label="Development"
            value={clampRoadTier(settings.road)}
            display={ROAD_TIERS[clampRoadTier(settings.road)].label}
            min={0}
            max={MAX_ROAD_TIER}
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
            display={settings.roadEdgeLine === 0 ? "none" : `${Math.round(settings.roadEdgeLine * 100)}%`}
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
        </Panel>

        <Panel>
          <Label>Water</Label>
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
        </Panel>
      </div>

      <div className="absolute right-5 top-5 z-10">
        <ClockPanel />
      </div>

      {selectedTraveler && (
        <div className="absolute bottom-5 left-5 z-10">
          <TravelerPanel traveler={selectedTraveler} />
        </div>
      )}
      {selectedMonk && (
        <div className="absolute bottom-5 left-5 z-10">
          <MonkPanel monk={selectedMonk} />
        </div>
      )}
      {selectedRelic && relic && (
        <div className="absolute bottom-5 left-5 z-10">
          <RelicPanel relic={relic} />
        </div>
      )}

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
