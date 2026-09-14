import { create } from "zustand"
import { z } from "zod"

export const WAYFINDING_DEBUG = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_PROPERTY_PANELS === "1"
export const wayfindingSchema = z.object({
  version: z.literal(1),
  travelBudget: z.number().min(1).max(100),
  selection: z.enum(["travel", "geographic"]),
  closedDestinations: z.array(z.string().min(1)).max(256),
  showRoutes: z.boolean(),
  showField: z.boolean(),
}).strict()
export type WayfindingSettings = z.infer<typeof wayfindingSchema>
export const DEFAULT_WAYFINDING: WayfindingSettings = {
  version: 1, travelBudget: 40, selection: "travel", closedDestinations: [], showRoutes: true, showField: false,
}
export const useWayfindingStore = create<{ settings: WayfindingSettings; apply: (json: string) => void }>(set => ({
  settings: DEFAULT_WAYFINDING,
  apply: json => set({ settings: wayfindingSchema.parse(JSON.parse(json)) }),
}))
/** Debug experiments are session-local; production always uses the shipped rules. */
export function wayfindingSettings() { return WAYFINDING_DEBUG ? useWayfindingStore.getState().settings : DEFAULT_WAYFINDING }
