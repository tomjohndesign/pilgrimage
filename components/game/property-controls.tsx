"use client"

import { useId } from "react"
import { Switch } from "@/components/ui/switch"
import { ChromeSelect } from "@/components/ui/chrome-controls"
import { Slider } from "@base-ui/react/slider"
import { Collapsible } from "@base-ui/react/collapsible"

/** Shared property disclosure for the game HUD and workspace.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/CCL-0
 */
export function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return <Collapsible.Root open={open} onOpenChange={onToggle} className="chrome-property-section">
    <Collapsible.Trigger className="chrome-section-trigger">{title}<span aria-hidden>{open ? "−" : "+"}</span></Collapsible.Trigger>
    <Collapsible.Panel><div className="chrome-section-content">{children}</div></Collapsible.Panel>
  </Collapsible.Root>
}

export function Tuner({
  label,
  value,
  display,
  min,
  max,
  step = 1,
  showHandle = false,
  hideLabel = false,
  onChange,
  onDragChange,
  labelClassName = "w-16",
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step?: number
  showHandle?: boolean
  hideLabel?: boolean
  onChange: (value: number) => void
  onDragChange?: (dragging: boolean) => void
  labelClassName?: string
}) {
  return <Slider.Root className="chrome-tuner" value={value} min={min} max={max} step={step} onValueChange={next => onChange(next)} onValueCommitted={() => onDragChange?.(false)}>
    {!hideLabel && <label className="chrome-tuner-label">{label}</label>}
    <Slider.Control className="chrome-tuner-control" onPointerDown={() => onDragChange?.(true)} onPointerUp={() => onDragChange?.(false)} onPointerCancel={() => onDragChange?.(false)} onLostPointerCapture={() => onDragChange?.(false)}>
      <Slider.Track className="chrome-tuner-track"><Slider.Indicator className="chrome-tuner-fill" /><span className="chrome-tuner-value">{display}</span><Slider.Thumb className="chrome-tuner-thumb" aria-label={label} aria-valuetext={display} /></Slider.Track>
    </Slider.Control>
  </Slider.Root>
}


/** A stepped choice drawn as the same box as a tuner track, with the option's name inside. */
export function Chooser({
  label,
  value,
  options,
  onChange,
  labelClassName = "w-16",
}: {
  label: string
  value: number
  options: string[]
  onChange: (index: number) => void
  labelClassName?: string
}) {
  return (
    <div className="flex items-center">
      <span className={`${labelClassName} shrink-0 text-[13px] font-medium text-ink-light`}>{label}</span>
      <div className="hud-choice-track relative h-8 flex-1 rounded-[6px] bg-parchment-dark">
        <span className="absolute inset-x-1.5 top-1/2 -translate-y-1/2 truncate font-display text-[11px] font-black text-ink-light">
          {options[value]}
        </span>
        <ChromeSelect
          value={value}
          aria-label={label}
          onChange={(event) => onChange(Number(event.target.value))}
          className="pointer-events-auto absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {options.map((option, index) => (
            <option key={option} value={index}>
              {option}
            </option>
          ))}
        </ChromeSelect>
      </div>
    </div>
  )
}

/** An on/off preference as the shared switch, recoloured for the HUD's dark parchment. */
export function ToggleRow({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="hud-switch-row flex items-center justify-between gap-3 py-0.5">
      <label htmlFor={id} className={`text-[13px] font-medium text-ink-light ${disabled ? "opacity-50" : ""}`}>{label}</label>
      <Switch id={id} className="hud-switch" checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

