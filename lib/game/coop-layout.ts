/** Shared geometry and animal/keeper routes, in unrotated building coordinates. */
export function coopLayout(width = 2, depth = 2) {
  const back = -depth / 2 + .05, hatchWidth = width - .35
  return {
    floorHeight: .18, rampLength: .5, rampWidth: .32,
    back, hatchWidth, hatchBottom: .12, hatchHeight: .28,
    doorOutside: { x: 0, z: .56 }, doorInside: { x: 0, z: -.22 },
    nests: [-1, 1].map(side => ({ x: side * width * .3, z: back * .7 })),
    keeper: { x: 0, z: -depth / 2 - .45 },
  }
}

/** Hen foot contact follows the raised floor and the top of its short entrance ramp. */
export function coopFloorHeight(x: number, z: number) {
  const { floorHeight, rampLength, rampWidth } = coopLayout()
  if (z <= 0) return floorHeight
  if (z >= rampLength || Math.abs(x) > rampWidth / 2 + .04) return 0
  const edge = Math.min(1, Math.max(0, (rampWidth / 2 + .04 - Math.abs(x)) / .04))
  return floorHeight * (1 - z / rampLength) * edge
}
