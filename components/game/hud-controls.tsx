"use client"

import { ChromeButton } from "@/components/ui/chrome-controls"
import { useIsMobile } from "@/hooks/use-mobile"
import { placementSite } from "@/lib/game/building-placement-layout"

import { GameIcon } from "./game-icon"
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactElement, type ReactNode } from "react"
import { Tooltip } from "@base-ui/react/tooltip"
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react"

import type { useSettlement } from "@/hooks/use-settlement"
import { buildCatalog, buildingIncomeLabel } from "@/lib/game/balance"
import { BuildThumbnail } from "./build-thumbnail"
import { influenceRadius } from "@/lib/game/build-influence"
import { useBuildStore } from "@/lib/game/build-store"
import { rotatedFootprint } from "@/lib/game/building-rotation"
import { churchDevelopmentPlot } from "@/lib/game/shrine-upgrade"
import { canAfford, placementError } from "@/lib/game/settlement"
import { useCameraStore } from "@/lib/game/camera-store"
import { formatGameTime, simRegistry } from "@/lib/game/sim"
import { crowdSafeSpeed, nextSimulationSpeed, useSimulationStore } from "@/lib/game/simulation-store"

/** Hover and keyboard-focus help, positioned inside the viewport by Base UI.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1N5-0
 */
export function HudHelp({ children, content, open, onOpenChange, className = "", anchor, side = "top", sideOffset = 8 }: { children: ReactElement; content: ReactNode; className?: string; open?: boolean; onOpenChange?: (open: boolean) => void; anchor?: ComponentProps<typeof Tooltip.Positioner>["anchor"]; side?: ComponentProps<typeof Tooltip.Positioner>["side"]; sideOffset?: number }) {
  return <Tooltip.Root open={open} onOpenChange={onOpenChange}>
    <Tooltip.Trigger render={children} />
    <Tooltip.Portal>
      <Tooltip.Positioner anchor={anchor} side={side} align="start" sideOffset={sideOffset} collisionPadding={12} collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "start" }} className="chrome-popup-positioner"><Tooltip.Popup className={`chrome-tooltip game-hud-tooltip ${className}`}>
        {content}
      </Tooltip.Popup></Tooltip.Positioner>
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
    <span title="Gold" aria-label={`${gold} gold`}><GameIcon name="gold" />{gold}</span>
    <span title="Stored timber" aria-label={`${wood} timber`}><GameIcon name="wood" />{wood}</span>
    <HudHelp content={<><div className="hud-help-title">Enclave housing</div>
      <p>People: {settlers} / {economy.housing?.people.capacity ?? 0} · {economy.housing?.people.available ?? 0} spaces available in houses.</p>
      <p>Monks: {economy.housing?.monks.occupied ?? 0} / {economy.housing?.monks.capacity ?? 0} · {economy.housing?.monks.available ?? 0} spaces available in residences.</p>
      <p>Complete houses and a monks’ residence beside the church to welcome more residents.</p></>}>
      <ChromeButton type="button" className="hud-resource-button" aria-label={`Enclave housing: ${economy.residents.length} residents, ${(economy.housing?.people.available ?? 0) + (economy.housing?.monks.available ?? 0)} spaces available`}
        aria-expanded={open} aria-controls="settlement-details" onClick={onToggle}>
        <GameIcon name="population" />{economy.residents.length}/{(economy.housing?.people.capacity ?? 0) + (economy.housing?.monks.capacity ?? 0)}
      </ChromeButton>
    </HudHelp>
    <span title="Pilgrim visits" aria-label={`${economy.visits} pilgrim visits`}><GameIcon name="visits" />{economy.visits}</span>
    <HudHelp content={<><div className="hud-help-title">Shrine renown</div><p>Open the treasury and renown breakdown.</p></>}>
      <ChromeButton type="button" className="hud-resource-button" aria-label="Settlement details" aria-expanded={open} aria-controls="settlement-details" onClick={onToggle}>
        <GameIcon name="renown" />{renown}
      </ChromeButton>
    </HudHelp>
  </div>
}

/** Small illustrated commands use the live economy's catalogue and placement rules.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1GB-0
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1SK-0
 */
export function BuildControls({ economy, open, onToggle, playerColor, minimapOpen, onToggleMinimap }: {
  economy: ReturnType<typeof useSettlement>
  open: boolean
  onToggle: () => void
  playerColor: string
  minimapOpen: boolean
  onToggleMinimap: () => void
}) {
  const tray = useRef<HTMLElement>(null)
  const mobile = useIsMobile()
  const { map, balance, settlement, buildType, chooseBuild } = economy
  const rotation = useBuildStore((s) => s.rotation)
  const rotateBuilding = useBuildStore((s) => s.rotateBuilding)
  const hovered = useCameraStore((s) => s.hovered)
  const catalog = useMemo(() => buildCatalog(balance).filter(item => !item.retired).sort((a, b) =>
    a.id === "workshop" ? -1 : b.id === "workshop" ? 1 : 0), [balance])
  const renown = economy.renown?.total ?? 0
  const selected = catalog.find((item) => item.id === buildType)
  const churchAddition = selected?.id === "monk-shelter"
  const options = catalog.filter(item => churchAddition ? item.id === "monk-shelter" : item.id !== "monk-shelter")
  const problem = useMemo(() => {
    if (!selected) return null
    if (renown < selected.requiredRenown) return `Requires ${selected.requiredRenown} shrine renown.`
    if (!canAfford(settlement.resources, selected.cost)) return "Not enough gold or wood."
    return map && hovered ? placementError(map, selected, hovered, balance, rotation) : null
  }, [selected, renown, settlement.resources, map, hovered, balance, rotation])

  const alignedRotation=useMemo(()=>map && selected && hovered ? placementSite(map,selected,hovered,rotation).rotation : rotation,[map,selected,hovered,rotation])
  const footprint = selected && rotatedFootprint(selected, alignedRotation)

  return <div className="hud-bottom-center">
    {open && <section ref={tray} id="build-tray" className="hud-well hud-build-tray" aria-label={churchAddition ? "Church additions" : "Build options"}>
      <div className="hud-build-heading"><span>{churchAddition ? "Church additions" : "Buildings"}</span></div>
      <div className="hud-build-content">
        <div className="hud-building-tiles">
          {options.map((item) => {
            const locked = renown < item.requiredRenown
            const unavailable = !map || locked || !canAfford(settlement.resources, item.cost)
            return <HudHelp key={item.id} anchor={mobile ? undefined : tray} side={mobile ? "top" : "right"} sideOffset={mobile ? 8 : 0} className="hud-building-preview" content={<>
              <div className="hud-help-title page-title">{item.label}</div>
              <div className="hud-building-preview-art"><BuildThumbnail id={item.id} catalog={catalog} playerColor={playerColor} scale={4} /></div>
              <p>{item.description}</p>
              <div className="hud-help-meta">{item.cost.gold} gold · {item.cost.wood} wood · {item.w} × {item.d} tiles</div>
              <p className="hud-help-secondary">{buildingIncomeLabel(item, balance)}</p>
              <p className="hud-help-secondary">+{item.renown} shrine renown · {item.renown > 0
                ? `${influenceRadius(item.renown, balance).toFixed(1)} tiles of influence`
                : "Does not extend influence"}</p>
              <p className="hud-help-secondary">{locked ? `Requires ${item.requiredRenown} shrine renown.`
                : unavailable ? "Not enough supplies or the world is still loading."
                : item.id === "monk-shelter" ? "Build against a side wall of the church. Monks enter through the church."
                : "Place anywhere on suitable ground; the whole footprint and entrances must stay clear."}</p>
            </>}>
              <ChromeButton type="button" className="hud-building-tile" aria-label={`Build ${item.label.toLowerCase()}`}
                aria-pressed={buildType === item.id} aria-disabled={unavailable}
                onClick={() => { if (!unavailable) chooseBuild(buildType === item.id && !churchAddition ? null : item.id) }}>
                <BuildThumbnail id={item.id} catalog={catalog} playerColor={playerColor} />
                <span className="hud-building-label">{item.label}</span>
                <span className="hud-building-cost">{locked ? `${item.requiredRenown} renown` : `${item.cost.gold} gold · ${item.cost.wood} wood`}</span>
                {item.id === "workshop" && <kbd>L</kbd>}
              </ChromeButton>
            </HudHelp>
          })}
        </div>
        {selected && footprint && (churchAddition ? <div className="hud-build-rotation">
          <span>{footprint.w} × {footprint.d} tiles · Turns automatically to meet the church</span>
        </div> : <div className="hud-build-rotation" role="group" aria-label="Building rotation">
          <ChromeButton type="button" className="hud-action" aria-label="Rotate building counterclockwise" aria-keyshortcuts="Meta+R" title="Rotate counterclockwise (Cmd+R)" onClick={() => rotateBuilding(-1)}>
            <RotateCcw size={15} aria-hidden /> <kbd>⌘ R</kbd>
          </ChromeButton>
          <span>{alignedRotation * 90}° · {footprint.w} × {footprint.d} tiles</span>
          <ChromeButton type="button" className="hud-action" aria-label="Rotate building clockwise" aria-keyshortcuts="R" title="Rotate clockwise (R)" onClick={() => rotateBuilding(1)}>
            <RotateCw size={15} aria-hidden /> <kbd>R</kbd>
          </ChromeButton>
          <span className="hud-entry-key">Gold arrows mark entrances{map && churchDevelopmentPlot(map) ? " · Gold grid reserves the church and side wings" : ""}</span>
        </div>)}
      </div>
    </section>}
    {open && (selected || economy.message) && <div className={`hud-placement-status ${problem ? "hud-placement-error" : ""}`} role="status">
      {problem ?? (selected ? selected.id === "monk-shelter"
        ? "Place in the gold side-wing space against a completed church · Entrance through the church"
        : `Place ${selected.label.toLowerCase()} on suitable ground · Tap or click the map to build` : economy.message)}
    </div>}
    <nav className="hud-bottom-actions" aria-label="Building tools">
      <ChromeButton id="build-menu-button" type="button" className="hud-action" aria-expanded={open} aria-controls="build-tray" onClick={onToggle}>
        <GameIcon name="build" />Build
      </ChromeButton>
      <div className="hud-mobile-camera" role="group" aria-label="Camera controls">
        <ChromeButton type="button" className="hud-action" aria-label="Rotate view" onClick={() => useCameraStore.getState().rotate(1)}><RotateCw size={18} /></ChromeButton>
        <ChromeButton type="button" className="hud-action" aria-label="Toggle minimap" aria-expanded={minimapOpen} aria-controls="minimap-dock" onClick={onToggleMinimap}><GameIcon name="map" /></ChromeButton>
      </div>
    </nav>
  </div>
}

/** Day and date sit in the minimap corners alongside its compass. */
export function HudClock() {
  const [time, setTime] = useState<number | null>(null)
  useEffect(() => {
    const read = () => setTime(simRegistry.current?.time ?? null)
    read()
    const timer = setInterval(read, 250)
    return () => clearInterval(timer)
  }, [])
  const day = time === null ? "Day —" : `Day ${Math.floor(time) + 1}`
  const date = time === null ? "March 1, 825 AD" : formatGameTime(time)
  return <div className="hud-clock-date" aria-label="Simulation date">
    <span className="hud-day">{day}</span><span className="hud-date">{date}</span>
  </div>
}

/** Playback controls drive the actual simulation, while camera movement stays live.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1GB-0
 */
export function HudPlayback() {
  const [population, setPopulation] = useState(0)
  const paused = useSimulationStore((s) => s.paused)
  const speed = useSimulationStore((s) => s.speed)
  useEffect(() => {
    // A growing settlement drops to the fastest speed its crowd can still run.
    const read = () => {
      const sim = simRegistry.current
      const crowd = (sim?.travelers.size ?? 0) + (sim?.joinedMonks.size ?? 0)
      setPopulation(crowd)
      const playback = useSimulationStore.getState()
      const allowed = crowdSafeSpeed(playback.speed, crowd)
      if (allowed !== playback.speed) playback.setSpeed(allowed)
    }
    read()
    const timer = setInterval(read, 250)
    return () => clearInterval(timer)
  }, [])
  return <section className="hud-clock-playback" aria-label="Playback controls">
    <ChromeButton type="button" className="hud-pause" aria-label={paused ? "Resume simulation" : "Pause simulation"}
      aria-pressed={paused} onClick={() => useSimulationStore.getState().togglePaused()}>
      {paused ? <Play size={14} /> : <Pause size={14} />}
    </ChromeButton>
    <ChromeButton type="button" className="hud-action hud-speed" aria-label={`Simulation speed: ${speed / 2}×. Click to cycle speeds`}
      title="Cycle simulation speed" onClick={() => {
        useSimulationStore.getState().setSpeed(nextSimulationSpeed(speed, population))
      }}>{speed / 2}×</ChromeButton>
  </section>
}
