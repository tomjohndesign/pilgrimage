"use client"

import { useCameraStore } from "@/lib/game/camera-store"
import { PROTOTYPE_MAP } from "@/lib/game/map/prototype-map"
import { TERRAIN } from "@/lib/game/map/terrain"
import { tileAt } from "@/lib/game/map/types"
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

export function GameHud() {
  const viewIndex = useCameraStore((s) => s.viewIndex)
  const viewSize = useCameraStore((s) => s.viewSize)
  const hovered = useCameraStore((s) => s.hovered)

  const view = normalizeViewIndex(viewIndex)
  // Relative to the default zoom, so 100% is where the camera starts and
  // bigger reads as closer.
  const zoomPercent = Math.round((DEFAULT_VIEW_SIZE / viewSize) * 100)
  const hoveredTerrain = hovered ? tileAt(PROTOTYPE_MAP, hovered.x, hovered.z) : null

  return (
    <>
      <div className="absolute left-5 top-5 z-10">
        <Panel>
          <div className="font-display text-sm font-bold tracking-[3px] text-ink">PILGRIMAGE</div>
          <div className="font-display text-[9px] uppercase tracking-[2px] text-gold">
            Prototype — Camera &amp; Map
          </div>
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
