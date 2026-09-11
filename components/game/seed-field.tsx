"use client"

import { RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { parseSeed, randomSeed } from "@/lib/game/rng"
import { HudButton } from "./hud-button"

/**
 * The seed as an editable field: paste a value or refresh for a random world.
 * The owner keeps the seed; this only reports. With `onValidityChange` every
 * valid keystroke is reported live; without it an Apply button commits.
 */
export function SeedField({
  id,
  seed,
  onSeedChange,
  onValidityChange,
}: {
  /** Names the input for a label; only set when reporting live. */
  id?: string
  onValidityChange?: (valid: boolean) => void
  seed: number | null
  onSeedChange: (seed: number) => void
}) {
  const [input, setInput] = useState(seed === null ? "" : String(seed))
  const [invalid, setInvalid] = useState(false)

  // Follow the owner when the seed changes elsewhere (reroll, URL load).
  useEffect(() => {
    if (seed !== null) setInput(String(seed))
  }, [seed])

  const apply = () => {
    const parsed = parseSeed(input)
    if (parsed === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onSeedChange(parsed)
  }

  const refresh = () => {
    const rolled = randomSeed()
    const next = rolled === seed ? (rolled + 1) % 2 ** 31 : rolled
    setInput(String(next))
    setInvalid(false)
    onValidityChange?.(true)
    onSeedChange(next)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-stretch gap-1.5">
        <input
        id={onValidityChange ? id : undefined}
        value={input}
        onChange={(event) => {
          const value = event.target.value
          setInput(value)
          const parsed = parseSeed(value)
          setInvalid(onValidityChange ? parsed === null : false)
          if (onValidityChange) {
            onValidityChange(parsed !== null)
            if (parsed !== null) onSeedChange(parsed)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !onValidityChange) apply()
        }}
        inputMode="numeric"
        spellCheck={false}
        aria-label="World seed"
        aria-invalid={invalid}
        className={`pointer-events-auto min-w-0 flex-1 border bg-parchment px-2 py-1 text-[13px] text-ink outline-none ${
          invalid ? "border-red" : "border-rule focus:border-gold"
        }`}
        />
        <HudButton onClick={refresh} aria-label="Randomize world seed" title="Randomize world seed">
          <RefreshCw size={14} aria-hidden="true" />
        </HudButton>
        {!onValidityChange && <HudButton onClick={apply}>Apply</HudButton>}
      </div>
      {invalid && <div className="text-[11px] italic text-red">Digits only</div>}
    </div>
  )
}
