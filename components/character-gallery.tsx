"use client"

import dynamic from "next/dynamic"

import { TRAVELER_TYPES, type StatRange, type TravelerTypeDef } from "@/lib/game/travelers"

/* three.js touches browser globals on import, so previews are client-only. */
const CharacterPreview = dynamic(
  () => import("./character-preview").then((m) => m.CharacterPreview),
  { ssr: false },
)

const TYPES = Object.values(TRAVELER_TYPES)
const TOTAL_WEIGHT = TYPES.reduce((sum, t) => sum + t.weight, 0)

function CellLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-display text-[9px] uppercase tracking-[2px] text-gold">
      {children}
    </div>
  )
}

function range({ min, max }: StatRange): string {
  return min === max ? String(min) : `${min}–${max}`
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[13px] italic text-ink-light">{label}</span>
      <span className="text-right font-display text-[10px] text-ink">{value}</span>
    </div>
  )
}

function CharacterCard({ type }: { type: TravelerTypeDef }) {
  return (
    <article className="border border-rule bg-parchment p-5 shadow-[0_0_0_3px_var(--parchment-dark),0_0_0_4px_var(--rule),4px_4px_24px_rgba(0,0,0,0.6)]">
      <div className="mb-1 flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 border border-rule"
          style={{ backgroundColor: type.color }}
        />
        <h2 className="font-display text-base font-semibold uppercase tracking-[3px] text-ink">
          {type.label}
        </h2>
      </div>
      <p className="mb-4 text-[14px] italic text-ink-light">
        {percent(type.weight / TOTAL_WEIGHT)} of the road
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <CellLabel>In game</CellLabel>
          <div className="aspect-square w-full border border-rule">
            <CharacterPreview type={type} />
          </div>
        </div>
        <div>
          <CellLabel>Rolls</CellLabel>
          <div className="flex flex-col gap-0.5">
            <Row label="Gold" value={`${range(type.gold)} ✦`} />
            <Row label="Status" value={range(type.status)} />
            <Row label="Piety" value={range(type.piety)} />
            <Row label="Pace" value={`${type.paceMin}–${type.paceMax}×`} />
            <Row label="Jobless" value={percent(type.joblessChance)} />
            <Row label="Skills" value={range(type.skillCount)} />
          </div>
        </div>
      </div>

      <p className="mt-4 text-[12px] text-ink-light">
        <span className="font-display text-[9px] uppercase tracking-[2px] text-gold">Trades </span>
        {type.skills.join(", ")}
      </p>
      <p className="mt-1 text-[12px] text-ink-light">
        <span className="font-display text-[9px] uppercase tracking-[2px] text-gold">Colour </span>
        {type.color}
      </p>
    </article>
  )
}

export function CharacterGallery() {
  return (
    <div className="grid w-full max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
      {TYPES.map((type) => (
        <CharacterCard key={type.id} type={type} />
      ))}
    </div>
  )
}
