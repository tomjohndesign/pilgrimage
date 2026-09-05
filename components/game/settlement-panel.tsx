"use client"

import Link from "next/link"
import { buildCatalog, buildingIncomeLabel } from "@/lib/game/balance"
import { influenceRadius } from "@/lib/game/build-influence"
import { useState } from "react"
import type { useSettlement } from "@/hooks/use-settlement"
import { useCameraStore } from "@/lib/game/camera-store"
import type { Monk } from "@/lib/game/monks"
import type { Relic } from "@/lib/game/relic"
import { tileToWorldX, tileToWorldZ } from "@/lib/game/map/types"
import {
  canAfford,
  placementError,
  renownTiers,
  settlementIncome,
} from "@/lib/game/settlement"

/**
 * Treasury, establishment-wide progression and the first build catalogue.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0
 */
export function SettlementPanel({
  economy,
  monks,
  relic,
}: {
  economy: ReturnType<typeof useSettlement>
  monks: Monk[]
  relic: Relic | null
}) {
  const [buildOpen, setBuildOpen] = useState(false)
  const hovered = useCameraStore((s) => s.hovered)
  const { map, settlement, buildType, chooseBuild, balance } = economy
  if (!map || !relic) return null
  const catalog = buildCatalog(balance)
  const tiers = renownTiers(balance)
  const renown = economy.renown!
  const income = settlementIncome(settlement, economy.residents.length, balance)
  const tier = [...tiers].reverse().find((t) => renown.total >= t.renown)!
  const next = tiers.find((t) => renown.total < t.renown)
  const selected = catalog.find((item) => item.id === buildType)
  const previewError =
    selected && !canAfford(settlement.resources, selected.cost)
      ? "Not enough gold or wood."
      : selected && renown.total < selected.requiredRenown
      ? `Requires ${selected.requiredRenown} shrine renown.`
      : selected && hovered
        ? placementError(map, selected, hovered, balance)
        : null
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
    <section className="mb-3 border-b border-rule pb-3 text-ink">
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
        {economy.visits} visits · {economy.residents.length - monks.length} settlers · {Math.max(0, map.buildings.filter((b) => b.buildType === "lumberCamp").length * 3 - (economy.residents.length - monks.length))} open jobs
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
      <button
        type="button"
        aria-expanded={buildOpen}
        onClick={() => {
          setBuildOpen(!buildOpen)
          chooseBuild(null)
        }}
        className="mt-3 w-full border border-rule bg-ink px-3 py-2 font-display text-[11px] uppercase tracking-[2px] text-parchment hover:bg-ink-light"
      >
        {buildOpen ? "Close catalogue" : "Build & buy"}
      </button>
      {selected && (
        <div className="mt-2 border border-gold p-2 text-[11px]">
          <p>Placing {selected.label.toLowerCase()}</p>
          <ul className="mt-2 space-y-1 text-ink-light">
            <li><span className="mr-1 inline-block h-2 w-2 border border-[#47632e] bg-[#93bc6c]" />Green: available ground</li>
            <li><span className="mr-1 inline-block h-2 w-2 border border-red bg-[#db6656]" />Red: blocked ground</li>
            <li><span className="mr-1 inline-block h-2 w-2 border border-gold" />Gold edge: influence boundary</li>
          </ul>
          <p className="mt-2 text-ink-light">The whole footprint must fit. Unmarked land is outside influence. The cursor checks access and supplies.</p>
          <p className="mt-1 text-ink-light">
            {previewError ?? "Click available ground inside the influence boundary."}
          </p>
          <button
            type="button"
            onClick={() => chooseBuild(null)}
            className="mt-1 text-red underline"
          >
            Cancel placement
          </button>
        </div>
      )}
      {buildOpen && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] italic text-ink-light">
            Choose a structure to see building influence. Build beside the approach or extend
            your reach with renown sources. Pay on placement. Esc cancels.
          </p>
          {catalog.map((item) => {
            const locked = renown.total < item.requiredRenown
            const affordable = canAfford(settlement.resources, item.cost)
            return (
              <button
                type="button"
                key={item.id}
                disabled={locked || !affordable}
                aria-pressed={buildType === item.id}
                onClick={() => {
                  chooseBuild(buildType === item.id ? null : item.id)
                  useCameraStore.getState().select(null)
                }}
                className={`w-full rounded border p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buildType === item.id ? "border-gold bg-gold/15" : "border-rule hover:border-gold"}`}
              >
                <div className="flex items-baseline justify-between gap-1">
                  <span className="font-display text-[11px]">{item.label}</span>
                  <span className="whitespace-nowrap text-[10px]">{item.renown ? `+${item.renown} renown` : "No renown"}</span>
                </div>
                <div className="mt-1 text-[11px]">
                  <span className={settlement.resources.gold < item.cost.gold ? "text-red" : ""}>
                    {item.cost.gold} gold
                  </span>{" "}
                  ·{" "}
                  <span className={settlement.resources.wood < item.cost.wood ? "text-red" : ""}>
                    {item.cost.wood} wood
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-ink-light">
                  {item.category === "scenery" ? "Scenery" : "Building"} · {item.w} × {item.d} tiles
                </div>
                <div className="mt-1 text-[11px] italic text-ink-light">{item.description}</div>
                <div className="mt-1 text-[10px] text-ink-light">
                  {buildingIncomeLabel(item, balance)}
                </div>
                <div className="mt-1 text-[10px] text-ink-light">
                  {item.renown > 0
                    ? `Spreads influence ${influenceRadius(item.renown, balance).toFixed(1)} tiles`
                    : "Does not extend building influence"}
                </div>
                {locked && (
                  <div className="mt-1 text-[10px] text-red">
                    Requires {item.requiredRenown} shrine renown
                  </div>
                )}
                {!locked && !affordable && (
                  <div className="mt-1 text-[10px] text-red">Not enough supplies</div>
                )}
              </button>
            )
          })}
        </div>
      )}
      <p role="status" aria-live="polite" className="mt-2 text-[11px] text-ink-light">
        {economy.message}
      </p>
      <p className="text-[10px] italic text-ink-light">
        Reloading, new maps and terrain changes start a fresh settlement.
      </p>
    </section>
  )
}
