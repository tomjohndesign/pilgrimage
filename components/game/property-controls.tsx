"use client"

import { useId } from "react"
import { Switch } from "@/components/ui/switch"

/**
 * One category inside the merged World panel: a gold header that folds the
 * body away, with a rule between neighbours. Everything stays in one column so
 * the tuning knobs read as a single instrument rather than a stack of cards.
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
  return (
    <section className="flex flex-col gap-1 border-t border-rule/70 py-2 first:border-t-0 first:pt-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={title}
        className="pointer-events-auto flex w-full items-baseline justify-between gap-3 text-left"
      >
        <span className="font-display text-[9px] font-black uppercase tracking-[2px] text-ink">
          {title}
        </span>
        <span className="font-display text-[9px] text-gold/70">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="flex flex-col gap-1">{children}</div>}
    </section>
  )
}


export function Tuner({
  label,
  value,
  display,
  min,
  max,
  step = 1,
  showHandle = false,
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
  onChange: (value: number) => void
  onDragChange?: (dragging: boolean) => void
  labelClassName?: string
}) {
  const fraction = max > min ? (value - min) / (max - min) : 0
  return (
    <div className="group flex items-center">
      <span className={`${labelClassName} shrink-0 text-[13px] font-medium text-ink-light`}>{label}</span>
      <div className="relative h-8 min-w-0 flex-1 overflow-hidden rounded-[6px] bg-[#c3b193]">
        {/* Fill and knob are drawn; the real range input sits on top, invisible. */}
        <div
          className="absolute inset-y-0 left-0 rounded-[6px] bg-gold"
          style={{ width: `${fraction * 100}%` }}
        />
        {/* The handle is a notch in the panel's own parchment, optionally always
            visible. It rides inside the fill's leading edge, never touching
            the rim, and stops short of the value at the far end so the two never collide. */}
        <div
          className={`absolute top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-parchment ${showHandle ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}
          style={{ left: `clamp(4px, calc(${fraction * 100}% - 8px), calc(100% - 32px))` }}
        />
        <span className="absolute right-1 top-1/2 -translate-y-1/2 font-display text-[11px] font-black text-[#2c1f0e]">
          {display}
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          onPointerDown={onDragChange ? (event) => { event.currentTarget.setPointerCapture(event.pointerId); onDragChange(true) } : undefined}
          onPointerUp={onDragChange ? () => onDragChange(false) : undefined}
          onPointerCancel={onDragChange ? () => onDragChange(false) : undefined}
          onLostPointerCapture={onDragChange ? () => onDragChange(false) : undefined}
          className="pointer-events-auto absolute inset-0 h-full w-full touch-none cursor-ew-resize opacity-0"
        />
      </div>
    </div>
  )
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
        <select
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
        </select>
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

