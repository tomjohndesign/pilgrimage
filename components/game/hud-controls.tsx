"use client"

import Image from "next/image"
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react"
import * as Tooltip from "@radix-ui/react-tooltip"
import { Footprints, Hammer, House, Pause, Play, Users, X } from "lucide-react"

import { useBuildStore } from "@/lib/game/build-store"
import { BUILDING_KINDS, placementProblem, PLACEMENT_PROBLEM_LABELS } from "@/lib/game/buildings"
import { useCameraStore } from "@/lib/game/camera-store"
import type { GameMap } from "@/lib/game/map/types"
import { formatGameTime, simRegistry } from "@/lib/game/sim"
import { useSimulationStore } from "@/lib/game/simulation-store"

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
export function HudResources({ wood, settlers, visits }: { wood: number; settlers: number; visits: number }) {
  return <div className="hud-resources" aria-label="Settlement resources">
    <span title="Stored timber" aria-label={`${wood} timber`}><Image src="/game-icons/timber.svg" width={30} height={28} alt="" />{wood}</span>
    <span title="Settlers" aria-label={`${settlers} settlers`}><Users aria-hidden size={21} />{settlers}</span>
    <span title="Pilgrim visits" aria-label={`${visits} pilgrim visits`}><Footprints aria-hidden size={21} />{visits}</span>
  </div>
}

const PLANNED = [
  { id: "inn", label: "Inn / Hostel", description: "Lodging for passing pilgrims." },
  { id: "tavern", label: "Tavern", description: "Food and drink for travelers." },
  { id: "road", label: "Road", description: "Extend paths between buildings." },
] as const

/** Small illustrated commands above the persistent bottom actions. Planned
 * buildings have no simulation behavior yet, so their help explains availability.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1GB-0
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1SK-0
 */
export function BuildControls({ map, open, onToggle, onClose }: {
  map: GameMap | null
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const tool = useBuildStore((s) => s.tool)
  const buildings = useBuildStore((s) => s.buildings)
  const hovered = useCameraStore((s) => s.hovered)
  const problem = useMemo(() => map && tool && hovered
    ? placementProblem(map, [...map.buildings, ...buildings], tool, hovered.x, hovered.z)
    : null, [map, tool, buildings, hovered])
  const camp = BUILDING_KINDS.lumberCamp

  return <div className="hud-bottom-center">
    {open && <section id="build-tray" className="hud-well hud-build-tray" aria-label="Build options">
      <div className="hud-building-tiles">
        <HudHelp content={<>
          <div className="hud-help-title">Build {camp.label}<kbd>L</kbd></div>
          <p>Fell nearby trees and stack the timber.</p>
          <div className="hud-help-meta">Free · {camp.jobs} jobs · {camp.w} × {camp.d} tiles</div>
          <p className="hud-help-secondary">Needs reachable woods and a clear route from the shrine.</p>
        </>}>
          <button type="button" className="hud-building-tile" aria-label="Build lumber camp" aria-pressed={tool === "lumberCamp"}
            disabled={!map} onClick={() => useBuildStore.getState().setTool(tool ? null : "lumberCamp")}>
            <Image src="/game-icons/camp.svg" alt="" width={54} height={49} /><kbd>L</kbd>
          </button>
        </HudHelp>
        {PLANNED.map((building) => <HudHelp key={building.id} content={<>
          <div className="hud-help-title">{building.label}</div>
          <p>{building.description}</p>
          <div className="hud-help-meta">Not available yet</div>
        </>}>
          <button type="button" className="hud-building-tile" aria-disabled="true" aria-label={`${building.label} — not available yet`}>
            <Image src={`/game-icons/${building.id}.svg`} alt="" width={54} height={49} />
          </button>
        </HudHelp>)}
      </div>
      <button type="button" className="hud-close" aria-label="Close build options" onClick={onClose}><X size={14} /></button>
    </section>}
    {open && tool && <div className={`hud-placement-status ${problem ? "hud-placement-error" : ""}`} role="status">
      {problem ? PLACEMENT_PROBLEM_LABELS[problem] : "Place lumber camp near woods · Click to build · Esc to cancel"}
    </div>}
    <nav className="hud-bottom-actions" aria-label="Building tools">
      <button id="build-menu-button" type="button" className="hud-action" aria-expanded={open} aria-controls="build-tray" onClick={onToggle}>
        <House size={17} aria-hidden />Build
      </button>
      <HudHelp content={<><div className="hud-help-title">Paths</div><p>Path construction is not available yet.</p></>}>
        <button type="button" className="hud-action" aria-disabled="true"><Footprints size={17} aria-hidden />Paths</button>
      </HudHelp>
      <HudHelp content={<><div className="hud-help-title">Demolish</div><p>Building demolition is not available yet.</p></>}>
        <button type="button" className="hud-action" aria-disabled="true"><Hammer size={17} aria-hidden />Demolish</button>
      </HudHelp>
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
  const [day, clock] = time === null ? ["Day —", "—:—"] : formatGameTime(time).split(" — ")
  return <section className="hud-clock" aria-label="Simulation time">
    <span className="hud-day">{day}</span><span className="hud-time">{clock}</span>
    <button type="button" className="hud-pause" aria-label={paused ? "Resume simulation" : "Pause simulation"}
      aria-pressed={paused} onClick={() => useSimulationStore.getState().togglePaused()}>
      {paused ? <Play size={14} /> : <Pause size={14} />}
    </button>
    <div className="hud-speeds" aria-label="Simulation speed">
      {([1, 2, 3] as const).map((value) => <button type="button" key={value} aria-label={`${value}× simulation speed`} aria-pressed={speed === value}
        onClick={() => useSimulationStore.getState().setSpeed(value)}>{value}×</button>)}
    </div>
  </section>
}
