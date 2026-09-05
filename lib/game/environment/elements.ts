import { makeRng } from "../rng"

export const ENVIRONMENT_KINDS = ["bush", "grass", "rocks", "boulder", "groundcover", "wildflowers"] as const
export type EnvironmentKind = (typeof ENVIRONMENT_KINDS)[number]
export type PrimitiveKind = "foliage" | "stone" | "blade"

export const ENVIRONMENT_LABELS: Record<EnvironmentKind, string> = {
  bush: "Low shrubs",
  grass: "Meadow grass",
  rocks: "Loose stones",
  boulder: "Weathered boulders",
  groundcover: "Creeping groundcover",
  wildflowers: "Wildflowers",
}

export interface EnvironmentPlacement {
  x: number
  y: number
  z: number
  kind: EnvironmentKind
  scale: number
  yaw: number
  brightness: number
  seed: number
  /** Shared by members of a landscape colony; absent on gallery specimens. */
  cluster?: number
}

export interface EnvironmentPart {
  primitive: PrimitiveKind
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  yaw: number
  color: string
  shade: number
}

/** All parts fit inside this horizontal radius, including their rotation. */
export const ELEMENT_RADIUS = 0.44

/** Small, asymmetric clusters built from the same faceted vocabulary as trees. */
export function generateElement(kind: EnvironmentKind, seed: number): EnvironmentPart[] {
  const rng = makeRng(seed)
  const parts: EnvironmentPart[] = []
  const add = (
    primitive: PrimitiveKind, x: number, y: number, z: number,
    rx: number, ry: number, rz: number, color: string,
  ) => parts.push({ primitive, x, y, z, rx, ry, rz, color, yaw: rng() * Math.PI * 2, shade: 0.9 + rng() * 0.18 })

  if (kind === "bush") {
    const colors = ["#647447", "#70804d", "#586a40"]
    const color = colors[Math.floor(rng() * colors.length)]
    add("foliage", 0, 0.19, 0, 0.23, 0.23 + rng() * 0.08, 0.22, color)
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3 + rng() * 0.5
      add("foliage", Math.cos(angle) * 0.18, 0.12, Math.sin(angle) * 0.18,
        0.15 + rng() * 0.035, 0.14 + rng() * 0.08, 0.16, color)
    }
  } else if (kind === "grass" || kind === "wildflowers") {
    const colors = ["#687a42", "#80934f", "#93a25e", "#a49d67"]
    // Low mottled growth connects the blades into a sward at ordinary map zoom.
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3
      add("stone", Math.cos(angle) * 0.16, 0.012, Math.sin(angle) * 0.16,
        0.19, 0.023, 0.15, colors[i])
    }
    const blades = kind === "grass" ? 22 : 12
    for (let i = 0; i < blades; i++) {
      const angle = rng() * Math.PI * 2
      const radius = Math.sqrt(rng()) * 0.34
      const height = 0.07 + rng() * 0.16
      const color = colors[Math.floor(rng() * colors.length)]
      add("blade", Math.cos(angle) * radius, height - 0.008, Math.sin(angle) * radius,
        0.025 + rng() * 0.035, height, 0.018, color)
    }
    if (kind === "wildflowers") {
      // A few cream, butter-yellow or muted mauve blooms, carried above the grass.
      const petals = ["#e5dfbe", "#cfb755", "#a391b5"][Math.floor(rng() * 3)]
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2 + rng() * 0.8
        const radius = 0.1 + rng() * 0.17
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius
        const height = 0.25 + rng() * 0.13
        add("blade", x, height / 2, z, 0.012, height / 2, 0.012, "#647644")
        for (let petal = 0; petal < 5; petal++) {
          const turn = petal * Math.PI * 2 / 5
          add("stone", x + Math.cos(turn) * 0.036, height, z + Math.sin(turn) * 0.036,
            0.035, 0.018, 0.029, petals)
        }
        add("stone", x, height + 0.015, z, 0.025, 0.018, 0.025, "#b49743")
      }
    } else {
      // A couple of seed heads break up the blade-only silhouette.
      for (let i = 0; i < 2; i++) {
        const x = (rng() - 0.5) * 0.4
        const z = (rng() - 0.5) * 0.4
        const height = 0.29 + rng() * 0.1
        add("blade", x, height / 2, z, 0.013, height / 2, 0.012, "#87915a")
        add("stone", x, height, z, 0.018, 0.047, 0.018, "#b0a775")
      }
    }
  } else if (kind === "rocks") {
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + rng() * 0.5
      const size = 0.055 + rng() * 0.075
      add("stone", Math.cos(angle) * 0.19, size * 0.35, Math.sin(angle) * 0.19,
        size * 1.2, size * 0.75, size, "#99927c")
    }
  } else if (kind === "boulder") {
    const height = 0.24 + rng() * 0.12
    add("stone", -0.04, height * 0.65, 0, 0.32, height, 0.27, "#8b8977")
    add("stone", 0.23, 0.045, 0.1, 0.10, 0.09, 0.12, "#9a947e")
    // A low moss cap gives the stone a little age without a new texture.
    if (rng() < 0.65) add("foliage", -0.08, height * 1.43, 0, 0.18, 0.035, 0.15, "#737b50")
  } else {
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5
      add("foliage", Math.cos(angle) * 0.17, 0.012, Math.sin(angle) * 0.17,
        0.15 + rng() * 0.035, 0.016 + rng() * 0.015, 0.14, "#7f8b50")
    }
  }
  return parts
}
