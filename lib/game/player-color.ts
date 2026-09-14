import { shade, type PersonDesign } from "./base-person/design"
import type { ComplexionSwap } from "./base-person/complexion"
import type { BuildingDef } from "./map/types"
import type { BuildingPart } from "./building-art/geometry"

export const DEFAULT_PLAYER_COLOR = "#a94d3d"
export const PLAYER_COLORS = [
  { name: "Madder red", color: DEFAULT_PLAYER_COLOR },
  { name: "Woad blue", color: "#427da6" },
  { name: "Weld yellow", color: "#bb943b" },
  { name: "Leaf green", color: "#56834d" },
  { name: "Heather purple", color: "#886394" },
  { name: "Russet", color: "#bd713e" },
] as const
/** Residents belong to an owned home or workplace, including those without a job. */
export function isPlayerResident(person: { home?: string | null; employer?: string | null } | undefined,
  buildings: readonly Pick<BuildingDef, "id" | "owner">[]): boolean {
  if (!person?.home && !person?.employer) return false
  return buildings.some(building => building.owner !== "independent"
    && (building.id === person.home || building.id === person.employer))
}

export const CHARACTER_PALETTE_SLOTS = 32
const CLOTH_SHADES = [.55, .8, 1, 1.3]

/** Quiet, warm cloth for road travelers; keep the original light and dark folds. */
export function mutedCloth(color: string): string {
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16))
  const grey = rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114
  return "#" + rgb.map((c, i) => Math.max(0, Math.min(255, Math.round(c * .18 + grey * .82 + [5, 2, -3][i])))
    .toString(16).padStart(2, "0")).join("")
}

/** Extend the existing skin/hair swap with the authored clothing palette.
 * Resident monks keep brown wool, with only their woven edging and cord dyed.
 * The shared ink, timber, metal and leather palette is never a swap source. */
export function playerClothingSwap(skin: ComplexionSwap, design: PersonDesign | undefined,
  playerColor: string | null, resident: boolean): ComplexionSwap {
  if (!design || !playerColor) return skin
  const swap = { from: [...skin.from], to: [...skin.to] }
  const add = (from: string, to: string, factors = CLOTH_SHADES) => {
    for (const factor of factors) {
      const source = shade(from, factor)
      if (swap.from.includes(source)) continue
      swap.from.push(source); swap.to.push(shade(to, factor))
    }
  }
  if (resident) {
    if (design.tunicStyle === "Trimmed") add(design.accentColor, playerColor)
    else add(design.tunicColor, playerColor)
  } else {
    for (const color of [design.tunicColor, design.accentColor, design.coveringColor]) add(color, mutedCloth(color))
    for (const color of [design.shirtColor, design.trouserColor]) add(color, mutedCloth(color), [.55, .8, 1, 1.25])
  }
  return swap
}

/** Paint existing joinery, keeping the structure's silhouette and pixel scale. */
export function playerBuildingParts(parts: BuildingPart[], color: string | null): BuildingPart[] {
  if (!color) return parts
  return parts.map(part => part.playerAccent ? { ...part, color } : part)
}
