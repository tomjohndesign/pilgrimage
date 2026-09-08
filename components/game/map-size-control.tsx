"use client"

import { MIN_MAP_SIZE } from "@/lib/game/map/generate-map"
import { MAP_SIZE_STEP, MAX_MAP_SIZE } from "@/lib/game/map-size-storage"
import { Tuner } from "./property-controls"

/** Shared square-map dimensions for the saved preference and new-map dialog. */
export function MapSizeControl({ label = "Map size", value, onChange }: {
  label?: string
  value: number
  onChange: (size: number) => void
}) {
  return <Tuner label={label} labelClassName="w-24" value={value}
    display={`${value} × ${value}`} min={MIN_MAP_SIZE} max={MAX_MAP_SIZE}
    step={MAP_SIZE_STEP} showHandle onChange={onChange} />
}
