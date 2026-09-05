import type { TreePlacement } from "./placement"
import { TREE_SPECIES, type TreeSpeciesId } from "./species"
import { shapeForTree } from "./dimensions"

/** Work is measured in game hours; the smallest tree takes two hours. */
export const AXE_DAMAGE_PER_HOUR = 10
export const STUMP_LIFETIME_DAYS = 3
export const WOOD_PER_LOG = 10
export const TIMBER_LOAD = WOOD_PER_LOG
const WOOD_PER_TRUNK_VOLUME = 6000

const TIMBER: Record<TreeSpeciesId, { hardness: number }> = {
  oak: { hardness: 16 },
  beech: { hardness: 14 },
  birch: { hardness: 9 },
  scotsPine: { hardness: 10 },
  hawthorn: { hardness: 8 },
  holly: { hardness: 12 },
}

export interface TreeResource {
  maxHealth: number
  health: number
  wood: number
  /** Timber still lying at this tree; decreases only when a worker picks it up. */
  remainingWood: number
  size: number
  fellingHours: number
  trunkHeight: number
  trunkRadius: number
  trunkTaper: number
  footprintRadius: number
  trunkVolume: number
  felledAt: number | null
  stumpUntil: number | null
}

/** Yield follows the actual tapered trunk volume, including the tree's scale. */
export function treeResource(tree: TreePlacement, index: number, seed = 0): TreeResource {
  const shape = shapeForTree(tree, index, seed)
  const size = tree.scale ?? 1
  const def = TREE_SPECIES[tree.species]
  const trunkHeight = shape.trunkHeight * size
  const trunkRadius = shape.trunkRadius * size
  const trunkTaper = tree.trunkTaper ?? def.trunk.taper
  const trunkVolume = Math.PI * trunkRadius ** 2 * trunkHeight * (1 + trunkTaper + trunkTaper ** 2) / 3
  const canopyRadius = Math.max(shape.trunkRadius, ...shape.crown.map((part) =>
    Math.hypot(part.x, part.z) + Math.max(part.rx, part.rz))) * size
  const footprintRadius = Math.max(trunkRadius * 1.2,
    Math.min(canopyRadius, (tree.footprint ?? def.habitat.footprint) * size))
  const normalRadius = (def.trunk.radius.min + def.trunk.radius.max) / 2
  const fellingHours = Math.max(2, Math.round(TIMBER[tree.species].hardness * (trunkRadius / normalRadius) ** 2 / 2))
  const maxHealth = fellingHours * AXE_DAMAGE_PER_HOUR
  // Whole ten-wood logs keep loads, stacks and the resource count in agreement.
  const wood = Math.max(WOOD_PER_LOG, Math.round(trunkVolume * WOOD_PER_TRUNK_VOLUME / WOOD_PER_LOG) * WOOD_PER_LOG)
  return { maxHealth, health: maxHealth, wood, remainingWood: wood, size, fellingHours,
    trunkHeight, trunkRadius, trunkTaper, footprintRadius, trunkVolume,
    felledAt: null, stumpUntil: null }
}

/** A centred trunk section, bounded by the space its standing tree occupied. */
export function fallenTimberDimensions(tree: TreeResource) {
  const radius = tree.trunkRadius
  // Include the cut-end caps in the footprint bound, even for narrow crowns.
  const offsetZ = Math.min(radius * 2.3, (tree.footprintRadius - radius) * 0.8)
  const maxLength = 2 * Math.sqrt(Math.max(0, tree.footprintRadius ** 2 - (offsetZ + radius) ** 2)) - 0.014
  const length = Math.max(0.01, Math.min(tree.trunkHeight, maxLength))
  const stumpHeight = Math.min(0.24 * tree.size, tree.trunkHeight * 0.3)
  return { radius, length, stumpHeight, offsetZ }
}

/** A final short log can represent a partial load from a hand-authored stock. */
export function pileLogCount(wood: number): number {
  return Math.ceil(Math.max(0, wood) / WOOD_PER_LOG)
}

export function treeStage(tree: TreeResource, time: number): "Standing" | "Being felled" | "Fallen" | "Stump" | "Cleared" {
  if (tree.health > 0) return tree.health < tree.maxHealth ? "Being felled" : "Standing"
  if (tree.remainingWood > 0) return "Fallen"
  return time < (tree.stumpUntil ?? 0) ? "Stump" : "Cleared"
}

export interface WoodPile {
  id: string
  campId: string
  slot: number
  wood: number
}

/** Four stack locations inside the yard; keep adding to the smallest stack. */
export function stackWood(piles: Map<string, WoodPile>, campId: string, wood: number): void {
  if (wood <= 0) return
  const stacks = Array.from(piles.values()).filter((pile) => pile.campId === campId)
  let pile = stacks.find((p) => p.wood < 24 * WOOD_PER_LOG)
  if (!pile && stacks.length < 4) {
    const slot = stacks.length
    pile = { id: `${campId}:pile:${slot}`, campId, slot, wood: 0 }
    piles.set(pile.id, pile)
  }
  pile ??= stacks.reduce((a, b) => a.wood < b.wood ? a : b)
  pile.wood += wood
}

/** World offset from the yard centre; all logs stay within the footprint. */
export function pileOffset(slot: number): [number, number] {
  return [(slot % 2 === 0 ? -1 : 1) * 0.48, (slot < 2 ? -1 : 1) * 0.43]
}
