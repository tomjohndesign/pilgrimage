"use client"

import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { lightOffsetForYaw, yawFromForward } from "@/lib/game/render/iso"

/**
 * The sun, chained to the camera's yaw so the shaded faces of every box stay on
 * the same side of the *screen* in all four views. It reads the camera's actual
 * displayed direction each frame — mid-tween included — so a view rotation
 * fades the shading around rather than snapping it.
 */
export function CameraLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null)
  const forward = useRef(new THREE.Vector3())

  useFrame(({ camera }) => {
    const light = lightRef.current
    if (!light) return
    camera.getWorldDirection(forward.current)
    const yaw = yawFromForward(forward.current.x, forward.current.z)
    const [x, y, z] = lightOffsetForYaw(yaw)
    light.position.set(x, y, z)
  })

  return <directionalLight ref={lightRef} position={lightOffsetForYaw(0)} intensity={2.7} />
}
