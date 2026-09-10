"use client"

import { MapPlus } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { randomSeed } from "@/lib/game/rng"
import { HudButton } from "./hud-button"
import { NewWorldFields } from "./new-world-fields"

/** What names a fresh world; the shell regenerates once these are confirmed. */
export interface NewWorld {
  size: number
  seed: number
}

/**
 * A header button that opens the same size-and-seed form as the landing page.
 * The draft stays local until the player confirms a fresh world.
 */
export function NewMapDialog({ defaultSize, onCreate }: {
  /** The size the dialog opens on: the current map's, so a reroll keeps its scale. */
  defaultSize: number
  onCreate: (world: NewWorld) => void
}) {
  const [open, setOpen] = useState(false)
  const [size, setSize] = useState(defaultSize)
  const [seed, setSeed] = useState<number | null>(null)
  const [seedValid, setSeedValid] = useState(true)

  return <Dialog open={open} onOpenChange={setOpen}>
    <button type="button" id="new-map-button" className="hud-header-button" aria-label="New map" title="New map"
      aria-haspopup="dialog" aria-expanded={open} onClick={() => {
        setSize(defaultSize)
        setSeed(randomSeed())
        setSeedValid(true)
        setOpen(true)
      }}><MapPlus size={16} /></button>
    <DialogContent className="hud-report max-h-[85dvh] overflow-y-auto rounded-none border-rule bg-parchment text-ink sm:max-w-md"
      onKeyDown={event => event.stopPropagation()}
      onCloseAutoFocus={event => {
        event.preventDefault()
        document.getElementById("new-map-button")?.focus()
      }}>
      <DialogTitle className="font-display text-lg">New map</DialogTitle>
      <DialogDescription className="text-sm text-ink-light">
        Choose the size and seed of your new land. Creating a map replaces the current map and starts a fresh settlement.
      </DialogDescription>
      <form className="grid gap-4" onSubmit={event => {
        event.preventDefault()
        if (seed === null || !seedValid) return
        setOpen(false)
        onCreate({ size, seed })
      }}>
        <NewWorldFields seedId="new-map-seed" size={size} seed={seed}
          onSizeChange={setSize} onSeedChange={setSeed} onSeedValidityChange={setSeedValid} />
        <p className="text-xs text-ink-light">Dimensions are in tiles. Larger maps take longer to generate.</p>
        <div className="flex justify-end gap-3">
          <HudButton onClick={() => setOpen(false)}>Cancel</HudButton>
          <HudButton type="submit" disabled={seed === null || !seedValid}>Create map</HudButton>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}
