"use client"

import { createContext } from "react"
import type { GameMap } from "@/lib/game/map/types"

/** Block readers share the current map without passing its large elevation
 * buffers through every mesh's props and React's development prop diagnostics. */
export const TerrainMapContext = createContext<GameMap | null>(null)
