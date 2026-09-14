import { create } from "zustand"
import { z } from "zod"

export const WAYFINDING_DEBUG = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_PROPERTY_PANELS === "1"
const buildingRoutingSchema = z.object({
  enabled: z.boolean().default(true),
  travelBudget: z.number().min(1).max(100).optional(),
  preference: z.number().min(-40).max(40).default(0),
  viaNodeId: z.string().min(1).nullable().default(null),
}).strict()
export const wayfindingSchema = z.object({
  version: z.literal(1),
  travelBudget: z.number().min(1).max(100),
  selection: z.enum(["travel", "geographic"]),
  closedDestinations: z.array(z.string().min(1)).max(256),
  showRoutes: z.boolean(),
  showField: z.boolean(),
  routeScope: z.enum(["selected", "all"]).default("all"),
  showNetwork: z.boolean().default(true),
  showNodes: z.boolean().default(true),
  buildings: z.record(buildingRoutingSchema).default({}),
}).strict()
export type WayfindingSettings = z.infer<typeof wayfindingSchema>
export type BuildingRouting = z.infer<typeof buildingRoutingSchema>
export const DEFAULT_BUILDING_ROUTING: BuildingRouting = { enabled: true, preference: 0, viaNodeId: null }
export const DEFAULT_WAYFINDING: WayfindingSettings = {
  version: 1, travelBudget: 40, selection: "travel", closedDestinations: [], showRoutes: true, showField: false,
  routeScope: "all", showNetwork: true, showNodes: true, buildings: {},
}
interface WayfindingStore {
  settings: WayfindingSettings
  selectedNodeId: string | null
  nodeFocusRevision: number
  selectNode: (id: string | null) => void
  apply: (json: string) => void
  update: (patch: Partial<WayfindingSettings>) => void
  updateBuilding: (id: string, patch: Partial<BuildingRouting> | null) => void
}
export const useWayfindingStore = create<WayfindingStore>(set => ({
  settings: DEFAULT_WAYFINDING, selectedNodeId: null, nodeFocusRevision: 0,
  selectNode: selectedNodeId => set(s => ({ selectedNodeId, nodeFocusRevision: s.nodeFocusRevision + 1 })),
  apply: json => set({ settings: wayfindingSchema.parse(JSON.parse(json)) }),
  update: patch => set(s => ({ settings: wayfindingSchema.parse({ ...s.settings, ...patch }) })),
  updateBuilding: (id, patch) => set(s => {
    const buildings = { ...s.settings.buildings }
    if (patch === null) delete buildings[id]
    else buildings[id] = buildingRoutingSchema.parse({ ...buildings[id], ...patch })
    return { settings: wayfindingSchema.parse({ ...s.settings, buildings }) }
  }),
}))
/** Debug experiments are session-local; production always uses the shipped rules. */
export function wayfindingSettings() { return WAYFINDING_DEBUG ? useWayfindingStore.getState().settings : DEFAULT_WAYFINDING }
export function buildingRouting(id: string, settings = wayfindingSettings()) {
  return { ...DEFAULT_BUILDING_ROUTING, ...settings.buildings[id],
    travelBudget: settings.buildings[id]?.travelBudget ?? settings.travelBudget }
}
export function destinationEnabled(id: string, settings = wayfindingSettings()) {
  return !settings.closedDestinations.includes(id) && buildingRouting(id, settings).enabled
}
