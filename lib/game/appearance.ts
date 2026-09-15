import { z } from "zod"
import type { Selection } from "./camera-store"
import { TERRAIN } from "./map/terrain"

export const APPEARANCE_GROUPS = ["trees", "buildings", "characters", "wildlife", "scenery"] as const
export type AppearanceGroup = typeof APPEARANCE_GROUPS[number]
const factor = z.number().finite().min(0).max(2)
export const colorAdjustmentSchema = z.object({ saturation: factor, brightness: factor }).strict()
export type ColorAdjustment = z.infer<typeof colorAdjustmentSchema>
export const NEUTRAL_ADJUSTMENT: ColorAdjustment = { saturation: 1, brightness: 1 }
const selectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("building"), id: z.string().min(1) }),
  z.object({ kind: z.literal("tree"), id: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("traveler"), id: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("monk"), id: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("animal"), id: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("pile"), id: z.string().min(1) }),
  z.object({ kind: z.literal("relic") }),
])
export const appearanceSchema = z.object({
  version: z.literal(1),
  grass: z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/), brightness: factor, saturation: factor,
    shading: factor, canopyShade: factor }).strict(),
  terrain: z.object({ texture: factor, inclineStyle: z.enum(["smooth", "stipple", "ordered"]) }).strict()
    .default({ texture: 1, inclineStyle: "stipple" }),
  assets: colorAdjustmentSchema,
  groups: z.object(Object.fromEntries(APPEARANCE_GROUPS.map(group => [group, colorAdjustmentSchema])) as Record<AppearanceGroup, typeof colorAdjustmentSchema>).strict(),
  objects: z.array(z.object({ world: z.string().min(1), selection: selectionSchema, label: z.string(), ...colorAdjustmentSchema.shape }).strict()).max(256),
}).strict().superRefine((value, context) => {
  const identities = new Set<string>()
  value.objects.forEach((edit, index) => {
    const key = JSON.stringify([edit.world, edit.selection.kind, edit.selection.kind === "relic" ? null : edit.selection.id])
    if (identities.has(key)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["objects", index], message: "Each object can have only one edit per world" })
    identities.add(key)
  })
})
export type Appearance = z.infer<typeof appearanceSchema>
export function defaultAppearance(): Appearance {
  return { version: 1, grass: { color: TERRAIN.grass.color, brightness: 1.06, saturation: 0.84, shading: 1.95, canopyShade: 1.28 },
    terrain: { texture: 1, inclineStyle: "stipple" },
    assets: { saturation: 1.23, brightness: 0.85 }, groups: Object.fromEntries(APPEARANCE_GROUPS.map(group => [group, { ...NEUTRAL_ADJUSTMENT }])) as Appearance["groups"], objects: [] }
}
export function selectionGroup(selection: Selection): AppearanceGroup {
  return selection.kind === "tree" ? "trees" : selection.kind === "building" || selection.kind === "relic" ? "buildings"
    : selection.kind === "animal" ? "wildlife" : selection.kind === "pile" ? "scenery" : "characters"
}
export function sameAppearanceSelection(a: Selection, b: Selection) {
  return a.kind === b.kind && (a.kind === "relic" || (b.kind !== "relic" && a.id === b.id))
}
export function parseAppearance(text: string): Appearance { return appearanceSchema.parse(JSON.parse(text)) }

export function appearanceWorldKey(map: { seed?: number; width: number; depth: number }) {
  return `${map.seed ?? 0}:${map.width}x${map.depth}`
}
