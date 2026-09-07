"use client"

import Link from "next/link"
import type { useSettlement } from "@/hooks/use-settlement"
import { useCameraStore } from "@/lib/game/camera-store"
import type { Monk } from "@/lib/game/monks"
import type { Relic } from "@/lib/game/relic"
import { tileToWorldX, tileToWorldZ } from "@/lib/game/map/types"
import {
  jobBuildings,
  renownTiers,
  settlementIncome,
} from "@/lib/game/settlement"
import { BUILDING_KINDS } from "@/lib/game/buildings"

/**
 * Treasury and establishment-wide progression inside the minimap details dock.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1GB-0
 */
export function SettlementPanel({
  economy,
  monks,
  relic,
  onClose,
}: {
  economy: ReturnType<typeof useSettlement>
  monks: Monk[]
  relic: Relic | null
  onClose: () => void
}) {
  const { map, settlement, balance } = economy
  if (!map || !relic) return null
  const tiers = renownTiers(balance)
  const renown = economy.renown!
  const income = settlementIncome(settlement, economy.residents.length, balance)
  const tier = [...tiers].reverse().find((t) => renown.total >= t.renown)!
  const next = tiers.find((t) => renown.total < t.renown)
  const focusShrine = () => {
    const hovel = map.buildings.find((b) => b.id === map.site?.hovelId)
    if (hovel)
      useCameraStore
        .getState()
        .panTo(
          tileToWorldX(map, hovel.x) + (hovel.w - 1) / 2,
          tileToWorldZ(map, hovel.z) + (hovel.d - 1) / 2,
        )
  }
  return (
    <section className="hud-inspector-content text-ink">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xs uppercase tracking-[2px]">Shrine</h2>
        <Link
          href="/tuning"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-ink-light hover:text-red"
          title="Open tuning in a new tab; keep this settlement running"
        >
          Tune ↗
        </Link>
        <button
          type="button"
          onClick={focusShrine}
          className="text-[11px] text-ink-light hover:text-red"
        >
          Locate ↗
        </button>
        <button type="button" aria-label="Dismiss settlement" onClick={onClose}>✕</button>
      </div>
      <div className="my-3 grid grid-cols-2 gap-2">
        {(["gold", "wood"] as const).map((resource) => (
          <div key={resource} className="rounded border border-rule bg-parchment-dark px-2 py-1.5">
            <div className="text-[11px] capitalize text-ink-light">{resource}</div>
            <div className="font-display text-lg tabular-nums">
              {settlement.resources[resource]}
            </div>
            <div className="text-[10px] text-ink-light">
              +{income[resource]} / {balance.rules.incomeSeconds}s
            </div>
          </div>
        ))}
      </div>
      <p className="mb-2 text-[11px] text-ink-light">
        {economy.visits} visits · {economy.residents.length - monks.length} settlers · {Math.max(0, jobBuildings(map)
          .reduce((jobs, b) => jobs + BUILDING_KINDS[b.kind].jobs, 0) - (economy.residents.length - monks.length))} open jobs
      </p>
      <details>
        <summary className="cursor-pointer text-xs">
          <span className="font-display">{renown.total} renown</span> · {tier.label}
        </summary>
        <dl className="mt-2 space-y-1 text-[11px]">
          {(["buildings", "individuals", "scenery", "relics", "visits"] as const).map((source) => (
            <div key={source} className="flex justify-between">
              <dt className="capitalize">{source}</dt>
              <dd>+{renown[source]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[11px] italic text-ink-light">
          The whole establishment draws pilgrims. The brothers gather wood and collect offerings.
        </p>
      </details>
      {next && (
        <>
          <div
            role="progressbar"
            aria-label={`Renown toward ${next.label}`}
            aria-valuenow={renown.total}
            aria-valuemin={tier.renown}
            aria-valuemax={next.renown}
            className="mt-2 h-1.5 overflow-hidden rounded bg-parchment-dark"
          >
            <div
              className="h-full bg-gold"
              style={{
                width: `${(100 * (renown.total - tier.renown)) / (next.renown - tier.renown)}%`,
              }}
            />
          </div>
          <p className="mt-1 text-[10px] text-ink-light">
            {next.renown - renown.total} renown to {next.label.toLowerCase()}
          </p>
        </>
      )}
      <p className="text-[10px] italic text-ink-light">
        Reloading, new maps and terrain changes start a fresh settlement.
      </p>
    </section>
  )
}
