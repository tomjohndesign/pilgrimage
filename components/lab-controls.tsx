"use client"

import { Pause, Play, RotateCcw, StepForward } from "lucide-react"
import { EntitySelect } from "./workspace-navigation"

import { ChromeButton, ChromeSelect } from "@/components/ui/chrome-controls"
import { parseSeed, randomSeed } from "@/lib/game/rng"
import { HudHelp } from "./game/hud-controls"
import { Tuner } from "./game/property-controls"

export const labButton = "hud-action"
export const labInput = "playground-input"

/** Playback semantics stay with the simulation; the buttons stay consistent. */
export function LabPlayback({ playing, onPlayingChange, onStep, stepLabel, onRestart }: {
  playing: boolean; onPlayingChange: (playing: boolean) => void; onStep: () => void; stepLabel: string; onRestart: () => void
}) {
  return <>
    <ChromeButton type="button" className="hud-pause" aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause simulation" : "Play simulation"} onClick={() => onPlayingChange(!playing)}>{playing ? <Pause size={14} /> : <Play size={14} />}</ChromeButton>
    <ChromeButton type="button" className="chrome-icon-button" aria-label={stepLabel} title={stepLabel} onClick={() => { onPlayingChange(false); onStep() }}><StepForward size={16} /></ChromeButton>
    <ChromeButton type="button" className="chrome-icon-button" aria-label="Restart" title="Restart simulation" onClick={onRestart}><RotateCcw size={16} /></ChromeButton>
  </>
}

export function LabSeedInput({ value, onChange, onApply, disabled = false }: {
  value: string; onChange: (value: string) => void; onApply: (seed: number) => void; disabled?: boolean
}) {
  const seed = parseSeed(value)
  return <label className="person-choice">Map seed
    <input className={labInput} value={value} inputMode="numeric" aria-invalid={seed === null} disabled={disabled}
      onChange={event => onChange(event.target.value)} onKeyDown={event => {
        if (event.key === "Enter" && seed !== null) { event.preventDefault(); onApply(seed) }
      }} />
  </label>
}

export function LabSeedActions({ draft, seed, onApply, disabled = false }: {
  draft: string; seed: number; onApply: (seed: number) => void; disabled?: boolean
}) {
  const parsed = parseSeed(draft)
  return <>
    <ChromeButton type="button" className={labButton} disabled={disabled || parsed === null} onClick={() => parsed !== null && onApply(parsed)}>Apply seed</ChromeButton>
    <ChromeButton type="button" className={labButton} disabled={disabled} onClick={() => onApply((seed + 1) >>> 0)}>Next seed</ChromeButton>
    <ChromeButton type="button" className={labButton} disabled={disabled} onClick={() => onApply(randomSeed())}>Random seed</ChromeButton>
  </>
}

export function LabSelect({ label, value, options, onChange, help, ariaLabel, navigation = false }: { navigation?: boolean; label: string; value: string; options: Record<string, string>; onChange: (value: string) => void; help?: string; ariaLabel?: string }) {
  const Select = navigation ? EntitySelect : ChromeSelect
  const control = <label className="person-choice">
    {label}<Select aria-label={ariaLabel ?? label} className={labInput} value={value} onChange={event => onChange(event.target.value)}>
      {Object.entries(options).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
    </Select>
  </label>
  return help ? <HudHelp className="workspace-tooltip" content={help}><div>{control}</div></HudHelp> : control
}

export function LabSlider({ label, value, min, max, step, suffix = "", onChange, help }: { help?: string; label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  const control = <Tuner label={label} labelClassName="w-28" value={value} min={min} max={max} step={step}
    display={`${Number(value.toFixed(step < .01 ? 3 : 2))}${suffix}`} onChange={onChange} />
  return help ? <HudHelp className="workspace-tooltip" content={help}><div>{control}</div></HudHelp> : control
}
