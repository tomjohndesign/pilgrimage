export const METHODS = {
  global: { label: "Global pixels", description: "Scenery and characters share the coarse world grid.", watch: "Watch the face and feet change as they cross the pixel grid." },
  hybrid: { label: "Separate characters", description: "Pixelated scenery with characters drawn at display resolution.", watch: "Compare character detail and movement against the chunky scenery." },
  asset: { label: "Pixels per asset", description: "Each scenery object becomes its own pixel image. Characters keep their artwork.", watch: "Watch object edges while panning. Images retain depth, so walkers still pass behind them." },
  native: { label: "Original polygons", description: "Polygon scenery and sprite characters, with no added pixelation.", watch: "A clarity reference: judge whether the two art styles belong together." },
  snapped: { label: "Global + snapped movement", description: "The global pass, with character anchors snapped to its pixel grid.", watch: "Compare steadier details against the more noticeable steps in slow movement." },
} as const
export type Method = keyof typeof METHODS
export const CHARACTERS = ["base", "peasant", "pilgrim", "merchant", "friar", "knight", "minstrel", "vendor"] as const
export type Character = typeof CHARACTERS[number]
export const MOTIONS = { walk: "Walk past scenery", slide: "Slide a frozen pose", idle: "Stand still", diagonal: "Walk diagonally" } as const
export const CAMERAS = { still: "Still", pan: "Pan", zoom: "Zoom in and out", orbit: "Turn continuously" } as const
export interface LabSettings {
  character: Character
  motion: keyof typeof MOTIONS
  camera: keyof typeof CAMERAS
  zoom: number
  density: number
  scale: number
  speed: number
  fps: number
  dpr: number
  view: number
  scenery: boolean
}
export const DEFAULT_SETTINGS: LabSettings = {
  character: "base", motion: "walk", camera: "still", zoom: 1,
  density: 25, scale: 1.5, speed: 1, fps: 8, dpr: 1, view: 0, scenery: true,
}
export const DEFAULT_METHODS: Method[] = ["global", "hybrid", "asset", "native"]

/** Untrusted shared URLs are bounded before they can allocate GPU buffers. */
export function readSettings(params: URLSearchParams): LabSettings {
  const result = { ...DEFAULT_SETTINGS }
  const number = (key: keyof LabSettings, min: number, max: number) => {
    const raw = params.get(key)
    const value = raw === null || raw.trim() === "" ? NaN : Number(raw)
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : Number(DEFAULT_SETTINGS[key])
  }
  const character = params.get("character")
  if (CHARACTERS.includes(character as Character)) result.character = character as Character
  const motion = params.get("motion")
  if (motion && Object.hasOwn(MOTIONS, motion)) result.motion = motion as LabSettings["motion"]
  const camera = params.get("camera")
  if (camera && Object.hasOwn(CAMERAS, camera)) result.camera = camera as LabSettings["camera"]
  result.zoom = number("zoom", 0.5, 4)
  result.density = Math.round(number("density", 8, 64))
  result.scale = number("scale", 0.5, 3)
  result.speed = number("speed", 0.1, 2)
  result.fps = Math.round(number("fps", 1, 16))
  result.dpr = Math.round(number("dpr", 0.5, 2) * 2) / 2
  result.view = Math.round(number("view", 0, 3))
  result.scenery = params.get("scenery") !== "false"
  return result
}

export function readMethods(params: URLSearchParams): Method[] {
  const values = params.get("methods")?.split(",")
  return DEFAULT_METHODS.map((fallback, i) => values?.[i] && Object.hasOwn(METHODS, values[i]) ? values[i] as Method : fallback)
}

export function comparisonQuery(settings: LabSettings, methods: Method[]): string {
  return new URLSearchParams({ ...Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, String(value)])), methods: methods.join(",") }).toString()
}

export function actorPose(seconds: number, motion: LabSettings["motion"], index = 0) {
  const t = seconds + index * 2.3
  const cycle = ((t * 0.7) % 12 + 12) % 12
  const returning = cycle > 6
  const x = motion === "idle" ? (index - 1) * 1.3 : (returning ? 9 - cycle : cycle - 3)
  const z = motion === "diagonal" ? x * 0.55 : (index - 1) * 0.85
  return { x, z, heading: motion === "idle" ? Math.PI / 2 : Math.atan2(returning ? -1 : 1, motion === "diagonal" ? (returning ? -0.55 : 0.55) : 0) }
}

export function spriteRow(heading: number, yaw: number): number {
  return ((Math.round((yaw - heading) / (Math.PI / 4)) % 8) + 8) % 8
}
