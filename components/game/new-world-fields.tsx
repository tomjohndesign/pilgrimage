"use client"

import { SeedField } from "./seed-field"

/**
 * The seed input for a fresh 128×128 world. The landing page and
 * the in-game New map dialog share this so creating a world looks the same
 * everywhere. The owner keeps the draft; valid edits are reported live.
 */
export function NewWorldFields({
  seedId,
  seed,
  onSeedChange,
  onSeedValidityChange,
}: {
  /** Names the seed input for its label; unique per mounted form. */
  seedId: string
  seed: number | null
  onSeedChange: (seed: number) => void
  onSeedValidityChange: (valid: boolean) => void
}) {
  return <>
    <div className="grid gap-1">
      <label className="text-[13px] text-ink-light" htmlFor={seedId}>World seed</label>
      <SeedField id={seedId} seed={seed} onSeedChange={onSeedChange} onValidityChange={onSeedValidityChange} />
    </div>
  </>
}
