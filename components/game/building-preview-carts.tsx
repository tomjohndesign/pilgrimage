"use client"

import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { selectElement } from "@/lib/game/selection"
import { Suspense } from "react"
import type { Color } from "three"
import type { GameMap } from "@/lib/game/map/types"
import { walkingSurface } from "@/lib/game/map/walking-surface"
import { marketBayPose } from "@/lib/game/transport/building-parking"
import { TransportSprite } from "./transport-sprite"

/** Park the existing transport assets beside the gallery's staffed vendor. */
export function BuildingPreviewCarts({ map, characterScale, idColors }: { map: GameMap; characterScale: number; idColors: Color[] }) {
  const selection = useCameraStore(state => state.selection)
  const index = map.buildings.findIndex(b => b.id === "preview-market")
  if (index < 0) return null
  const pose = marketBayPose(map, map.buildings[index], "donkey", characterScale)
  const candidate = { kind: "building" as const, id: map.buildings[index].id }
  const selected = isSelected(selection,candidate)
  const onClick = (event: Parameters<typeof selectElement>[1]) => { selectElement(candidate,event) }
  const id = idColors[index].toArray() as [number,number,number]
  const at = (p: { x: number; z: number }): [number,number,number] => [p.x, walkingSurface(map,p.x,p.z).height, p.z]
  return <Suspense fallback={null}>
    <group name="preview-vendor-cart" position={at(pose)} userData={{ heading: pose.heading, moving: false, activity: "parked", riding: false }}>
      <TransportSprite kind="cart" puller="donkey" cargo="produce" map={map} characterScale={characterScale} outlineColor={id} selected={selected} onClick={onClick} />
    </group>
    <group name="preview-vendor-donkey" position={at(pose.hitch)} userData={{ heading: pose.heading, moving: false, hitched: true }}>
      <TransportSprite kind="donkey" map={map} characterScale={characterScale} outlineColor={id} selected={selected} onClick={onClick} />
    </group>
  </Suspense>
}
