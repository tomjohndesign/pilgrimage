import { CHARACTER_PIXEL_SIZE } from "../render/pixel-scale"

export const WATER_SOURCE_KINDS = ["well", "watering-hole"] as const
export type WaterSourceKind = typeof WATER_SOURCE_KINDS[number]
export const WATER_SOURCE_FRAME = {
  cellSize: 128, extent: 128 * CHARACTER_PIXEL_SIZE, anchor: [64, 88] as const,
  directions: 8, variants: 1, rows: WATER_SOURCE_KINDS.length,
}
export const WATER_SOURCE_ATLAS = {
  color: "/textures/water-sources/v2/color.png",
  depth: "/textures/water-sources/v2/depth.png",
}

/** Local-space ground contacts shared by navigation and drinking previews.
 * Water targets describe where to draw/dip water, not where a person may stand. */
export const WATER_SOURCE_DEFINITIONS = {
  well: {
    label: "Timber-lined well",
    description: "A low oak curb, wooden bucket and rope for drawing water by hand.",
    footprint: [1.4, 1.4],
    access: [{ stand: [0, 0, .83], water: [0, .46, .25], action: "draw-water" }],
  },
  "watering-hole": {
    label: "Natural watering hole",
    description: "An unbuilt pool with an earthen bank, scattered stones and an open dipping edge.",
    footprint: [2.3, 1.8],
    access: [{ stand: [0, 0, 1.03], water: [0, .035, .5], action: "dip-water" }],
  },
} as const

export interface WaterSourcePlacement {
  kind: WaterSourceKind
  x: number
  y: number
  z: number
  /** Atlas directions and interaction points use the same eighth-turn rotation. */
  yaw: number
}

export function waterSourceAccessPoints(source: WaterSourcePlacement) {
  const yaw = Math.round(source.yaw / (Math.PI / 4)) * Math.PI / 4
  const transform = ([x, y, z]: readonly [number, number, number]) => ({
    x: source.x + x * Math.cos(yaw) + z * Math.sin(yaw),
    y: source.y + y,
    z: source.z - x * Math.sin(yaw) + z * Math.cos(yaw),
  })
  return WATER_SOURCE_DEFINITIONS[source.kind].access.map(point => ({
    action: point.action, stand: transform(point.stand), water: transform(point.water),
  }))
}
