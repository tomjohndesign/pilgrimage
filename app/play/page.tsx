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
  const size = parseIntParam(params.size)
  const coverage = parseIntParam(params.forest)
  const glades = parseIntParam(params.glades)
  const clearings = parseIntParam(params.clearings)
  const traffic = parseIntParam(params.traffic)
  const walkSpeed = parseFloatParam(params.speed)
  if (size !== undefined) initialSettings.size = size
  if (coverage !== undefined) initialSettings.coverage = coverage
  if (glades !== undefined) initialSettings.glades = glades
  if (clearings !== undefined) initialSettings.clearings = clearings
  if (traffic !== undefined) initialSettings.traffic = traffic
  if (walkSpeed !== undefined) initialSettings.walkSpeed = walkSpeed

  return <GameShell initialSeed={parseIntParam(params.seed)} initialSettings={initialSettings} />
}
