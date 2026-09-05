import { DEFAULT_ELEVATION, ELEVATION_CONTROLS, elevationSettings, type ElevationSettings } from "@/lib/game/map/elevation"
import type { Metadata } from "next"

import { GameShell, type MapSettings } from "@/components/game/game-shell"

export const metadata: Metadata = {
  title: "Pilgrimage — Prototype",
  description: "Isometric camera and map prototype for Pilgrimage.",
}

function parseIntParam(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseFloatParam(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams

  const initialSettings: Partial<MapSettings> = {}
  if (params.characters === "base" || params.characters === "callings") {
    initialSettings.characterModel = params.characters
  }
  for (const key of ["baseSize", "draftSize"] as const) {
    const scale = parseFloatParam(params[key])
    if (scale !== undefined) initialSettings[key] = Math.min(4, Math.max(0.5, scale))
  }
  if (params.timing === "distance" || params.timing === "fps") initialSettings.walkSync = params.timing === "distance"
  for (const [query, key, min, max] of [
    ["stride", "stride", 0.15, 1.2], ["variation", "paceVariation", 0, 0.4],
    ["easing", "pathEase", 0, 1], ["acceleration", "acceleration", 0, 1.5],
  ] as const) {
    const value = parseFloatParam(params[query])
    if (value !== undefined) initialSettings[key] = Math.max(min, Math.min(max, value))
  }
  const elevation = { ...DEFAULT_ELEVATION }
  for (const key of Object.keys(ELEVATION_CONTROLS) as (keyof ElevationSettings)[]) {
    const value = parseFloatParam(params[`e_${key}`])
    if (value !== undefined) elevation[key] = value
  }
  initialSettings.elevation = elevationSettings(elevation)
  const size = parseIntParam(params.size)
  const coverage = parseIntParam(params.forest)
  const glades = parseIntParam(params.glades)
  const clearings = parseIntParam(params.clearings)
  const darkForests = parseIntParam(params.dark)
  const relicDistance = parseIntParam(params.relic)
  const traffic = parseIntParam(params.traffic)
  const walkSpeed = parseFloatParam(params.speed)
  const characterFps = parseIntParam(params.fps)
  if (characterFps !== undefined) initialSettings.characterFps = Math.min(24, Math.max(1, characterFps))
  const road = parseIntParam(params.road)
  const roadOpacity = parseFloatParam(params.opacity)
  const roadShade = parseFloatParam(params.shade)
  const roadEdgeLine = parseFloatParam(params.edgeline)
  const roadEdgeWidth = parseFloatParam(params.edgewidth)
  const water = parseIntParam(params.water)
  const rivers = parseIntParam(params.rivers)
  const lakes = parseIntParam(params.lakes)
  const ponds = parseIntParam(params.ponds)
  if (size !== undefined) initialSettings.size = size
  if (coverage !== undefined) initialSettings.coverage = coverage
  if (glades !== undefined) initialSettings.glades = glades
  if (clearings !== undefined) initialSettings.clearings = clearings
  if (darkForests !== undefined) initialSettings.darkForests = darkForests
  if (relicDistance !== undefined) initialSettings.relicDistance = relicDistance
  if (traffic !== undefined) initialSettings.traffic = traffic
  if (walkSpeed !== undefined) initialSettings.walkSpeed = walkSpeed
  if (road !== undefined) initialSettings.road = road
  if (roadOpacity !== undefined) initialSettings.roadOpacity = roadOpacity
  if (roadShade !== undefined) initialSettings.roadShade = roadShade
  if (roadEdgeLine !== undefined) initialSettings.roadEdgeLine = roadEdgeLine
  if (roadEdgeWidth !== undefined) initialSettings.roadEdgeWidth = roadEdgeWidth
  if (water !== undefined) initialSettings.water = water
  if (rivers !== undefined) initialSettings.rivers = rivers
  if (lakes !== undefined) initialSettings.lakes = lakes
  if (ponds !== undefined) initialSettings.ponds = ponds

  return <GameShell initialSeed={parseIntParam(params.seed)} initialSettings={initialSettings} />
}
