"use client"

import { createContext } from "react"
import type { GameMap } from "@/lib/game/map/types"

/** Keep large terrain buffers out of each character's props. Characters still
 * observe live placement/ground changes, and playgrounds may supply a map. */
export const CharacterMapContext = createContext<GameMap | undefined>(undefined)
