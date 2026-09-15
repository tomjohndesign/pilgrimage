"use client"

import { AssetEditorFrame, AssetEditorContent, AssetEditorPanels, AssetEditorSection, AssetEditorHelp, type AssetEditorNavigation } from "@/components/asset-editor-frame"
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
const BUTTON = "hud-action"

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
  return <div className="tuning-field">
    <div className="flex items-center gap-1"><label htmlFor={id}>{field.label}</label>
      <AssetEditorHelp label={field.label}>{field.description} Default: {defaultValue}. Range: {field.min}–{field.max}; step: {field.step}.</AssetEditorHelp>
    </div>
    <input id={id} type="number" min={field.min} max={field.max} step={field.step} value={value}
      onChange={event => onChange(event.target.value)} aria-invalid={invalid}
      aria-describedby={invalid ? `${id}-error` : undefined} className="playground-input" />
    {invalid && <p id={`${id}-error`} className="text-xs text-red">Use {field.min}–{field.max}, in steps of {field.step}.</p>}
  </div>
}

/** Game balance editor. Apply atomically; retain unsaved edits when another tab applies a preset. */
export function BalanceEditor({ mode, onModeChange }: AssetEditorNavigation & { active?: boolean }) {
  const [building, setBuilding] = useState(BUILD_CATALOG.find(def => !def.retired)!.id)
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

  const def = BUILD_CATALOG.find(item => item.id === building)!
  return <AssetEditorFrame mode={mode} onModeChange={onModeChange} label="Game tuning editor" version=""
    status={message || (!ready ? "Loading saved tuning…" : dirty ? "Unapplied edits" : "Using saved tuning")} detail="Saved in this browser">
    <AssetEditorContent toolbar={<>
      <button type="button" onClick={() => { if (validation.error === null) apply(validation.balance) }} disabled={!ready || validation.error !== null || !dirty} className={BUTTON}>Apply tuning</button>
      <button type="button" onClick={() => apply(DEFAULT_BALANCE)} disabled={!ready} className={BUTTON}>Restore defaults</button>
    </>}>
      <div className="workspace-form">
        {(error || storageMessage || (dirty && validation.error)) && <p role="alert" className="mb-4 text-sm text-red">{error || storageMessage || validation.error}</p>}
        {changedElsewhere && <p role="status" className="mb-4 text-sm">Saved tuning changed in another tab. Your edits are retained. <button type="button" className={BUTTON} onClick={() => {
          setSession({ source: balance, draft: toDraft(balance) }); setError(null); setMessage("Loaded the saved tuning.")
        }}>Load saved tuning</button></p>}
        <fieldset disabled={!ready}>
          <AssetEditorPanels>
            {RULE_GROUPS.filter(group => group !== "Resident income").map(group => <AssetEditorSection key={group} title={group}>
              <div className="workspace-field-grid">{RULE_FIELDS.filter(field => field.group === group && field.key !== "incomeSeconds").map(field => <NumericField key={field.key} id={field.key} field={field} value={session.draft[field.key]} defaultValue={field.default} onChange={value => update(field.key, value)} />)}</div>
            </AssetEditorSection>)}
            <AssetEditorSection title="Buildings">
              <label className="person-choice">Building<select aria-label="Building" value={building} onChange={event => setBuilding(event.target.value as typeof building)}>{BUILD_CATALOG.filter(item => !item.retired).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <p className="person-hint">Costs and unlocks apply on placement. Renown applies to every placed copy. Footprint: {def.w} × {def.d} tiles.</p>
              <div className="workspace-field-grid">{BUILDING_FIELDS.filter(field => field.key !== "goldIncome" && field.key !== "woodIncome").map(field => <NumericField key={`${building}.${field.key}`} id={`${building}.${field.key}`} field={field} value={session.draft[`${building}.${field.key}`]} defaultValue={DEFAULT_BALANCE.buildings[building][field.key]} onChange={value => update(`${building}.${field.key}`, value)} />)}</div>
            </AssetEditorSection>
            <AssetEditorSection title="Files">
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={exportPreset} disabled={validation.error !== null} className={BUTTON}>Export preset</button>
                <label className={`${BUTTON} person-file-input`}>Import preset<input type="file" accept=".json,application/json" aria-label="Import preset" onChange={async event => {
                  const file = event.target.files?.[0]; event.target.value = ""; if (!file) return
                  try {
                    const result = importBalance(await file.text())
                    if (result.error !== null) { setError(result.error); return }
                    setSession({ source: useBalanceStore.getState().balance, draft: toDraft(result.balance) })
                    setError(null); setMessage("Preset loaded. Apply tuning to use it in the game.")
                  } catch { setError("Could not read that preset file.") }
                }} /></label>
              </div>
              <p className="person-hint">Export includes unapplied edits. Import loads a draft; Apply tuning activates it in game tabs at this address.</p>
            </AssetEditorSection>
          </AssetEditorPanels>
        </fieldset>
      </div>
    </AssetEditorContent>
  </AssetEditorFrame>
}
