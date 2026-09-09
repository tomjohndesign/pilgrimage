"use client"

import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from "react"
import { useFrame, type RootState } from "@react-three/fiber"
import type { GameMap } from "@/lib/game/map/types"
import type { Object3D } from "three"
import { benchmarkWork } from "@/lib/game/benchmark-work"
import { isWorldVisible } from "@/lib/game/render/visibility"
import { withTerrainCornerQueries } from "@/lib/game/map/cliff-corners"
import { updateCrowdWalk, type CrowdWalk } from "@/lib/game/render/crowd-walk"
import type { CharacterBatchEntry } from "@/lib/game/render/character-batch"
import { spriteView } from "@/lib/game/render/sprite-view"
import { sceneryDetail } from "@/lib/game/render/scenery-detail"

type Update = (state: RootState, delta: number) => void
export interface CrowdFrame {
  walk: CrowdWalk
  pose: { current: Object3D | null }
  entry: { current: CharacterBatchEntry | null }
  control: { enabled: boolean }
  publish: (entry: CharacterBatchEntry, batched: boolean) => void
}
type Listener = { current: { update: Update; crowd?: CrowdFrame } }
type Frames = Map<GameMap | undefined, Set<Listener>>
const Context = createContext<Frames | null>(null)

/** One frame subscription and terrain snapshot for the whole sprite crowd.
 * Pose state and distance-driven foot contacts remain individual. */
export function SpriteFrames({ children, visibleRoot }: { children: ReactNode; visibleRoot?: { current: Object3D | null } }) {
  const groups = useMemo<Frames>(() => new Map(), [])
  useFrame((state, delta) => {
    if (visibleRoot && (!isWorldVisible(visibleRoot.current) ||
      (process.env.NEXT_PUBLIC_GAME_BENCHMARK === "1" && !benchmarkWork.characterVisuals))) return
    const view = spriteView(state.camera), detail = sceneryDetail(state.scene), time = state.clock.elapsedTime
    for (const [map, listeners] of groups) withTerrainCornerQueries(map, () => {
      for (const listener of listeners) {
        const { crowd, update } = listener.current
        if (crowd && crowd.control.enabled) {
          const pose = crowd.pose.current, parent = pose?.parent, entry = crowd.entry.current
          // Hidden figures have no current pose stamp. Skip their general callback too.
          if (parent?.name === "traveler-unit" && !parent.visible) continue
          if (pose && parent && entry && parent.name === "traveler-unit" && parent.userData.poseWorldFrame === time) {
            if (!isWorldVisible(parent)) continue
            if (updateCrowdWalk(crowd.walk, parent, pose, entry, view, detail, delta)) {
              crowd.publish(entry, true); continue
            }
          }
        }
        update(state, delta)
      }
    }, state.clock)
  })
  return <Context.Provider value={groups}>{children}</Context.Provider>
}

export function SpriteFrame({ map, update, crowd }: { map?: GameMap; update: Update; crowd?: CrowdFrame }) {
  const groups = useContext(Context), listener = useRef({ update, crowd })
  useLayoutEffect(() => { listener.current = { update, crowd } })
  useLayoutEffect(() => {
    if (!groups) return
    let listeners = groups.get(map)
    if (!listeners) { listeners = new Set(); groups.set(map, listeners) }
    listeners.add(listener)
    return () => { listeners.delete(listener); if (!listeners.size) groups.delete(map) }
  }, [groups, map])
  return groups ? null : <LocalSpriteFrame map={map} update={update} />
}

/** Asset editors and standalone figures keep their ordinary local frame hook. */
function LocalSpriteFrame({ map, update }: { map?: GameMap; update: Update }) {
  useFrame((state, delta) => withTerrainCornerQueries(map, () => update(state, delta), state.clock))
  return null
}
