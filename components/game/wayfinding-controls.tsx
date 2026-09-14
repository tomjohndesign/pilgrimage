"use client"

import { useState } from "react"
import { useCameraStore } from "@/lib/game/camera-store"
import type { GameMap } from "@/lib/game/map/types"
import { tileToWorldX, tileToWorldZ } from "@/lib/game/map/types"
import { buildingRouting, destinationEnabled, useWayfindingStore } from "@/lib/game/wayfinding-settings"
import { wayfindingNetwork } from "@/lib/game/wayfinding-nodes"
import { Chooser, ToggleRow, Tuner } from "./property-controls"
import { HudButton } from "./hud-button"

export function WayfindingControls({ map }: { map: GameMap }) {
  const { settings, update, updateBuilding, selectedNodeId, selectNode } = useWayfindingStore()
  const selection = useCameraStore(s => s.selection)
  const [buildingId, setBuildingId] = useState("")
  const [filter, setFilter] = useState("")
  const nodes = wayfindingNetwork(map).nodes
  const node = nodes.find(n => n.id === selectedNodeId)
  const id = selection?.kind === "building" ? selection.id : buildingId
  const building = map.buildings.find(b => b.id === id)
  const rules = buildingRouting(id, settings), custom = !!settings.buildings[id]
  const service = building && ["alms-table", "well", "watering-hole", "tavern", "market"].includes(building.buildType ?? "")
  const selectBuilding = (id: string) => { setBuildingId(id); selectNode(null); useCameraStore.getState().select(id ? { kind: "building", id } : null) }
  const focusNode = (id: string) => {
    selectNode(id || null)
    const node = nodes.find(n => n.id === id)
    if (node) useCameraStore.getState().panTo(tileToWorldX(map, node.tile.x), tileToWorldZ(map, node.tile.z))
  }
  const selectClass = "w-full border border-rule bg-parchment-dark p-1 text-xs text-ink"
  return <div className="space-y-3">
    <div className="space-y-1">
      <ToggleRow label="NPC paths" checked={settings.showRoutes} onChange={showRoutes => update({ showRoutes })} />
      <Chooser label="Show paths" labelClassName="w-28" value={settings.routeScope === "all" ? 1 : 0} options={["Selected", "All NPCs"]} onChange={i => update({ routeScope: i ? "all" : "selected" })} />
      <ToggleRow label="Road & approach network" checked={settings.showNetwork} onChange={showNetwork => update({ showNetwork })} />
      <ToggleRow label="Direction nodes" checked={settings.showNodes} onChange={showNodes => update({ showNodes })} />
      <ToggleRow label="Selected distance field" checked={settings.showField} onChange={showField => update({ showField })} />
      <p>Paths and nodes remain visible when characters are hidden. Cyan: active walks. Gold: authored roads and approaches. Squares: turns, entrances and junctions.</p>
    </div>
    <div className="space-y-1 border-t border-rule pt-2">
      <Tuner label="Travel budget" labelClassName="w-28" value={settings.travelBudget} display={`${settings.travelBudget} tiles`} min={1} max={100} showHandle onChange={travelBudget => update({ travelBudget })} />
      <Chooser label="Choose by" labelClassName="w-28" value={settings.selection === "travel" ? 0 : 1} options={["Walking distance", "Geographic distance"]} onChange={i => update({ selection: i ? "geographic" : "travel" })} />
    </div>
    <div className="space-y-1 border-t border-rule pt-2">
      <label className="block">Building routing
        <select aria-label="Building routing" className={selectClass} value={building?.id ?? ""} onChange={e => selectBuilding(e.target.value)}>
          <option value="">Select a building…</option>
          {map.buildings.map(b => <option value={b.id} key={b.id}>{b.label} · {b.id}</option>)}
        </select>
      </label>
      {building && <>
        <p className="break-all">{building.id}</p>
        {service ? <>
          <ToggleRow label="Accept service trips" checked={destinationEnabled(id, settings)} onChange={enabled => { updateBuilding(id, { enabled }); if (enabled) update({ closedDestinations: settings.closedDestinations.filter(key => key !== id) }) }} />
          <ToggleRow label="Override travel budget" checked={settings.buildings[id]?.travelBudget !== undefined} onChange={enabled => updateBuilding(id, { travelBudget: enabled ? settings.travelBudget : undefined })} />
          {settings.buildings[id]?.travelBudget !== undefined && <Tuner label="Building budget" labelClassName="w-28" value={rules.travelBudget} display={`${rules.travelBudget} tiles`} min={1} max={100} showHandle onChange={travelBudget => updateBuilding(id, { travelBudget })} />}
          <Tuner label="Preference" labelClassName="w-28" value={rules.preference} display={`${rules.preference > 0 ? "+" : ""}${rules.preference}`} min={-40} max={40} showHandle onChange={preference => updateBuilding(id, { preference })} />
          <p>Positive preference makes this destination more attractive. The complete walk must still fit its budget. Staffing and reservations still apply.</p>
          <label className="block">Approach via node
            <select aria-label="Approach via node" className={selectClass} value={rules.viaNodeId ?? ""} onChange={e => updateBuilding(id, { viaNodeId: e.target.value || null })}>
              <option value="">Automatic shortest approach</option>
              {rules.viaNodeId && !nodes.some(n => n.id === rules.viaNodeId) && <option value={rules.viaNodeId}>Missing node: {rules.viaNodeId}</option>}
              {nodes.map(n => <option key={n.id} value={n.id}>{n.label} ({n.tile.x}, {n.tile.z})</option>)}
            </select>
          </label>
          {rules.viaNodeId && !nodes.some(n => n.id === rules.viaNodeId) && <p role="alert">This approach node is missing. New service trips are blocked until it is changed or cleared.</p>}
          <HudButton disabled={!custom && !settings.closedDestinations.includes(id)} onClick={() => { updateBuilding(id, null); update({ closedDestinations: settings.closedDestinations.filter(key => key !== id) }) }}>Reset building</HudButton>
        </> : <p>This building has navigation nodes below. Service budgets and preferences apply to food and water destinations; work and shrine routines keep their own rules.</p>}
      </>}
    </div>
    <div className="space-y-1 border-t border-rule pt-2">
      <label className="block">Find a direction node<input aria-label="Find a direction node" value={filter} onChange={e => setFilter(e.target.value)} className={selectClass} placeholder="Enclave, entrance, bridge…" /></label>
      <select aria-label="Direction node" className={selectClass} value={selectedNodeId ?? ""} onChange={e => focusNode(e.target.value)}>
        <option value="">{nodes.length} navigation nodes</option>
        {nodes.filter(n => n.id === selectedNodeId || `${n.label} ${n.id}`.toLowerCase().includes(filter.toLowerCase())).map(n => <option key={n.id} value={n.id}>{n.label} ({n.tile.x}, {n.tile.z})</option>)}
      </select>
      {node && <>
        <p className="break-all">{node.id} · tile {node.tile.x}, {node.tile.z} · {node.kind}</p>
        <p>{node.links.length} connected nodes. Selecting a node shows its distance field when enabled.</p>
        {service && <HudButton onClick={() => updateBuilding(id, { viaNodeId: node.id })}>Use for {building.label}</HudButton>}
        <div className="flex flex-wrap gap-1">{node.links.map(id => <HudButton key={id} onClick={() => focusNode(id)}>{nodes.find(n => n.id === id)?.label ?? id}</HudButton>)}</div>
        <HudButton onClick={() => selectNode(null)}>Clear node</HudButton>
      </>}
    </div>
    <p>Controls apply immediately to new service decisions. In-flight trips finish their chosen approach; disabling a service stops incoming visits. JSON below stays synchronized with every control.</p>
  </div>
}
