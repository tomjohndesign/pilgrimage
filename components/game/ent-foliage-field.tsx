"use client"
import type { ComponentProps } from "react"
import { FoliageField } from "./foliage-field"
import { useEntAtlas } from "../tree-lab/use-ent-atlas"
import type { GameMap } from "@/lib/game/map/types"

export function EntFoliageField({ map, ...props }: ComponentProps<typeof FoliageField> & { map: GameMap }) {
  const { atlas, designs } = useEntAtlas()
  return <FoliageField {...props} entMap={map} entAtlas={atlas} entDesigns={designs} />
}
