"use client"

import { useCameraStore } from "@/lib/game/camera-store"
import { TERRAIN } from "@/lib/game/map/terrain"
import { tileAt, type GameMap } from "@/lib/game/map/types"

import type { MapSettings } from "./game-shell"
import {
  DEFAULT_VIEW_SIZE,
  MAX_VIEW_SIZE,
  MIN_VIEW_SIZE,
  normalizeViewIndex,
} from "@/lib/game/render/iso"

const CONTROLS: Array<[string, string]> = [
  ["Drag", "Pan"],
  ["Scroll", "Zoom"],
  ["Q / E", "Rotate view"],
  ["W A S D", "Pan"],
  ["0", "Reset camera"],
]

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none border border-rule bg-parchment/95 px-4 py-3 shadow-[0_2px_16px_rgba(0,0,0,0.6)]">
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-display text-[9px] uppercase tracking-[2px] text-gold">{children}</div>
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

export function GameHud({
  map,
  seed,
  settings,
  onSettingsChange,
  onReroll,
}: {
  map: GameMap | null
  seed: number | null
  settings: MapSettings
  onSettingsChange: (settings: MapSettings) => void
  onReroll: () => void
}) {
  const set = (patch: Partial<MapSettings>) => onSettingsChange({ ...settings, ...patch })
  const viewIndex = useCameraStore((s) => s.viewIndex)
  const viewSize = useCameraStore((s) => s.viewSize)
  const hovered = useCameraStore((s) => s.hovered)

  const view = normalizeViewIndex(viewIndex)
  // Relative to the default zoom, so 100% is where the camera starts and
  // bigger reads as closer.
  const zoomPercent = Math.round((DEFAULT_VIEW_SIZE / viewSize) * 100)
  const hoveredTerrain = hovered && map ? tileAt(map, hovered.x, hovered.z) : null

  return (
    <>
      <div className="absolute left-5 top-5 z-10 flex flex-col gap-2">
        <Panel>
          <div className="font-display text-sm font-bold tracking-[3px] text-ink">PILGRIMAGE</div>
          <div className="font-display text-[9px] uppercase tracking-[2px] text-gold">
            Prototype — Camera &amp; Map
          </div>
        </Panel>

        <Panel>
          <Label>Seed</Label>
          <div className="pt-1 font-display text-xs text-ink">{seed ?? "—"}</div>
          <Tuner
            label="Size"
            value={settings.size}
            display={`${settings.size} × ${settings.size}`}
            min={32}
            max={128}
            step={16}
            onChange={(size) => set({ size })}
          />
          <button
            type="button"
            onClick={onReroll}
            className="pointer-events-auto mt-1.5 border border-rule bg-parchment-dark px-2 py-1 font-display text-[9px] uppercase tracking-[2px] text-ink transition-colors hover:border-gold hover:text-gold"
          >
            New Map
          </button>
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
