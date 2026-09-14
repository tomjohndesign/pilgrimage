"use client"

import { useEffect, useState } from "react"
import { useCameraStore } from "@/lib/game/camera-store"
import type { GameMap } from "@/lib/game/map/types"
import { DEFAULT_WAYFINDING, useWayfindingStore } from "@/lib/game/wayfinding-settings"
import { wayfindingJourneys, wayfindingSnapshot, type DebugJourney } from "@/lib/game/wayfinding-debug"
import { rebuildWorkerNavigation } from "@/lib/game/worker-route-memory"
import { WayfindingControls } from "./wayfinding-controls"
import { HudButton } from "./hud-button"

/** Development controls use portable JSON and the live simulation's routes. */
export function WayfindingPanel({ map, travelers, monks }: { map: GameMap; travelers: readonly { id: number; name: string }[]; monks: readonly { id: number; name: string }[] }) {
  const settings = useWayfindingStore(s => s.settings), apply = useWayfindingStore(s => s.apply)
  const selection = useCameraStore(s => s.selection)
  const [edit, setEdit] = useState<{ base: typeof settings; text: string } | null>(null)
  const draft = edit?.base === settings ? edit.text : JSON.stringify(settings, null, 2)
  const [message, setMessage] = useState("")
  const [snapshot, setSnapshot] = useState<ReturnType<typeof wayfindingSnapshot> | null>(null)
  useEffect(() => {
    const update = () => setSnapshot(wayfindingSnapshot(map, selection))
    update(); const timer = setInterval(update, 500)
    return () => clearInterval(timer)
  }, [map, selection, settings])
  const copy = async (value: unknown) => {
    try { await navigator.clipboard.writeText(JSON.stringify(value, null, 2)); setMessage("Copied JSON.") }
    catch { setMessage("Clipboard unavailable. Select and copy the JSON below.") }
  }
  return <div className="space-y-2 text-[11px] text-ink-light">
    <WayfindingControls map={map} />
    <details><summary className="cursor-pointer font-display text-ink">Import / export JSON</summary>
    <label className="block">Wayfinding JSON
      <textarea aria-label="Wayfinding JSON" spellCheck={false} rows={12} value={draft} onChange={e => setEdit({ base: settings, text: e.target.value })}
        className="mt-1 w-full border border-rule bg-parchment p-2 font-mono text-[11px] text-ink" />
    </label>
    <div className="flex flex-wrap gap-1">
      <HudButton onClick={() => { try { apply(draft); setEdit(null); setMessage("Applied. New trips use these rules; current reservations finish. Debug closures also stop incoming bread/water visits.") } catch (e) { setMessage(e instanceof Error ? e.message : "Invalid JSON") } }}>Apply JSON</HudButton>
      <HudButton onClick={() => void copy(settings)}>Copy settings</HudButton>
      <HudButton onClick={() => { const json = JSON.stringify(DEFAULT_WAYFINDING, null, 2); apply(json); setEdit(null); setMessage("Defaults restored.") }}>Reset</HudButton>
    </div>
    </details>
    <p role="status" className="break-words">{message}</p>

    <p>{snapshot?.cache.destinationFields ?? 0} shared fields · {snapshot?.cache.fieldBuilds ?? 0} builds · {snapshot?.cache.fieldHits ?? 0} reuses · {snapshot?.cache.destinationCells ?? 0} cells</p>
    {snapshot?.journeys.map(j => <button key={`${j.kind}:${j.id}`} type="button" className="block text-left text-ink underline"
      onClick={() => useCameraStore.getState().select({ kind: j.kind, id: j.id })}>
      {(j.kind === "monk" ? monks : travelers).find(person => person.id === j.id)?.name ?? `${j.kind} ${j.id}`} · {j.activity} → {j.destination ?? "route endpoint"} · {j.remaining.toFixed(1)} tiles
    </button>)}
    {!!selection && !snapshot?.journeys.length && <p>No incoming routes for this selection.</p>}
    {!!snapshot?.candidates.length && <div className="max-h-52 overflow-auto"><p>Service probes (geometry and availability; activity priorities decide when to seek):</p>
      {snapshot.candidates.map(c => <p key={c.id} className="my-1"><button type="button" className="text-ink underline" onClick={() => useCameraStore.getState().select({ kind: "building", id: c.id })}>{c.id}</button> · {c.availability} · {c.distance === null ? c.reachability : `${c.distance.toFixed(1)} tiles · score ${c.score?.toFixed(1)}`}</p>)}
    </div>}
    <div className="flex flex-wrap gap-1">
      <HudButton onClick={() => void copy(snapshot)}>Copy inspection JSON</HudButton>
      <HudButton onClick={() => { rebuildWorkerNavigation(map); setMessage("Navigation cleared. Active service walks check their routes on the next simulation step.") }}>Rebuild navigation</HudButton>
    </div>
    <details><summary>Inspection JSON</summary><textarea aria-label="Wayfinding inspection JSON" readOnly rows={8} value={JSON.stringify(snapshot, null, 2)} className="w-full border border-rule bg-parchment p-2 font-mono text-[10px]" /></details>
  </div>
}


/** Keep inbound people visible at the point where a building is selected. */
export function WayfindingSelection({ map, travelers, monks, onSettings }: {
  map: GameMap; travelers: readonly { id: number; name: string }[]; monks: readonly { id: number; name: string }[]; onSettings: () => void
}) {
  const selection = useCameraStore(s => s.selection)
  const [journeys, setJourneys] = useState<DebugJourney[]>([])
  useEffect(() => {
    const update = () => setJourneys(wayfindingJourneys(map, selection))
    update(); const timer = setInterval(update, 500)
    return () => clearInterval(timer)
  }, [map, selection])
  if (!selection || !["building", "traveler", "monk"].includes(selection.kind)) return null
  return <div className="border-t border-rule px-4 py-3 text-[11px] text-ink-light">
    <p className="mb-2 font-display text-ink">Wayfinding · {selection.kind === "building" ? `${journeys.length} incoming` : "Current route"}</p>
    {journeys.map(j => <button key={`${j.kind}:${j.id}`} type="button" className="mb-1 block text-left text-ink underline"
      onClick={() => useCameraStore.getState().select({ kind: j.kind, id: j.id })}>
      {(j.kind === "monk" ? monks : travelers).find(p => p.id === j.id)?.name ?? `${j.kind} ${j.id}`} · {j.remaining.toFixed(1)} tiles → {j.destination ?? "route endpoint"}
    </button>)}
    {!journeys.length && <p className="mb-2">No incoming routes.</p>}
    <HudButton onClick={onSettings}>Wayfinding settings</HudButton>
  </div>
}
