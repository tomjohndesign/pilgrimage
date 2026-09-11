"use client"

import { MapSizeControl } from "./map-size-control"
import { SeedField } from "./seed-field"

/**
 * The inputs that name a fresh world: its size and seed. The landing page and
 * the in-game New map dialog share these so creating a world looks the same
 * everywhere. The owner keeps the draft; valid edits are reported live.
 */
export function NewWorldFields({
  seedId,
  size,
  seed,
  onSizeChange,
  onSeedChange,
  onSeedValidityChange,
}: {
  /** Names the seed input for its label; unique per mounted form. */
  seedId: string
  size: number
  seed: number | null
  onSizeChange: (size: number) => void
  onSeedChange: (seed: number) => void
  onSeedValidityChange: (valid: boolean) => void
}) {
  return <>
    <MapSizeControl value={size} onChange={onSizeChange} />
    <div className="grid gap-1">
      <label className="text-[13px] text-ink-light" htmlFor={seedId}>World seed</label>
      <SeedField id={seedId} seed={seed} onSeedChange={onSeedChange} onValidityChange={onSeedValidityChange} />
    </div>
  </>
}
