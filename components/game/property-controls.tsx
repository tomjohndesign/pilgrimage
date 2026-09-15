"use client"

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
  return <Slider.Root className="chrome-tuner" value={value} min={min} max={max} step={step} onValueChange={next => onChange(next)} onValueCommitted={() => onDragChange?.(false)}>
    <label className="chrome-tuner-label">{label}</label>
    <Slider.Control className="chrome-tuner-control" onPointerDown={() => onDragChange?.(true)} onPointerUp={() => onDragChange?.(false)} onPointerCancel={() => onDragChange?.(false)} onLostPointerCapture={() => onDragChange?.(false)}>
      <Slider.Track className="chrome-tuner-track"><Slider.Indicator className="chrome-tuner-fill" /><span className="chrome-tuner-value">{display}</span><Slider.Thumb className="chrome-tuner-thumb" aria-label={label} aria-valuetext={display} /></Slider.Track>
    </Slider.Control>
  </Slider.Root>
}
