"use client"

import { createContext, Suspense, useContext, useLayoutEffect, type ReactNode } from "react"
import type { MapRevealState } from "@/lib/game/render/map-reveal"

export const SceneAssetsContext = createContext<MapRevealState | null>(null)

function PendingSceneAsset() {
  const assets = useContext(SceneAssetsContext)
  useLayoutEffect(() => assets?.begin(), [assets])
  return null
}

/** Also reports nested sprite boundaries; outside the game this is ordinary Suspense. */
export function SceneAssetBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PendingSceneAsset />}>{children}</Suspense>
}
