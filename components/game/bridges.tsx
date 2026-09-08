"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { sceneryDetail } from "@/lib/game/render/scenery-detail"
import { buildBridgePieces, bridgeDetailPieces, type Piece } from "@/lib/game/render/bridge-pieces"
import { clampRoadTier } from "@/lib/game/map/road"
import type { GameMap } from "@/lib/game/map/types"
import { OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"

/** One instanced mesh of unit boxes or posts, placed from a piece list. */
function PieceBatch({
  pieces,
  shape,
  silhouette = false,
  detail,
}: {
  pieces: Piece[]
  shape: "box" | "post"
  /** Draw on the outline layer as ID 0: depth only, no colour. */
  silhouette?: boolean
  detail?: "close" | "distant"
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useFrame(({ scene }) => {
    if (ref.current && detail) ref.current.visible = (sceneryDetail(scene) === 0) === (detail === "close")
  })

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    const rotation = new THREE.Euler(0, 0, 0, "YXZ")
    const color = new THREE.Color()
    pieces.forEach((piece, i) => {
      position.set(piece.x, piece.y, piece.z)
      rotation.set(0, piece.rotY, piece.rotZ, "YXZ")
      quaternion.setFromEuler(rotation)
      scale.set(piece.sx, piece.sy, piece.sz)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(i, matrix)
      if (!silhouette) mesh.setColorAt(i, color.setRGB(piece.r, piece.g, piece.b))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [pieces, silhouette])

  return (
    <instancedMesh
      ref={ref}
      name={`bridge-${silhouette ? "depth" : `${shape}-${detail ?? "all"}`}`}
      // The instances are scattered across the map; the mesh's own bounds
      // (a unit box at the origin) would cull them all wrongly.
      frustumCulled={false}
      args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, pieces.length]}
      {...(silhouette ? { "layers-mask": OUTLINE_ID_LAYER_MASK } : {})}
    >
      {shape === "box" ? (
        <boxGeometry args={[1, 1, 1]} />
      ) : (
        <cylinderGeometry args={[1, 1, 1, detail === "distant" ? 3 : 6]} />
      )}
      {silhouette ? (
        <meshBasicMaterial color="black" toneMapped={false} />
      ) : (
        <meshLambertMaterial />
      )}
    </instancedMesh>
  )
}

export function Bridges({
  map,
  roadTier = 0,
}: {
  map: GameMap
  /** Road development tier — index into ROAD_TIERS; decides timber or stone. */
  roadTier?: number
}) {
  const tier = clampRoadTier(roadTier)
  const pieces = useMemo(() => buildBridgePieces(map, tier), [map, tier])
  const coarse = useMemo(() => bridgeDetailPieces(pieces), [pieces])
  if (pieces.boxes.length === 0) return null

  return (
    <group>
      <PieceBatch pieces={pieces.boxes} shape="box" detail="close" />
      <PieceBatch pieces={pieces.posts} shape="post" detail="close" />
      <PieceBatch pieces={coarse.boxes} shape="box" detail="distant" />
      <PieceBatch pieces={coarse.posts} shape="post" detail="distant" />
      <PieceBatch pieces={pieces.silhouettes} shape="box" silhouette />
    </group>
  )
}
