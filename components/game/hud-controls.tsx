"use client"

import { placementRoofRotation } from "@/lib/game/building-placement-layout"

import Image from "next/image"
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react"
import * as Tooltip from "@radix-ui/react-tooltip"
import { Coins, Map, Minus, Plus, Footprints, Hammer, House, Pause, Play, RotateCcw, RotateCw, Sparkles, Users, X } from "lucide-react"

import type { useSettlement } from "@/hooks/use-settlement"
import { buildCatalog, buildingIncomeLabel } from "@/lib/game/balance"
import { BuildThumbnail } from "./build-thumbnail"
import { influenceRadius } from "@/lib/game/build-influence"
import { useBuildStore } from "@/lib/game/build-store"
import { rotatedFootprint } from "@/lib/game/building-rotation"
import { canAfford, placementError } from "@/lib/game/settlement"
import { useCameraStore } from "@/lib/game/camera-store"
import { formatGameTime, simRegistry } from "@/lib/game/sim"
import { SIMULATION_SPEEDS, useSimulationStore } from "@/lib/game/simulation-store"

/** Hover and keyboard-focus help, positioned inside the viewport by Radix.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1N5-0
 */
export function HudHelp({ children, content }: { children: ReactElement; content: ReactNode }) {
  return <Tooltip.Root>
    <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content className="game-hud-tooltip" side="top" align="start" sideOffset={12} collisionPadding={12}>
        {content}
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
}

/** Live settlement resources in the compact upper frame.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1SK-0
 */
export function HudResources({ economy, settlers, open, onToggle }: {
  economy: ReturnType<typeof useSettlement>
  settlers: number
  open: boolean
  onToggle: () => void
}) {
  const { gold, wood } = economy.settlement.resources
  const renown = Math.round((economy.renown?.total ?? 0) * 10) / 10
  return <div className="hud-resources" aria-label="Settlement resources">
    <span title="Gold" aria-label={`${gold} gold`}><Coins aria-hidden size={21} />{gold}</span>
    <span title="Stored timber" aria-label={`${wood} timber`}><Image src="/game-icons/timber.svg" width={30} height={28} alt="" />{wood}</span>
    <HudHelp content={<><div className="hud-help-title">Enclave housing</div>
      <p>People: {settlers} / {economy.housing?.people.capacity ?? 0} · {economy.housing?.people.available ?? 0} spaces available in houses.</p>
      <p>Monks: {economy.housing?.monks.occupied ?? 0} / {economy.housing?.monks.capacity ?? 0} · {economy.housing?.monks.available ?? 0} spaces available in shelters.</p>
      <p>Complete houses and monk shelters to welcome more residents.</p></>}>
      <button type="button" className="hud-resource-button" aria-label={`Enclave housing: ${economy.residents.length} residents, ${(economy.housing?.people.available ?? 0) + (economy.housing?.monks.available ?? 0)} spaces available`}
        aria-expanded={open} aria-controls="settlement-details" onClick={onToggle}>
        <Users aria-hidden size={21} />{economy.residents.length}/{(economy.housing?.people.capacity ?? 0) + (economy.housing?.monks.capacity ?? 0)}
      </button>
    </HudHelp>
    <span title="Pilgrim visits" aria-label={`${economy.visits} pilgrim visits`}><Footprints aria-hidden size={21} />{economy.visits}</span>
    <HudHelp content={<><div className="hud-help-title">Shrine renown</div><p>Open the treasury and renown breakdown.</p></>}>
      <button type="button" className="hud-resource-button" aria-label="Settlement details" aria-expanded={open} aria-controls="settlement-details" onClick={onToggle}>
        <Sparkles aria-hidden size={18} />{renown}
      </button>
    </HudHelp>
  </div>
}

/** Small illustrated commands use the live economy's catalogue and placement rules.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1GB-0
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1SK-0
 */
export function BuildControls({ economy, open, onToggle, onClose, minimapOpen, onToggleMinimap }: {
  economy: ReturnType<typeof useSettlement>
  open: boolean
  onToggle: () => void
  onClose: () => void
  minimapOpen: boolean
  onToggleMinimap: () => void
}) {
  const { map, balance, settlement, buildType, chooseBuild } = economy
  const rotation = useBuildStore((s) => s.rotation)
  const rotateBuilding = useBuildStore((s) => s.rotateBuilding)
  const hovered = useCameraStore((s) => s.hovered)
  const catalog = useMemo(() => buildCatalog(balance).filter(item => !item.retired).sort((a, b) =>
    a.id === "workshop" ? -1 : b.id === "workshop" ? 1 : 0), [balance])
  const renown = economy.renown?.total ?? 0
  const selected = catalog.find((item) => item.id === buildType)
  const problem = useMemo(() => {
    if (!selected) return null
    if (renown < selected.requiredRenown) return `Requires ${selected.requiredRenown} shrine renown.`
    if (!canAfford(settlement.resources, selected.cost)) return "Not enough gold or wood."
    return map && hovered ? placementError(map, selected, hovered, balance, rotation) : null
  }, [selected, renown, settlement.resources, map, hovered, balance, rotation])

  const alignedRotation=useMemo(()=>map && selected && hovered ? placementRoofRotation(map,selected,hovered,rotation) : rotation,[map,selected,hovered,rotation])
  const footprint = selected && rotatedFootprint(selected, alignedRotation)

  return <div className="hud-bottom-center">
    {open && <section id="build-tray" className="hud-well hud-build-tray" aria-label="Build options">
      <div className="hud-build-content">
        <div className="hud-building-tiles">
          {catalog.map((item) => {
            const locked = renown < item.requiredRenown
            const unavailable = !map || locked || !canAfford(settlement.resources, item.cost)
            return <HudHelp key={item.id} content={<>
              <div className="hud-help-title">Build {item.label}{item.id === "workshop" && <kbd>L</kbd>}</div>
              <p>{item.description}</p>
              <div className="hud-help-meta">{item.cost.gold} gold · {item.cost.wood} wood · {item.w} × {item.d} tiles</div>
              <p className="hud-help-secondary">{buildingIncomeLabel(item, balance)}</p>
              <p className="hud-help-secondary">+{item.renown} shrine renown · {item.renown > 0
                ? `${influenceRadius(item.renown, balance).toFixed(1)} tiles of influence`
                : "Does not extend influence"}</p>
              <p className="hud-help-secondary">{locked ? `Requires ${item.requiredRenown} shrine renown.`
                : unavailable ? "Not enough supplies or the world is still loading."
                : "Place inside shrine influence or beside the approach; the whole footprint must fit."}</p>
            </>}>
              <button type="button" className="hud-building-tile" aria-label={`Build ${item.label.toLowerCase()}`}
                aria-pressed={buildType === item.id} aria-disabled={unavailable}
                onClick={() => { if (!unavailable) chooseBuild(buildType === item.id ? null : item.id) }}>
                <BuildThumbnail id={item.id} />
                <span className="hud-building-label">{item.label}</span>
                <span className="hud-building-cost">{locked ? `${item.requiredRenown} renown` : `${item.cost.gold} gold · ${item.cost.wood} wood`}</span>
                {item.id === "workshop" && <kbd>L</kbd>}
              </button>
            </HudHelp>
          })}
        </div>
        {selected && footprint && <div className="hud-build-rotation" role="group" aria-label="Building rotation">
          <button type="button" className="hud-action" aria-label="Rotate building counterclockwise" aria-keyshortcuts="Meta+R" title="Rotate counterclockwise (Cmd+R)" onClick={() => rotateBuilding(-1)}>
            <RotateCcw size={15} aria-hidden /> <kbd>⌘ R</kbd>
          </button>
          <span>{alignedRotation * 90}° · {footprint.w} × {footprint.d} tiles</span>
          <button type="button" className="hud-action" aria-label="Rotate building clockwise" aria-keyshortcuts="R" title="Rotate clockwise (R)" onClick={() => rotateBuilding(1)}>
            <RotateCw size={15} aria-hidden /> <kbd>R</kbd>
          </button>
          <span className="hud-entry-key">Gold arrows mark entrances</span>
        </div>}
      </div>
      <button type="button" className="hud-close" aria-label="Close build options" onClick={onClose}><X size={14} /></button>
    </section>}
    {open && (selected || economy.message) && <div className={`hud-placement-status ${problem ? "hud-placement-error" : ""}`} role="status">
      {problem ?? (selected ? `Place ${selected.label.toLowerCase()} inside influence · Tap or click the map to build` : economy.message)}
    </div>}
    <nav className="hud-bottom-actions" aria-label="Building tools">
      <button id="build-menu-button" type="button" className="hud-action" aria-expanded={open} aria-controls="build-tray" onClick={onToggle}>
        <House size={17} aria-hidden />Build
      </button>
      <HudHelp content={<><div className="hud-help-title">Paths</div><p>Path construction is not available yet.</p></>}>
        <button type="button" className="hud-action hud-future-tool" aria-disabled="true"><Footprints size={17} aria-hidden />Paths</button>
      </HudHelp>
      <HudHelp content={<><div className="hud-help-title">Demolish</div><p>Building demolition is not available yet.</p></>}>
        <button type="button" className="hud-action hud-future-tool" aria-disabled="true"><Hammer size={17} aria-hidden />Demolish</button>
      </HudHelp>
      <div className="hud-mobile-camera" role="group" aria-label="Camera controls">
        <button type="button" className="hud-action" aria-label="Zoom out" onClick={() => useCameraStore.getState().zoomBy(1.25)}><Minus size={18} /></button>
        <button type="button" className="hud-action" aria-label="Zoom in" onClick={() => useCameraStore.getState().zoomBy(1 / 1.25)}><Plus size={18} /></button>
        <button type="button" className="hud-action" aria-label="Rotate view" onClick={() => useCameraStore.getState().rotate(1)}><RotateCw size={18} /></button>
        <button type="button" className="hud-action" aria-label="Toggle minimap" aria-expanded={minimapOpen} aria-controls="minimap-dock" onClick={onToggleMinimap}><Map size={18} /></button>
      </div>
    </nav>
  </div>
}

/** Playback controls drive the actual simulation, while camera movement stays live.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1GB-0
 */
export function HudClock() {
  const [time, setTime] = useState<number | null>(null)
  const paused = useSimulationStore((s) => s.paused)
  const speed = useSimulationStore((s) => s.speed)
  useEffect(() => {
    const read = () => setTime(simRegistry.current?.time ?? null)
    read()
    const timer = setInterval(read, 250)
    return () => clearInterval(timer)
  }, [])
  const day = time === null ? "Day —" : `Day ${Math.floor(time) + 1}`
  const date = time === null ? "March 1, 825 AD" : formatGameTime(time)
  return <section className="hud-clock" aria-label="Simulation time">
    <span className="hud-day">{day}</span><span className="hud-date">{date}</span>
    <button type="button" className="hud-pause" aria-label={paused ? "Resume simulation" : "Pause simulation"}
      aria-pressed={paused} onClick={() => useSimulationStore.getState().togglePaused()}>
      {paused ? <Play size={14} /> : <Pause size={14} />}
    </button>
    <select className="hud-mobile-speed hud-action" aria-label="Simulation speed" value={speed}
      onChange={(event) => {
        const choice = SIMULATION_SPEEDS.find((item) => item.rate === Number(event.target.value))
        if (choice) useSimulationStore.getState().setSpeed(choice.rate)
      }}>
      {SIMULATION_SPEEDS.map(({ label, rate }) => <option key={rate} value={rate}>{label}×</option>)}
    </select>
    <div className="hud-speeds" aria-label="Simulation speed">
      {SIMULATION_SPEEDS.map(({ label, rate }) => <button type="button" key={rate} aria-label={`${label}× simulation speed`} aria-pressed={speed === rate}
        onClick={() => useSimulationStore.getState().setSpeed(rate)}>{label}×</button>)}
    </div>
  </section>
}
