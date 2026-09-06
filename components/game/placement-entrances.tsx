import { buildingYaw } from "@/lib/game/building-rotation"

/** Gold thresholds and stepped inward arrows remain legible through the ghost roof. */
export function PlacementEntrances({ type, w, d }: { type: string; w: number; d: number }) {
  const sides = type === "cross" ? [] : type === "enclosure" ? [0, 1, 2, 3] : type === "garden" ? [0, 2] : [0]
  return <group name="placement-entrances">
    {sides.map(side => {
      const span = side % 2 ? d : w
      const depth = side % 2 ? w : d
      const width = Math.min(0.62, span * 0.58)
      return <group key={side} rotation={[0, buildingYaw(side), 0]}>
        <mesh position={[0, 0.09, depth / 2 - 0.04]} renderOrder={6} raycast={() => {}}>
          <boxGeometry args={[width, 0.04, 0.1]} />
          <meshBasicMaterial color="#ffe5a0" transparent depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
        {[0, 1, 2].map(step => <mesh key={step} position={[0, 0.09, depth / 2 + 0.13 + step * 0.08]} renderOrder={6} raycast={() => {}}>
          <boxGeometry args={[0.08 + step * 0.16, 0.04, 0.08]} />
          <meshBasicMaterial color="#ffe5a0" transparent depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>)}
      </group>
    })}
  </group>
}
