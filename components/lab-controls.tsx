"use client"

export const labButton = "border border-rule bg-parchment-dark px-3 py-2 font-display text-[10px] uppercase tracking-[1.5px] text-ink hover:border-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-40"
export const labInput = "w-full border border-rule bg-parchment px-2 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-gold"

export function LabSelect({ label, value, options, onChange }: { label: string; value: string; options: Record<string, string>; onChange: (value: string) => void }) {
  return <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-light">
    {label}<select aria-label={label} className={labInput} value={value} onChange={event => onChange(event.target.value)}>
      {Object.entries(options).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
    </select>
  </label>
}

export function LabSlider({ label, value, min, max, step, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="flex flex-col gap-2 text-xs text-ink-light">
    <span className="flex justify-between gap-3">{label}<span className="tabular-nums text-ink">{Number(value.toFixed(step < .01 ? 3 : 2))}{suffix}</span></span>
    <input aria-label={label} type="range" className="w-full accent-gold" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
  </label>
}
