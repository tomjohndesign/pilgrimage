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

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams

  const initialSettings: Partial<MapSettings> = {}
  const size = parseIntParam(params.size)
  const coverage = parseIntParam(params.forest)
  const clusters = parseIntParam(params.clusters)
  const groves = parseIntParam(params.groves)
  const treeDensity = parseIntParam(params.trees)
  if (size !== undefined) initialSettings.size = size
  if (coverage !== undefined) initialSettings.coverage = coverage
  if (clusters !== undefined) initialSettings.clusters = clusters
  if (groves !== undefined) initialSettings.groves = groves
  if (treeDensity !== undefined) initialSettings.treeDensity = treeDensity

  return <GameShell initialSeed={parseIntParam(params.seed)} initialSettings={initialSettings} />
}
