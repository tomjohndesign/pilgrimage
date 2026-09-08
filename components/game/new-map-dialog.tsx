"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { HudButton } from "./hud-button"
import { MapSizeControl } from "./map-size-control"

/** Draft dimensions stay local until the player confirms a fresh world. */
export function NewMapDialog({ defaultSize, onCreate }: {
  defaultSize: number
  onCreate: (size: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [size, setSize] = useState(defaultSize)

  return <Dialog open={open} onOpenChange={setOpen}>
    <HudButton id="new-map-button" aria-haspopup="dialog" onClick={() => {
      setSize(defaultSize)
      setOpen(true)
    }}>✦ New Map</HudButton>
    <DialogContent className="hud-report max-h-[85dvh] overflow-y-auto rounded-none border-rule bg-parchment text-ink sm:max-w-md"
      onKeyDown={event => event.stopPropagation()}
      onCloseAutoFocus={event => {
        event.preventDefault()
        document.getElementById("new-map-button")?.focus()
      }}>
      <DialogTitle className="font-display text-lg">New map</DialogTitle>
      <DialogDescription className="text-sm text-ink-light">
        Choose the size of your new land. Creating a map replaces the current map and starts a fresh settlement.
      </DialogDescription>
      <form className="grid gap-4" onSubmit={event => {
        event.preventDefault()
        setOpen(false)
        onCreate(size)
      }}>
        <MapSizeControl value={size} onChange={setSize} />
        <p className="text-xs text-ink-light">Dimensions are in tiles. Larger maps take longer to generate.</p>
        <div className="flex justify-end gap-3">
          <HudButton onClick={() => setOpen(false)}>Cancel</HudButton>
          <HudButton type="submit">Create map</HudButton>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}
