"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { useThree } from "@react-three/fiber"
import type * as THREE from "three"
import { registerStaticBlock } from "@/lib/game/render/static-blocks"

export function StaticBlock({ children, enabled = true, batchInstances = false }: { children: ReactNode; enabled?: boolean; batchInstances?: boolean }) {
  const scene = useThree(state => state.scene)
  const group = useRef<THREE.Group>(null)
  // Parent layout effects populate the instance matrices before bounds are read.
  useEffect(() => {
    if (enabled && group.current) return registerStaticBlock(scene, group.current, batchInstances)
  }, [scene, children, enabled, batchInstances])
  return <group ref={group}>{children}</group>
}
