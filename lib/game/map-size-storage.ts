import { DEFAULT_MAP_WIDTH, MIN_MAP_SIZE } from "./map/generate-map"

export const MAX_MAP_SIZE = 512
export const MAP_SIZE_STEP = 32
const MAP_SIZE_STORAGE_KEY = "pilgrimage.map-size"

function isMapSize(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_MAP_SIZE && value <= MAX_MAP_SIZE
}

/** Read after mounting; a bookmarked size still takes precedence over this default. */
export function loadDefaultMapSize(): number {
  try {
    const value = Number(window.localStorage.getItem(MAP_SIZE_STORAGE_KEY))
    return isMapSize(value) ? value : DEFAULT_MAP_WIDTH
  } catch {
    return DEFAULT_MAP_WIDTH
  }
}

/** Keep the session usable when the browser cannot persist preferences. */
export function saveDefaultMapSize(size: number): boolean {
  if (!isMapSize(size)) return false
  try {
    window.localStorage.setItem(MAP_SIZE_STORAGE_KEY, String(size))
    return true
  } catch {
    return false
  }
}
