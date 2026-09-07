/** Two added storage tiles alongside the original 2×2 hut; older huts scale to fit. */
export function workshopLayout(width: number, depth: number) {
  const bayWidth = width / 3
  return { coreWidth: width - bayWidth, coreX: -bayWidth / 2,
    storageX: width / 2 - bayWidth / 2, bayWidth, bayDepth: depth / 2 }
}

/** Four live stacks occupy two bays, with a pair of stacks in each square. */
export function workshopPileOffset(slot: number, width: number, depth: number): [number, number] {
  const layout = workshopLayout(width, depth)
  return [layout.storageX,
    (Math.floor(slot / 2) - .5) * layout.bayDepth + (slot % 2 - .5) * layout.bayDepth * .4]
}

/** The sheep pen: one tile of hut on the left, the open fold across the rest. */
export function sheepPenLayout(width: number) {
  const coreWidth = Math.min(width, Math.max(1, width / 3))
  return { coreWidth, coreX: -width / 2 + coreWidth / 2, penLeft: -width / 2 + coreWidth }
}
