"use client"

import { useRef, useState, type ReactElement } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { BuildingDef } from "@/lib/game/map/types"
import { HudButton } from "./hud-button"

/** Confirm the selected building and any floors that depend on it before removal. */
export function DemolishBuildingDialog({ targets, onDemolish, trigger }: {
  targets: BuildingDef[]
  onDemolish: () => void
  trigger?: ReactElement
}) {
  const [open, setOpen] = useState(false)
  const cancel = useRef<HTMLButtonElement>(null)
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>{trigger ?? <HudButton className="mt-3">Demolish</HudButton>}</DialogTrigger>
    <DialogContent className="hud-report max-h-[85dvh] overflow-y-auto rounded-none border-rule bg-parchment text-ink sm:max-w-md"
      onKeyDown={event => event.stopPropagation()}
      initialFocus={cancel}>
      <DialogTitle className="font-display text-lg">Demolish {targets[0].label}?</DialogTitle>
      <DialogDescription className="text-sm text-ink-light">
        This removes the building immediately, including any unfinished construction. This cannot be undone, and construction costs are not refunded.
        Any homes, jobs and food stored here will be lost.
      </DialogDescription>
      {targets.length > 1 && <p className="text-sm text-ink-light">
        Also removes dependent floors and additions: {targets.slice(1).map(b => b.label).join(", ")}.
      </p>}
      <div className="flex justify-end gap-3">
        <HudButton ref={cancel} onClick={() => setOpen(false)}>Cancel</HudButton>
        <HudButton onClick={() => { setOpen(false); onDemolish() }}>Confirm demolition</HudButton>
      </div>
    </DialogContent>
  </Dialog>
}
