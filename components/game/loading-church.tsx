"use client"

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from "react"
import { DEFAULT_VIEW_SIZE } from "@/lib/game/render/iso"
import { CHARACTER_PIXEL_SIZE } from "@/lib/game/render/pixel-scale"
import { elevationNoise } from "@/lib/game/map/elevation"
import type { MapRevealPhase } from "@/lib/game/render/map-reveal"
import dynamic from "next/dynamic"
import { CONSTRUCTION_BAR_WIDTH, CONSTRUCTION_BAR_HEIGHT } from "@/lib/game/render/construction-bar"
import "./loading-church.css"

const LandingScene = dynamic(() => import("./landing-scene").then(m => m.LandingScene), { ssr: false })

const TILE_WIDTH = Math.SQRT2
const HALF_TILE_HEIGHT = 1 / Math.sqrt(6)
const PATTERN_COLUMNS = 16
const PATTERN_ROWS = 32
const PATTERN_WIDTH = PATTERN_COLUMNS * TILE_WIDTH
const PATTERN_HEIGHT = PATTERN_ROWS * HALF_TILE_HEIGHT
const GROUND_OFFSET = 1.15 * Math.sqrt(2 / 3)

function movingTileOpacity(index: number, seconds: number) {
  const column = index % PATTERN_COLUMNS, row = Math.floor(index / PATTERN_COLUMNS)
  const x = column + (row % 2) / 2, z = row / 2
  const noise = .65 * elevationNoise(1234, x * .6 + seconds * .2, z * .6 + seconds * .11)
    + .35 * elevationNoise(1234 ^ 0x5be0cd19, x * 1.8 - seconds * .1, z * 1.8 + seconds * .15)
  return (.04 + .06 * noise * noise * (3 - 2 * noise)).toFixed(5)
}

// Sample one noise field across space and time. Each cell gets eased fades
// between its samples; CSS animates them before the game JavaScript is ready.
const TILE_SHIMMER = Array.from({ length: PATTERN_COLUMNS * PATTERN_ROWS }, (_, i) => {
  const column = i % PATTERN_COLUMNS, row = Math.floor(i / PATTERN_COLUMNS)
  const x = column + (row % 2) / 2, z = row / 2
  const style: Record<string, string | number> = {
    "--shimmer-delay": `${-12 * elevationNoise(9127, x * 1.7, z * 1.7)}s`,
  }
  for (let frame = 0; frame < 4; frame++) {
    const seed = 1234 + frame * 7919
    const noise = .65 * elevationNoise(seed, x * .6, z * .6)
      + .35 * elevationNoise(seed ^ 0x5be0cd19, x * 1.8, z * 1.8)
    const eased = noise * noise * (3 - 2 * noise)
    style[`--shimmer-${frame}`] = (.04 + .06 * eased).toFixed(5)
  }
  return style as CSSProperties
})

const LOADING_TILES = Array.from({ length: (PATTERN_COLUMNS + 2) * (PATTERN_ROWS + 4) }, (_, i) => {
  const column = i % (PATTERN_COLUMNS + 2) - 1, row = Math.floor(i / (PATTERN_COLUMNS + 2)) - 3
  const wrappedColumn = (column + PATTERN_COLUMNS) % PATTERN_COLUMNS
  const wrappedRow = (row + PATTERN_ROWS) % PATTERN_ROWS
  const px = (column + (wrappedRow % 2) / 2) * TILE_WIDTH
  const py = row * HALF_TILE_HEIGHT + GROUND_OFFSET
  return {
    points: `${px},${py - HALF_TILE_HEIGHT} ${px + TILE_WIDTH / 2},${py} ${px},${py + HALF_TILE_HEIGHT} ${px - TILE_WIDTH / 2},${py}`,
    style: TILE_SHIMMER[wrappedRow * PATTERN_COLUMNS + wrappedColumn],
    noiseIndex: wrappedRow * PATTERN_COLUMNS + wrappedColumn,
  }
})
// One stroked path keeps shared edges at 10%, without stacking two tile strokes.
const GRID_LINES = LOADING_TILES.map(tile => `M${tile.points}Z`).join(" ")

/** The opening landmark and tiled ground are ordinary page HTML, available
 * before game JavaScript. The priority image uses the actual church geometry.
 */
export function LoadingChurch({ showChurch, phase, overlayRef, idle = false, generating = false, view = 0, viewSize = DEFAULT_VIEW_SIZE }: {
  idle?: boolean; generating?: boolean
  showChurch: boolean; phase: MapRevealPhase; overlayRef: RefObject<HTMLDivElement | null>; view?: number; viewSize?: number
}) {
  const [sceneReady, setSceneReady] = useState(false)
  const onSceneReady = useCallback(() => setSceneReady(true), [])
  const patternId = useId()
  const tilesRef = useRef<SVGSVGElement>(null)
  const active = !idle && phase !== "complete"
  useEffect(() => {
    const root = tilesRef.current
    if (!active || !root) return
    const tiles = [...root.querySelectorAll("polygon")]
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    // Preserve the CSS-only first paint when live noise takes over. Opacity
    // targets change at low frequency; each cell transitions between them.
    const initial = tiles.map(tile => getComputedStyle(tile).opacity)
    tiles.forEach((tile, i) => { tile.style.opacity = initial[i] })
    root.dataset.noiseLive = "true"
    let seconds = 0
    const timer = window.setInterval(() => {
      if (media.matches || document.hidden) return
      seconds += .6
      const opacity = TILE_SHIMMER.map((_, i) => movingTileOpacity(i, seconds))
      tiles.forEach((tile, i) => { tile.style.opacity = opacity[LOADING_TILES[i].noiseIndex] })
    }, 600)
    return () => {
      window.clearInterval(timer)
      delete root.dataset.noiseLive
    }
  }, [active])
  if (!showChurch && phase === "complete") return null
  const scale = 100 / viewSize
  return <div ref={overlayRef} className="loading-church" data-loading-church data-phase={phase} data-idle={idle}
    style={{ "--ground-offset": `${GROUND_OFFSET * scale}dvh`, "--church-caption-offset": `${3.5 * scale}dvh`, "--church-roof-offset": `${3.6 * scale}dvh`, "--loading-pixel": `${CHARACTER_PIXEL_SIZE * scale}dvh` } as CSSProperties}>
    {phase !== "complete" && <div className="loading-church-ground" aria-hidden="true"><div className="loading-church-wipe">
    <svg ref={tilesRef} className="loading-church-tiles" width="100%" height="100%">
      <defs>
        {/* A small repeating field covers any viewport without thousands of DOM
            tiles. Its origin and scale share the church's isometric ground. */}
        <pattern id={patternId} patternUnits="userSpaceOnUse" x="50%" y="50%"
          width={`${PATTERN_WIDTH * scale}dvh`} height={`${PATTERN_HEIGHT * scale}dvh`}
          viewBox={`0 0 ${PATTERN_WIDTH} ${PATTERN_HEIGHT}`}>
          {LOADING_TILES.map((tile, i) => <polygon key={i} fill="#749451" points={tile.points} style={tile.style} />)}
          <path className="loading-church-gridlines" d={GRID_LINES} fill="none" stroke="#91ad6d"
            strokeOpacity={.1} strokeWidth={CHARACTER_PIXEL_SIZE} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
    {!idle && <svg className="loading-church-pulse" viewBox="-8 -5 16 10" fill="white"
      style={{ width: `${16 * scale}dvh`, height: `${10 * scale}dvh`, marginTop: `${GROUND_OFFSET * scale}dvh` }}>
      {Array.from({ length: 121 }, (_, i) => {
        const x = i % 11 - 5, z = Math.floor(i / 11) - 5
        const distance = Math.hypot(x, z)
        if (distance > 5) return null
        const px = (x - z) / Math.SQRT2, py = (x + z) * HALF_TILE_HEIGHT
        return <polygon key={i}
          points={`${px},${py - HALF_TILE_HEIGHT} ${px + TILE_WIDTH / 2},${py} ${px},${py + HALF_TILE_HEIGHT} ${px - TILE_WIDTH / 2},${py}`}
          style={{ "--pulse-delay": `${distance * .14}s`, "--pulse-opacity": .065 * (1 - distance / 6) } as CSSProperties} />
      })}
    </svg>}
    </div></div>}
    {idle && <div className="landing-scene" data-ready={sceneReady}><LandingScene viewSize={viewSize} onReady={onSceneReady} /></div>}
    {showChurch && !(idle && sceneReady) && <img src={`/textures/ui/loading-church-v1/${view}.webp`} width={256} height={256}
      fetchPriority="high" loading="eager" decoding="sync" alt="" draggable={false}
      className="loading-church-image" style={{ width: `${8 * scale}dvh`, height: `${8 * scale}dvh` }} />}
    {generating && <>
      <p className="loading-church-caption" role="status">generating map</p>
      <svg className="loading-church-progress" viewBox={`0 0 ${CONSTRUCTION_BAR_WIDTH} ${CONSTRUCTION_BAR_HEIGHT}`}
        role="progressbar" aria-label="Generating map" shapeRendering="crispEdges">
        <rect width={48} height={6} fill="#30210c" />
        <rect x={1} y={1} width={46} height={4} fill="#5b4d2f" />
        <rect className="loading-church-progress-fill" x={2} y={2} width={12} height={2} fill="#dab767" />
      </svg>
    </>}
  </div>
}
