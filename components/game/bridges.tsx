"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"

import { BRIDGE_RISE, bridgeLayout, type BridgeSpan } from "@/lib/game/map/bridges"
import { clampRoadTier } from "@/lib/game/map/road"
import { TILE_HEIGHT } from "@/lib/game/map/terrain"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import { deriveSeed, makeRng, SEED_STREAM } from "@/lib/game/rng"
import { OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"

/**
 * The bridges: decks floating BRIDGE_RISE above the water on driven piles,
 * reached by the ramps the terrain grows at each end (see terrain-tiles.tsx
 * and lib/game/map/bridges.ts for where those come from).
 *
 * What a bridge is built of follows the road. While the road is a dirt trail
 * or gravel, its bridges are timber: planks laid across two stringers, on
 * bearers over pairs of piles that rise on through the deck as posts for a
 * handrail. Once the road is surfaced in stone, so are its bridges: a slab on
 * squat piers with a low parapet. A track's bridge is always timber — the
 * track never becomes road however the road is dressed.
 *
 * Everything is a box or a six-sided post, drawn as three instanced meshes
 * (boxes, posts, and the deck's ID silhouette for the outline pass), so a
 * map's bridges cost a handful of draw calls however many there are.
 */

const DECK_TOP = TILE_HEIGHT + BRIDGE_RISE
/** How far the deck reaches onto the ramp at each end, so the seam never gapes. */
const DECK_OVERHANG = 0.12
/** Piles and piers are driven just into the slab, below the water surface. */
const PILE_BASE = 0.02

/** Road tiers up to this one carry timber bridges; above it, stone. */
const LAST_TIMBER_TIER = 1

// --- Timber ------------------------------------------------------------------
const DECK_WIDTH = 0.84
const PLANK_PITCH = 0.2
const PLANK_LENGTH = 0.16
const PLANK_THICKNESS = 0.05
const STRINGER_WIDTH = 0.08
const STRINGER_HEIGHT = 0.07
const BEARER_LENGTH = 0.08
const BEARER_HEIGHT = 0.07
const POST_RADIUS = 0.045
/** Posts rise this far above the deck to carry the handrail. */
const POST_HEIGHT = 0.3
const RAIL_SIZE = 0.04

const PLANK_COLOR = "#96744c"
const TIMBER_COLOR = "#6b5238"
const POST_COLOR = "#5a4531"
/** Brightness spread between one plank and the next. */
const WOOD_GRAIN = 0.18

// --- Stone -------------------------------------------------------------------
const SLAB_WIDTH = 0.92
const SLAB_THICKNESS = 0.14
const PIER_LENGTH = 0.26
const PIER_WIDTH = 0.7
const PARAPET_HEIGHT = 0.12
const PARAPET_WIDTH = 0.08
const PARAPET_SEGMENT = 0.5
const STONE_GRAIN = 0.1

/** Stone colours by road tier; only the stone tiers are ever looked up. */
const STONE: Record<number, { slab: string; pier: string }> = {
  2: { slab: "#8a8173", pier: "#6e675c" },
  3: { slab: "#a79e8b", pier: "#857c6b" },
}

/** One instance: a unit box or post, placed, yawed, scaled, and tinted (linear RGB). */
interface Piece {
  x: number
  y: number
  z: number
  rotY: number
  sx: number
  sy: number
  sz: number
  r: number
  g: number
  b: number
}

interface Pieces {
  boxes: Piece[]
  posts: Piece[]
  /** Deck slabs only, for the outline pass: depth, no ID. */
  silhouettes: Piece[]
}

/**
 * Places pieces in a span's own frame: `along` runs from the span's centre
 * toward its `to` end, `across` to the side. A box's `length` lies along the
 * span and its `width` across it; the yaw turns the unit box to match.
 */
function spanFrame(map: GameMap, span: BridgeSpan) {
  const first = span.tiles[0]
  const last = span.tiles[span.tiles.length - 1]
  const cx = (tileToWorldX(map, first.x) + tileToWorldX(map, last.x)) / 2
  const cz = (tileToWorldZ(map, first.z) + tileToWorldZ(map, last.z)) / 2
  // A yaw of π/2 maps local +x onto world −z; boxes are symmetric, so the
  // sign doesn't matter — only that length and width swap axes.
  const rotY = span.dx !== 0 ? 0 : Math.PI / 2
  return (
    along: number,
    across: number,
    y: number,
    length: number,
    height: number,
    width: number,
    color: THREE.Color,
  ): Piece => ({
    x: cx + span.dx * along - span.dz * across,
    y,
    z: cz + span.dz * along + span.dx * across,
    rotY,
    sx: length,
    sy: height,
    sz: width,
    r: color.r,
    g: color.g,
    b: color.b,
  })
}

function timberBridge(map: GameMap, span: BridgeSpan, rng: () => number, out: Pieces): void {
  const place = spanFrame(map, span)
  const n = span.tiles.length
  const length = n + 2 * DECK_OVERHANG
  const color = new THREE.Color()
  const grain = (hex: string, spread: number) =>
    color.set(hex).multiplyScalar(1 + (rng() - 0.5) * spread)

  // Planks laid across the deck, evenly spaced to fill its length exactly.
  const plankCount = Math.max(1, Math.round(length / PLANK_PITCH))
  const pitch = length / plankCount
  for (let k = 0; k < plankCount; k++) {
    const along = -length / 2 + pitch * (k + 0.5)
    out.boxes.push(
      place(along, 0, DECK_TOP - PLANK_THICKNESS / 2, PLANK_LENGTH, PLANK_THICKNESS, DECK_WIDTH, grain(PLANK_COLOR, WOOD_GRAIN)),
    )
  }
  out.silhouettes.push(place(0, 0, DECK_TOP - PLANK_THICKNESS / 2, length, PLANK_THICKNESS, DECK_WIDTH, color.set("black")))

  // Two stringers run the length of the span under the planks.
  const stringerTop = DECK_TOP - PLANK_THICKNESS
  for (const side of [-1, 1]) {
    out.boxes.push(
      place(0, side * (DECK_WIDTH / 2 - 0.1), stringerTop - STRINGER_HEIGHT / 2, length, STRINGER_HEIGHT, STRINGER_WIDTH, grain(TIMBER_COLOR, WOOD_GRAIN / 2)),
    )
  }

  // At every tile boundary — bank to bank — a bearer across the stringers on
  // a pair of piles, which carry on up through the deck as handrail posts.
  const bearerTop = stringerTop - STRINGER_HEIGHT
  const postTop = DECK_TOP + POST_HEIGHT
  for (let k = 0; k <= n; k++) {
    const along = -n / 2 + k
    out.boxes.push(
      place(along, 0, bearerTop - BEARER_HEIGHT / 2, BEARER_LENGTH, BEARER_HEIGHT, DECK_WIDTH + 0.06, grain(TIMBER_COLOR, WOOD_GRAIN / 2)),
    )
    for (const side of [-1, 1]) {
      out.posts.push(
        place(along, side * (DECK_WIDTH / 2 - POST_RADIUS), (PILE_BASE + postTop) / 2, POST_RADIUS, postTop - PILE_BASE, POST_RADIUS, grain(POST_COLOR, WOOD_GRAIN / 2)),
      )
    }
  }

  // The handrail along the post tops on either side.
  for (const side of [-1, 1]) {
    out.boxes.push(
      place(0, side * (DECK_WIDTH / 2 - POST_RADIUS), postTop - RAIL_SIZE / 2, length, RAIL_SIZE, RAIL_SIZE, grain(POST_COLOR, WOOD_GRAIN / 2)),
    )
  }
}

function stoneBridge(map: GameMap, span: BridgeSpan, tier: number, rng: () => number, out: Pieces): void {
  const place = spanFrame(map, span)
  const n = span.tiles.length
  const length = n + 2 * DECK_OVERHANG
  const stone = STONE[tier] ?? STONE[3]
  const color = new THREE.Color()
  const grain = (hex: string, spread: number) =>
    color.set(hex).multiplyScalar(1 + (rng() - 0.5) * spread)

  out.boxes.push(place(0, 0, DECK_TOP - SLAB_THICKNESS / 2, length, SLAB_THICKNESS, SLAB_WIDTH, color.set(stone.slab)))
  out.silhouettes.push(place(0, 0, DECK_TOP - SLAB_THICKNESS / 2, length, SLAB_THICKNESS, SLAB_WIDTH, color.set("black")))

  // A pier at every tile boundary, abutments at the banks included.
  const slabBottom = DECK_TOP - SLAB_THICKNESS
  for (let k = 0; k <= n; k++) {
    out.boxes.push(
      place(-n / 2 + k, 0, (PILE_BASE + slabBottom) / 2, PIER_LENGTH, slabBottom - PILE_BASE, PIER_WIDTH, grain(stone.pier, STONE_GRAIN)),
    )
  }

  // Low parapets in coursed blocks, each its own shade of stone.
  const segments = Math.max(1, Math.round(length / PARAPET_SEGMENT))
  const segment = length / segments
  for (let k = 0; k < segments; k++) {
    const along = -length / 2 + segment * (k + 0.5)
    for (const side of [-1, 1]) {
      out.boxes.push(
        place(along, side * (SLAB_WIDTH / 2 - PARAPET_WIDTH / 2), DECK_TOP + PARAPET_HEIGHT / 2, segment * 0.96, PARAPET_HEIGHT, PARAPET_WIDTH, grain(stone.slab, STONE_GRAIN)),
      )
    }
  }
}

function buildPieces(map: GameMap, tier: number): Pieces {
  const out: Pieces = { boxes: [], posts: [], silhouettes: [] }
  const rng = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.bridgeGrain))
  for (const span of bridgeLayout(map).spans) {
    const timber = span.kind === "track" || tier <= LAST_TIMBER_TIER
    if (timber) timberBridge(map, span, rng, out)
    else stoneBridge(map, span, tier, rng, out)
  }
  return out
}

/** One instanced mesh of unit boxes or posts, placed from a piece list. */
function PieceBatch({
  pieces,
  shape,
  silhouette = false,
}: {
  pieces: Piece[]
  shape: "box" | "post"
  /** Draw on the outline layer as ID 0: depth only, no colour. */
  silhouette?: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const color = new THREE.Color()
    pieces.forEach((piece, i) => {
      position.set(piece.x, piece.y, piece.z)
      quaternion.setFromAxisAngle(up, piece.rotY)
      scale.set(piece.sx, piece.sy, piece.sz)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(i, matrix)
      if (!silhouette) mesh.setColorAt(i, color.setRGB(piece.r, piece.g, piece.b))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [pieces, silhouette])

  return (
    <instancedMesh
      ref={ref}
      // The instances are scattered across the map; the mesh's own bounds
      // (a unit box at the origin) would cull them all wrongly.
      frustumCulled={false}
      args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, pieces.length]}
      {...(silhouette ? { "layers-mask": OUTLINE_ID_LAYER_MASK } : {})}
    >
      {shape === "box" ? (
        <boxGeometry args={[1, 1, 1]} />
      ) : (
        <cylinderGeometry args={[1, 1, 1, 6]} />
      )}
      {silhouette ? (
        <meshBasicMaterial color="black" toneMapped={false} />
      ) : (
        <meshLambertMaterial />
      )}
    </instancedMesh>
  )
}

export function Bridges({
  map,
  roadTier = 0,
}: {
  map: GameMap
  /** Road development tier — index into ROAD_TIERS; decides timber or stone. */
  roadTier?: number
}) {
  const tier = clampRoadTier(roadTier)
  const pieces = useMemo(() => buildPieces(map, tier), [map, tier])
  if (pieces.boxes.length === 0) return null

  return (
    <group>
      <PieceBatch pieces={pieces.boxes} shape="box" />
      <PieceBatch pieces={pieces.posts} shape="post" />
      <PieceBatch pieces={pieces.silhouettes} shape="box" silhouette />
    </group>
  )
}
