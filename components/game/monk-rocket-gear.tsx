"use client"

import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type * as THREE from "three"

import { OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"
import type { FigureClickHandler } from "./traveler-figure"

/** The monk's movement loop switches the jets off while he is on the ground. */
export const ROCKET_EXHAUST_NAME = "monk-rocket-exhaust"

/** Twin back-mounted boosters and a steel helmet crowned with living flame. */
export function MonkRocketGear({ phase, outlineColor, onClick }: {
  phase: number
  outlineColor: THREE.Color
  onClick: FigureClickHandler
}) {
  const exhaust = useRef<THREE.Group>(null)
  const flames = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const time = clock.elapsedTime * 18 + phase * 2.3
    if (exhaust.current) exhaust.current.scale.y = 0.9 + Math.sin(time) * 0.2
    if (flames.current) {
      flames.current.scale.y = 0.95 + Math.sin(time * 0.7) * 0.15
      flames.current.rotation.z = Math.sin(time * 0.45) * 0.08
    }
  })

  return (
    <group name="monk-rocket-gear" onClick={onClick}>
      <mesh position={[0, 0.33, -0.19]}>
        <boxGeometry args={[0.4, 0.16, 0.12]} />
        <meshLambertMaterial color="#533323" />
      </mesh>
      {[-0.19, 0.19].map((x) => (
        <group key={x} position={[x, 0.28, -0.25]}>
          <mesh>
            <cylinderGeometry args={[0.095, 0.11, 0.42, 6]} />
            <meshLambertMaterial color="#85949d" />
          </mesh>
          <mesh position={[0, 0.24, 0]}>
            <coneGeometry args={[0.095, 0.12, 6]} />
            <meshLambertMaterial color="#b94c27" />
          </mesh>
          <mesh position={[0, -0.2, 0]}>
            <cylinderGeometry args={[0.105, 0.13, 0.1, 6]} />
            <meshLambertMaterial color="#3e454c" />
          </mesh>
          <mesh layers-mask={OUTLINE_ID_LAYER_MASK}>
            <boxGeometry args={[0.22, 0.5, 0.22]} />
            <meshBasicMaterial color={outlineColor} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <group name={ROCKET_EXHAUST_NAME} ref={exhaust} position={[0, 0.03, -0.25]} visible={false}>
        {[-0.19, 0.19].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, -0.29, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.12, 0.58, 5]} />
              <meshBasicMaterial color="#ff6826" toneMapped={false} />
            </mesh>
            <mesh position={[0, -0.13, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.085, 0.3, 5]} />
              <meshBasicMaterial color="#fff0a0" toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
      <mesh position={[0, 0.61, 0]}>
        <boxGeometry args={[0.37, 0.22, 0.37]} />
        <meshLambertMaterial color="#889ba5" />
      </mesh>
      <mesh position={[0, 0.54, 0]}>
        <boxGeometry args={[0.43, 0.055, 0.41]} />
        <meshLambertMaterial color="#d8a93f" />
      </mesh>
      <mesh position={[0, 0.6, 0.192]}>
        <boxGeometry args={[0.27, 0.065, 0.025]} />
        <meshLambertMaterial color="#242d34" />
      </mesh>
      <mesh position={[0, 0.61, 0]} layers-mask={OUTLINE_ID_LAYER_MASK}>
        <boxGeometry args={[0.39, 0.22, 0.39]} />
        <meshBasicMaterial color={outlineColor} toneMapped={false} />
      </mesh>
      <group ref={flames} position={[0, 0.72, 0]}>
        {[-0.11, 0, 0.11].map((x, i) => (
          <group key={x} position={[x, 0, 0]} rotation={[0, 0, -x * 1.8]}>
            <mesh position={[0, i === 1 ? 0.19 : 0.13, 0]}>
              <coneGeometry args={[0.095, i === 1 ? 0.43 : 0.31, 4]} />
              <meshBasicMaterial color="#ff6826" toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.09, 0.035]}>
              <coneGeometry args={[0.06, 0.23, 4]} />
              <meshBasicMaterial color="#ffdc65" toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}
