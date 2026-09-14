"use client"

import { createContext, useContext } from "react"
import { PLAYER_COLORS } from "@/lib/game/player-color"

export const PlayerColorContext = createContext<string | null>(null)
export const usePlayerColor = () => useContext(PlayerColorContext)

/** Shared player control for the landing form and the in-game menu. */
export function PlayerColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return <fieldset className="grid gap-2">
    <legend className="mb-1 text-[13px] text-ink-light">Your settlement color</legend>
    <div className="flex flex-wrap items-center gap-1.5">
      {PLAYER_COLORS.map(({ name, color }) => <button key={color} type="button"
        className="hud-action flex h-7 w-7 items-center justify-center p-0"
        style={{ backgroundColor: color, color: "white" }} title={name}
        aria-label={name} aria-pressed={value.toLowerCase() === color} onClick={() => onChange(color)}>
        {value.toLowerCase() === color ? "✓" : ""}
      </button>)}
      <label className="flex items-center gap-2 text-[11px] text-ink-light">Custom
        <input type="color" aria-label="Custom settlement color" value={value} onChange={event => onChange(event.target.value)} className="h-7 w-8 cursor-pointer border border-rule bg-transparent p-0" />
      </label>
    </div>
    <p className="text-[11px] text-ink-light">Residents and building accents use this color. Visitors wear muted clothing.</p>
  </fieldset>
}
