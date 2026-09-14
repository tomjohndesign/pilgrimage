import { layoutHand } from "./building-layout"
export const SHEEP_PEN_CAPACITY = 8
/** Two added storage tiles alongside the original 2×2 hut; older huts scale to fit. */
export function workshopLayout(width: number, depth: number) {
  const bayWidth = width / 3
  return { coreWidth: width - bayWidth, coreX: -bayWidth / 2,
    storageX: width / 2 - bayWidth / 2, bayWidth, bayDepth: depth / 2 }
}

/** Four live stacks occupy two bays, with a pair of stacks in each square. */
export function workshopPileOffset(slot: number, width: number, depth: number, layoutSeed?: number): [number, number] {
  const layout = workshopLayout(width, depth)
  return [layout.storageX*layoutHand("workshop",layoutSeed),
    (Math.floor(slot / 2) - .5) * layout.bayDepth + (slot % 2 - .5) * layout.bayDepth * .4]
}

/** The enlarged fold has a small hut against one front side and grazing room behind.
 * Older, narrower saved plots retain their original side-by-side layout. */
export function sheepPenLayout(width: number, depth = 2) {
  const wraps = width >= 5
  const coreWidth = wraps ? 1 : Math.min(width, Math.max(1, width / 3))
  const coreDepth = wraps ? Math.min(2, depth) : depth
  const coreX = -width / 2 + coreWidth / 2
  const storageWidth=Math.min(.72,(width-coreWidth)*.6),storageDepth=wraps ? Math.min(1.72,depth-.28) : Math.min(.65,depth*.35)
  const storageX=width/2-.5,storageZ=depth/2-(wraps ? 1 : .5)
  return { storageX, storageZ, storageWidth, storageDepth, workX:(coreX+coreWidth/2+storageX-storageWidth/2)/2, wraps, coreWidth, coreDepth, coreX, coreZ: (depth - coreDepth) / 2,
    troughX: (coreX + coreWidth / 2 + width / 2) / 2, troughZ: -depth / 2 + .28,
    feedX: coreX + coreWidth / 2 + .55, feedZ: -depth / 2 + .28,
    shelterFront: Math.min(0, (depth - coreDepth) / 2 - coreDepth / 2),
    penLeft: coreX + coreWidth / 2, gateWidth: wraps ? 1 : Math.min(.62, depth * .42) }
}
