import { PERSON_HEIGHT } from "./world-scale"
import { WOOD_LOG, woodLogScale } from "./wood-log"
import { pileLogCount, WOOD_PER_LOG } from "./trees/timber"

const scale = woodLogScale()
const radius = WOOD_LOG.radius * scale
const spacing = radius * 2.05
const layerHeight = spacing * Math.sqrt(3) / 2
const columns = 6
const layers = Math.max(1, 1 + Math.floor((PERSON_HEIGHT - radius * 2) / layerHeight))

/** Long, low rows; alternate courses nest between the logs below them. */
export const WOOD_PILE_LAYOUT = {
  radius, spacing, layerHeight, columns, layers,
  length: WOOD_LOG.length * scale * 2,
  width: (columns - 1) * spacing + radius * 2,
  height: radius * 2 + (layers - 1) * layerHeight,
  maxLogs: Math.ceil(layers / 2) * columns + Math.floor(layers / 2) * (columns - 1),
} as const

/** Full stalls keep a bounded silhouette even when their inventory exceeds it. */
export function woodPileLogs(wood: number, availableWidth = WOOD_PILE_LAYOUT.width) {
  const rowColumns = Math.max(2, Math.min(columns, 1 + Math.floor((availableWidth - radius * 2 + 1e-9) / spacing)))
  const maxLogs = Math.ceil(layers / 2) * rowColumns + Math.floor(layers / 2) * (rowColumns - 1)
  const count = Math.min(maxLogs, pileLogCount(wood))
  const logs: Array<{ x: number; y: number; length: number }> = []
  for (let layer = 0; logs.length < count; layer++) {
    const width = rowColumns - layer % 2
    for (let column = 0; column < width && logs.length < count; column++) {
      const fraction = Math.min(1, (wood - logs.length * WOOD_PER_LOG) / WOOD_PER_LOG)
      logs.push({ x: (column - (width - 1) / 2) * spacing,
        y: radius + layer * layerHeight, length: WOOD_PILE_LAYOUT.length * fraction })
    }
  }
  return logs
}
