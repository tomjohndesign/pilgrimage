"use client"

import Link from "next/link"
import { useState } from "react"
import {
  BUILD_CATALOG,
  BUILDING_FIELDS,
  DEFAULT_BALANCE,
  RULE_FIELDS,
  RULE_GROUPS,
  exportBalance,
  importBalance,
  validateBalance,
  type GameBalance,
} from "@/lib/game/balance"
import { useBalanceStore } from "@/lib/game/balance-store"

type Draft = Record<string, string>
function toDraft(balance: GameBalance): Draft {
  return Object.fromEntries([
    ...RULE_FIELDS.map((field) => [field.key, String(balance.rules[field.key])]),
    ...BUILD_CATALOG.flatMap((def) =>
      BUILDING_FIELDS.map((field) => [
        `${def.id}.${field.key}`,
        String(balance.buildings[def.id][field.key]),
      ]),
    ),
  ])
}
function parseDraft(draft: Draft): ReturnType<typeof validateBalance> {
  const number = (key: string) => (draft[key]?.trim() ? Number(draft[key]) : NaN)
  return validateBalance({
    rules: Object.fromEntries(RULE_FIELDS.map((field) => [field.key, number(field.key)])),
    buildings: Object.fromEntries(
      BUILD_CATALOG.map((def) => [
        def.id,
        Object.fromEntries(
          BUILDING_FIELDS.map((field) => [field.key, number(`${def.id}.${field.key}`)]),
        ),
      ]),
    ),
  })
}
const BUTTON =
  "border border-rule bg-parchment-dark px-4 py-2 text-sm text-ink hover:border-gold disabled:opacity-50"

function NumericField({
  id,
  field,
  value,
  defaultValue,
  onChange,
}: {
  id: string
  field: { label: string; description: string; min: number; max: number; step: number }
  value: string
  defaultValue: number
  onChange: (value: string) => void
}) {
  const invalid =
    value.trim() === "" ||
    !Number.isFinite(Number(value)) ||
    Number(value) < field.min ||
    Number(value) > field.max ||
    Math.abs(Number(value) / field.step - Math.round(Number(value) / field.step)) > 0.00001
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {field.label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="number"
          min={field.min}
          max={field.max}
          step={field.step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          aria-describedby={`${id}-help`}
          className={`w-28 rounded border bg-parchment-dark px-3 py-2 font-display text-sm tabular-nums outline-none focus:border-gold ${invalid ? "border-red" : "border-rule"}`}
        />
        <span className="text-xs text-ink-light">Default {defaultValue}</span>
      </div>
      <p id={`${id}-help`} className="text-sm leading-snug text-ink-light">
        {field.description}
      </p>
      {invalid && (
        <p className="text-xs text-red">
          Use {field.min}–{field.max}, in steps of {field.step}.
        </p>
      )}
    </div>
  )
}

/** Game balance editor. Apply atomically; retain unsaved edits when another tab applies a preset. */
export function BalanceEditor() {
  const balance = useBalanceStore((s) => s.balance)
  const ready = useBalanceStore((s) => s.ready)
  const storageMessage = useBalanceStore((s) => s.storageMessage)
  const [session, setSession] = useState(() => ({ source: balance, draft: toDraft(balance) }))
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(session.draft) !== JSON.stringify(toDraft(session.source))
  if (session.source !== balance && !dirty) setSession({ source: balance, draft: toDraft(balance) })
  const changedElsewhere = session.source !== balance && dirty
  const validation = parseDraft(session.draft)
  const update = (key: string, value: string) => {
    setSession((current) => ({ ...current, draft: { ...current.draft, [key]: value } }))
    setMessage("")
    setError(null)
  }
  const apply = (next: GameBalance) => {
    const failure = useBalanceStore.getState().apply(next)
    if (failure) {
      setError(failure)
      return
    }
    const saved = useBalanceStore.getState().balance
    setSession({ source: saved, draft: toDraft(saved) })
    setError(null)
    setMessage(
      "Saved. Open game tabs now use this tuning. Starting supplies apply to new settlements.",
    )
  }
  const exportPreset = () => {
    if (validation.error !== null) {
      setError(validation.error)
      return
    }
    const url = URL.createObjectURL(
      new Blob([exportBalance(validation.balance)], { type: "application/json" }),
    )
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "pilgrimage-balance.json"
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage("Preset exported. Apply tuning to use any unsaved edits in the game.")
  }

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-5 mb-8 border-b border-rule bg-parchment/95 px-5 py-4 shadow-sm backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (validation.error === null) apply(validation.balance)
            }}
            disabled={!ready || validation.error !== null || !dirty}
            className={`${BUTTON} !bg-ink !text-parchment`}
          >
            Apply tuning
          </button>
          <button
            type="button"
            onClick={() => apply(DEFAULT_BALANCE)}
            disabled={!ready}
            className={BUTTON}
          >
            Restore defaults
          </button>
          <button
            type="button"
            onClick={exportPreset}
            disabled={!ready || validation.error !== null}
            className={BUTTON}
          >
            Export preset
          </button>
          <label className={`${BUTTON} cursor-pointer`}>
            Import preset
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Import preset"
              className="sr-only"
              disabled={!ready}
              onChange={async (event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (!file) return
                try {
                  const result = importBalance(await file.text())
                  if (result.error !== null) {
                    setError(result.error)
                    return
                  }
                  setSession({
                    source: useBalanceStore.getState().balance,
                    draft: toDraft(result.balance),
                  })
                  setError(null)
                  setMessage("Preset loaded. Apply tuning to use it in the game.")
                } catch {
                  setError("Could not read that preset file.")
                }
              }}
            />
          </label>
          <span className="text-sm italic text-ink-light">
            {!ready ? "Loading saved tuning…" : dirty ? "Unapplied edits" : "Using saved tuning"}
          </span>
        </div>
        <p role="status" aria-live="polite" className="mt-2 text-sm text-ink-light">
          {message}
        </p>
        {(error || storageMessage || (dirty && validation.error)) && (
          <p role="alert" className="mt-2 text-sm text-red">
            {error || storageMessage || validation.error}
          </p>
        )}
        {changedElsewhere && (
          <p className="mt-2 text-sm text-ink-light">
            Another tab changed the saved tuning. Your edits are still here.{" "}
            <button
              type="button"
              onClick={() => {
                setSession({ source: balance, draft: toDraft(balance) })
                setError(null)
                setMessage("Loaded the saved tuning.")
              }}
              className="underline"
            >
              Load saved tuning
            </button>{" "}
            or apply your edits to replace it.
          </p>
        )}
      </div>

      <div className="mb-8 border-l-2 border-gold bg-parchment-dark p-4 text-base leading-relaxed text-ink-light">
        Keep your game open and use this page in a second tab. Applied settings are saved in this
        browser and shared with game tabs at the same address. Buildings and supplies stay in place.
        New costs affect future purchases; income and renown changes affect existing settlements
        too.
        <div className="mt-2 flex flex-wrap gap-4">
          <Link
            href="/play"
            target="_blank"
            rel="noopener noreferrer"
            className="text-red underline"
          >
            Open game in another tab ↗
          </Link>
          <Link href="/docs/game-specs" className="text-red underline">
            Read the game specifications →
          </Link>
        </div>
      </div>

      <fieldset disabled={!ready} className="space-y-6">
        {RULE_GROUPS.map((group, index) => (
          <details key={group} open={index < 2} className="rounded border border-rule p-5">
            <summary className="cursor-pointer font-display text-base text-ink">{group}</summary>
            <div className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {RULE_FIELDS.filter((field) => field.group === group).map((field) => (
                <NumericField
                  key={field.key}
                  id={field.key}
                  field={field}
                  value={session.draft[field.key]}
                  defaultValue={field.default}
                  onChange={(value) => update(field.key, value)}
                />
              ))}
            </div>
          </details>
        ))}
        <section>
          <h2 className="mb-2 font-display text-xl text-ink">Buildings & scenery</h2>
          <p className="mb-5 text-base text-ink-light">
            Costs and unlocks apply on placement. Renown and income apply to every placed copy.
            Footprints and appearance stay fixed.
          </p>
          <div className="space-y-5">
            {BUILD_CATALOG.map((def) => (
              <details
                key={def.id}
                className="rounded border border-rule p-5"
                open={def.id === "shelter"}
              >
                <summary className="cursor-pointer font-display text-base text-ink">
                  {def.label}{" "}
                  <span className="ml-2 font-serif text-sm text-ink-light">
                    {def.category === "scenery" ? "Scenery" : "Building"} · {def.w} × {def.d} tiles
                  </span>
                </summary>
                <div className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                  {BUILDING_FIELDS.map((field) => (
                    <NumericField
                      key={field.key}
                      id={`${def.id}.${field.key}`}
                      field={field}
                      value={session.draft[`${def.id}.${field.key}`]}
                      defaultValue={DEFAULT_BALANCE.buildings[def.id][field.key]}
                      onChange={(value) => update(`${def.id}.${field.key}`, value)}
                    />
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
      </fieldset>
    </div>
  )
}
