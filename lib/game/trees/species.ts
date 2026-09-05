/**
 * Parametric tree species. Pure data and maths — no three.js, no React — so
 * the shapes can be unit-tested and the tuning UI can edit them as plain JSON.
 *
 * A species is a set of *ranges*; every individual tree samples its own values
 * from those ranges with the seeded RNG. That is the whole variability model:
 * two oaks differ in trunk height, crown width and how many canopy blobs they
 * carry, but both stay recognisably oaks because the ranges are narrow.
 *
 * The species here are the natives of medieval Britain, picked for maximally
 * different silhouettes rather than completeness: a spreading oak, a domed
 * beech, a slender white birch, a tufted Scots pine, a scrubby hawthorn, and
 * a dark conical holly for evergreen contrast.
 *
 * Trees grow in company of their own kind. Each species carries a smooth
 * noise field over the map; where its field runs high it crowds the others
 * out, so the forest reads as birch groves, beech stands and pine patches with
 * mixing along their seams rather than as a uniform salt-and-pepper mix.
 *
 * Each species also claims ground. A footprint is the radius around a trunk
 * where no other trunk may stand, and a per-tile cap says how many of the
 * species fit on one tile: an oak or beech has a tile to itself, while birch
 * and hawthorn crowd two or three to a tile. See placement.ts for the rules.
 *
 * Rendering cost is deliberately fixed and low. Every tree is a trunk plus a
 * handful of canopy shapes, each an instance of one tiny shared geometry, so
 * the whole forest is a few instanced draw calls regardless of tree count.
 */

export type TreeSpeciesId = "oak" | "beech" | "birch" | "scotsPine" | "hawthorn" | "holly"

/** Canopy primitive. Blobs are low-poly spheres; cones are for evergreens. */
export type CrownShape = "blob" | "cone"

export interface Range {
  min: number
  max: number
}

export interface TreeSpeciesDef {
  id: TreeSpeciesId
  label: string
  latin: string
  /** One line on where it grew and what it was for. Shown in the lab. */
  blurb: string
  trunk: {
    /** World units; a tile is 1. */
    height: Range
    radius: Range
    /** Top radius as a fraction of the base radius. 1 = straight pole. */
    taper: number
    /** Max tilt off vertical, radians. */
    lean: number
    color: string
  }
  crown: {
    shape: CrownShape
    /** How many canopy shapes make up the crown (integer range). */
    blobs: Range
    /** Horizontal half-extent of one canopy shape. */
    radius: Range
    /** Vertical half-extent as a multiple of radius: <1 flattens, >1 stretches. */
    squash: Range
    /**
     * Where the crown sits on the trunk, in canopy half-heights above the
     * trunk top: 0 centres the first shape on the trunk tip, 1 perches it on top.
     */
    lift: number
    /** How far secondary shapes wander from the first, in crown radii. */
    spread: number
    color: string
    /** ± brightness variation between individual trees (0.1 = ±10%). */
    colorJitter: number
  }
  habitat: {
    /** Relative abundance when picking a species for a tile. */
    weight: number
    /** -1 = interior only, 0 = indifferent, +1 = forest edge only. */
    edgeBias: number
    /**
     * How strongly the species keeps to its own kind. 0 scatters it evenly
     * through the forest; 1 confines it to the groves its noise field marks.
     */
    grouping: number
    /** Typical grove diameter, in tiles. */
    groveSize: number
    /**
     * The ground a tree claims: no other trunk may stand closer than this, in
     * tiles. Between two neighbours the larger footprint wins, and it scales
     * with the individual, so old growth holds more ground and rim trees less.
     */
    footprint: number
    /** Most trees of this species one tile can hold: 1 for the big crowns, up to 3 for scrub. */
    perTile: number
  }
}

export const TREE_SPECIES_ORDER: TreeSpeciesId[] = [
  "oak",
  "beech",
  "birch",
  "scotsPine",
  "hawthorn",
  "holly",
]

export const TREE_SPECIES: Record<TreeSpeciesId, TreeSpeciesDef> = {
  oak: {
    id: "oak",
    label: "Oak",
    latin: "Quercus robur",
    blurb:
      "The medieval tree: timber frames, ships, and acorns for the pigs. Short stout trunk under a broad, lumpy crown, often wider than it is tall.",
    trunk: {
      height: { min: 0.49, max: 0.74 },
      radius: { min: 0.09, max: 0.12 },
      taper: 0.57,
      lean: 0,
      color: "#5a4630",
    },
    crown: {
      shape: "blob",
      blobs: { min: 6, max: 6 },
      radius: { min: 0.33, max: 0.68 },
      squash: { min: 0.72, max: 0.9 },
      lift: 0.45,
      spread: 0.5,
      color: "#4f6a2e",
      colorJitter: 0.17,
    },
    // The generalist: everywhere, and the one that fills the seams between groves.
    habitat: { weight: 0.5, edgeBias: 0.1, grouping: 0.35, groveSize: 9, footprint: 0.7, perTile: 1 },
  },
  beech: {
    id: "beech",
    label: "Beech",
    latin: "Fagus sylvatica",
    blurb:
      "Master of the southern chalk. A smooth grey trunk under one huge dense dome; the shade beneath is so deep the ground stays bare.",
    trunk: {
      height: { min: 0.43, max: 0.86 },
      radius: { min: 0.08, max: 0.1 },
      taper: 0.8,
      lean: 0.16,
      color: "#7a7466",
    },
    crown: {
      shape: "blob",
      blobs: { min: 3, max: 3 },
      radius: { min: 0.38, max: 0.6 },
      squash: { min: 0.75, max: 1.6 },
      lift: 0.45,
      spread: 0.6,
      color: "#3f5a2a",
      colorJitter: 0.14,
    },
    // Beech shades everything else out, so it forms big pure stands.
    habitat: { weight: 0.8, edgeBias: -0.5, grouping: 0.75, groveSize: 12, footprint: 0.7, perTile: 1 },
  },
  birch: {
    id: "birch",
    label: "Silver birch",
    latin: "Betula pendula",
    blurb:
      "Pioneer of clearings and poor ground. A slender white trunk carrying a small, light, high crown that lets the sun through.",
    trunk: {
      height: { min: 0.54, max: 1.1 },
      radius: { min: 0.07, max: 0.08 },
      taper: 0.52,
      lean: 0.1,
      color: "#d9d5c8",
    },
    crown: {
      shape: "blob",
      blobs: { min: 4, max: 5 },
      radius: { min: 0.1, max: 0.33 },
      squash: { min: 1.9, max: 2.5 },
      lift: 0.2,
      spread: 0.55,
      color: "#7a9a3c",
      colorJitter: 0.21,
    },
    // Birch seeds in drifts: small tight groves, rarely a lone tree.
    habitat: { weight: 0.6, edgeBias: 0.8, grouping: 0.9, groveSize: 5, footprint: 0.28, perTile: 3 },
  },
  scotsPine: {
    id: "scotsPine",
    label: "Scots pine",
    latin: "Pinus sylvestris",
    blurb:
      "The one big native conifer. A long bare reddish trunk with a flat tuft of canopy perched right at the top — unmistakable from any distance.",
    trunk: {
      height: { min: 0.52, max: 1.39 },
      radius: { min: 0.06, max: 0.08 },
      taper: 0.54,
      lean: 0,
      color: "#9a5a3a",
    },
    crown: {
      shape: "cone",
      blobs: { min: 2, max: 5 },
      radius: { min: 0.29, max: 0.41 },
      squash: { min: 1.55, max: 2.45 },
      lift: 0.2,
      spread: 0.35,
      color: "#2f5030",
      colorJitter: 0.14,
    },
    // Tall and narrow: pines stand close, but not on top of each other.
    habitat: { weight: 0.25, edgeBias: -0.2, grouping: 0.8, groveSize: 8, footprint: 0.4, perTile: 2 },
  },
  hawthorn: {
    id: "hawthorn",
    label: "Hawthorn",
    latin: "Crataegus monogyna",
    blurb:
      "The hedge and glade-edge tree, thorny and scruffy. Barely any trunk; a single low untidy blob of green.",
    trunk: {
      height: { min: 0.14, max: 0.24 },
      radius: { min: 0.04, max: 0.06 },
      taper: 0.85,
      lean: 0.12,
      color: "#4d3b2a",
    },
    crown: {
      shape: "blob",
      blobs: { min: 1, max: 2 },
      radius: { min: 0.24, max: 0.32 },
      squash: { min: 0.8, max: 1 },
      lift: 0.5,
      spread: 0.45,
      color: "#587a30",
      colorJitter: 0.14,
    },
    // Scrub: strings along edges rather than forming stands.
    habitat: { weight: 0.45, edgeBias: 0.9, grouping: 0.4, groveSize: 4, footprint: 0.3, perTile: 3 },
  },
  holly: {
    id: "holly",
    label: "Holly",
    latin: "Ilex aquifolium",
    blurb:
      "Dark evergreen of the understorey, winter fodder for the animals. Small, tight and conical, almost black-green against the broadleaves.",
    trunk: {
      height: { min: 0.18, max: 0.28 },
      radius: { min: 0.04, max: 0.06 },
      taper: 0.86,
      lean: 0.04,
      color: "#5b5348",
    },
    crown: {
      shape: "cone",
      blobs: { min: 4, max: 5 },
      radius: { min: 0.23, max: 0.29 },
      squash: { min: 0.65, max: 1.2 },
      lift: 0.7,
      spread: 0.6,
      color: "#294a26",
      colorJitter: 0.1,
    },
    habitat: { weight: 0.35, edgeBias: 0, grouping: 0.5, groveSize: 5, footprint: 0.3, perTile: 2 },
  },
}

/** One canopy shape, relative to the tree's base on the ground. */
export interface CrownPart {
  x: number
  y: number
  z: number
  /** Half-extents. */
  rx: number
  ry: number
  rz: number
  /** Yaw in radians, so faceted shapes don't all line up. */
  yaw: number
}

/** A fully sampled individual tree, in tree-local space with its base at 0,0,0. */
export interface TreeShape {
  species: TreeSpeciesId
  trunkHeight: number
  trunkRadius: number
  /** Trunk tilt: axis yaw and angle off vertical. */
  leanYaw: number
  leanAngle: number
  crown: CrownPart[]
  /** Brightness multiplier for this individual's foliage. */
  crownShade: number
  /** Brightness multiplier for the bark. */
  trunkShade: number
}

/**
 * Sample a range, optionally narrowed toward its midpoint. `variance` is a
 * global knob: 1 uses the species' full range, 0 makes every tree identical.
 */
export function sampleRange(range: Range, rng: () => number, variance = 1): number {
  const mid = (range.min + range.max) / 2
  return mid + (rng() - 0.5) * (range.max - range.min) * variance
}

/** Integer sample: rounds, so the extremes of the range are reachable. */
export function sampleCount(range: Range, rng: () => number, variance = 1): number {
  return Math.max(1, Math.round(sampleRange(range, rng, variance)))
}

/**
 * Grow one tree of a species. Draws a fixed number of RNG values per canopy
 * part, so the stream stays aligned across trees whatever the parameters.
 */
export function generateTree(
  def: TreeSpeciesDef,
  rng: () => number,
  variance = 1,
): TreeShape {
  const trunkHeight = sampleRange(def.trunk.height, rng, variance)
  const trunkRadius = sampleRange(def.trunk.radius, rng, variance)
  const leanYaw = rng() * Math.PI * 2
  const leanAngle = rng() * def.trunk.lean * variance

  const count = sampleCount(def.crown.blobs, rng, variance)
  const crown: CrownPart[] = []

  // The trunk tip, displaced by the lean, is where the crown hangs.
  const tipX = Math.sin(leanAngle) * Math.cos(leanYaw) * trunkHeight
  const tipZ = Math.sin(leanAngle) * Math.sin(leanYaw) * trunkHeight

  for (let i = 0; i < count; i++) {
    const radius = sampleRange(def.crown.radius, rng, variance)
    const ry = radius * sampleRange(def.crown.squash, rng, variance)
    const yaw = rng() * Math.PI * 2
    // The first part is the crown's core; the rest cluster around it.
    const angle = rng() * Math.PI * 2
    const reach = i === 0 ? 0 : (0.4 + rng() * 0.6) * def.crown.spread * radius
    const drop = i === 0 ? 0 : (rng() - 0.5) * 0.6 * ry
    // Satellites shrink a little so the core still reads as the tree's mass.
    const shrink = i === 0 ? 1 : 0.75 + rng() * 0.2
    crown.push({
      x: tipX + Math.cos(angle) * reach,
      y: trunkHeight + def.crown.lift * ry + drop,
      z: tipZ + Math.sin(angle) * reach,
      rx: radius * shrink,
      ry: ry * shrink,
      rz: radius * shrink,
      yaw,
    })
  }

  return {
    species: def.id,
    trunkHeight,
    trunkRadius,
    leanYaw,
    leanAngle,
    crown,
    crownShade: 1 + (rng() - 0.5) * 2 * def.crown.colorJitter,
    trunkShade: 1 + (rng() - 0.5) * 0.16,
  }
}

/** Total height of a tree above its base, for framing and tests. */
export function treeHeight(tree: TreeShape): number {
  let top = tree.trunkHeight
  for (const part of tree.crown) top = Math.max(top, part.y + part.ry)
  return top
}

// --- Placement: habitat and groves ------------------------------------------

/** Integer lattice hash to 0–1. Cheap, stateless, and stable across platforms. */
function latticeHash(ix: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * Smooth value noise in 0–1: hashed lattice values, blended with a smoothstep
 * so groves have soft edges. One octave — groves are blobs, not coastlines.
 */
export function groveNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const sx = fx * fx * (3 - 2 * fx)
  const sz = fz * fz * (3 - 2 * fz)
  const a = latticeHash(ix, iz, seed)
  const b = latticeHash(ix + 1, iz, seed)
  const c = latticeHash(ix, iz + 1, seed)
  const d = latticeHash(ix + 1, iz + 1, seed)
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz
}

/** Grove field band: below LOW is outside a grove, above HIGH is deep inside. */
const GROVE_EDGE_LOW = 0.42
const GROVE_EDGE_HIGH = 0.62
/** How much a species' weight rises deep inside its own grove. */
const GROVE_BOOST = 2.5

/** Where a tile sits, for weighing species against each other. */
export interface TileSite {
  x: number
  z: number
  /** Does the tile border open ground? */
  onEdge: boolean
  /** Map seed; every species derives its own grove field from it. */
  seed: number
}

/**
 * Weight for a species on a tile. Edge bias pulls a species toward (positive)
 * or away from (negative) tiles that border open ground; grouping then scales
 * the weight by the species' grove field, sharpened so a strong field wins the
 * tile outright while a weak one all but disappears.
 */
export function habitatWeight(def: TreeSpeciesDef, site: TileSite | boolean): number {
  const onEdge = typeof site === "boolean" ? site : site.onEdge
  const bias = def.habitat.edgeBias
  const edgeFactor = onEdge ? 1 + bias : 1 - bias
  const base = Math.max(0, def.habitat.weight * edgeFactor)
  if (typeof site === "boolean" || def.habitat.grouping <= 0) return base

  const scale = Math.max(1, def.habitat.groveSize)
  const speciesSeed = TREE_SPECIES_ORDER.indexOf(def.id) + 1
  const field = groveNoise(site.x / scale, site.z / scale, (site.seed ^ (speciesSeed * 0x9e3779b1)) >>> 0)
  // Threshold the field so a tile is either in a grove or not, with a soft
  // seam between. Value noise sits mostly near 0.5, so the band is placed so
  // roughly a third of the forest is inside a species' groves.
  const t = Math.min(1, Math.max(0, (field - GROVE_EDGE_LOW) / (GROVE_EDGE_HIGH - GROVE_EDGE_LOW)))
  const grove = t * t * (3 - 2 * t) * GROVE_BOOST
  return base * (1 - def.habitat.grouping + def.habitat.grouping * grove)
}

/** Pick a species for a tile, weighted by habitat and groves. One RNG draw. */
export function pickSpecies(
  species: Record<TreeSpeciesId, TreeSpeciesDef>,
  site: TileSite | boolean,
  rng: () => number,
): TreeSpeciesId {
  let total = 0
  for (const id of TREE_SPECIES_ORDER) total += habitatWeight(species[id], site)
  let roll = rng() * total
  for (const id of TREE_SPECIES_ORDER) {
    roll -= habitatWeight(species[id], site)
    if (roll < 0) return id
  }
  // Only reachable when every weight is zero; fall back to the commonest tree.
  return "oak"
}

/** Deep copy of the species table, for tuning without touching the defaults. */
export function cloneSpeciesTable(
  table: Record<TreeSpeciesId, TreeSpeciesDef> = TREE_SPECIES,
): Record<TreeSpeciesId, TreeSpeciesDef> {
  return JSON.parse(JSON.stringify(table)) as Record<TreeSpeciesId, TreeSpeciesDef>
}
