"use client"

import { useRef, type ReactNode } from "react"
import { useFrame } from "@react-three/fiber"
import type * as THREE from "three"
import { sceneryDetail } from "@/lib/game/render/scenery-detail"

/** Interior inventory stays mounted, but neither draws nor catches clicks in
 * the overview. Exterior workshop stacks remain usable at every zoom. */
export function CloseScenery({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const root = useRef<THREE.Group>(null)
  useFrame(({ scene }) => { if (root.current) root.current.visible = !enabled || sceneryDetail(scene) === 0 })
  return <group ref={root} name="interior-inventory" raycast={() => root.current?.visible ? undefined : false}>{children}</group>
}
