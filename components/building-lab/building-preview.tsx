"use client"

import { SURFACE_LIGHT } from "@/lib/game/render/lighting"

import { Canvas, useThree } from "@react-three/fiber"
import { useEffect } from "react"
import { cameraOffset, yawForView, lightOffsetForYaw } from "@/lib/game/render/iso"
import { type BuildingRecipe } from "@/lib/game/building-art/style"
import { BuildingModel } from "./building-model"

function Camera({ view, footprint }: { view: number; footprint: number }) {
  const { camera, size } = useThree()
  useEffect(() => {
    camera.position.set(...cameraOffset(yawForView(view)))
    camera.position.y += 1.3
    camera.lookAt(0, 1.3, 0)
    if ("zoom" in camera) camera.zoom = Math.min(size.width, size.height) / (footprint * 1.3 + 1.5)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
  }, [camera, size, view, footprint])
  return null
}

export function BuildingPreview({ recipe, cutaway, grid }: { recipe: BuildingRecipe; cutaway: boolean; grid: boolean }) {
  return <Canvas fallback={<p style={{ padding: 32, color: "#352b24" }}>This preview needs WebGL. Concept art and prompt exports are still available.</p>} orthographic camera={{ position: cameraOffset(yawForView(recipe.view)), near: 0.1, far: 400, zoom: 35 }} dpr={[1, 2]}>
    <color attach="background" args={["#d8dcc1"]} />
    <Camera view={recipe.view} footprint={Math.max(recipe.width, recipe.depth)} />
    <ambientLight intensity={SURFACE_LIGHT.ambient} />
    <hemisphereLight args={[SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere]} />
    <directionalLight intensity={SURFACE_LIGHT.sun} position={lightOffsetForYaw(yawForView(recipe.view))} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
      <planeGeometry args={[200,200]} /><meshLambertMaterial color="#aeb78e" />
    </mesh>
    {grid && <gridHelper args={[Math.max(recipe.width, recipe.depth), Math.max(recipe.width, recipe.depth), "#6b7358", "#89906e"]} position={[0,-0.015,0]} />}
    <BuildingModel recipe={recipe} cutaway={cutaway} />
    {/hovel|relic/i.test(recipe.subject) && <group position={[0,0.16,0]}>
      <mesh position={[0,0.16,0]}><boxGeometry args={[0.5,0.32,0.5]} /><meshLambertMaterial color="#a29c8b" /></mesh>
      <mesh position={[0,0.44,0]} rotation={[0,Math.PI/4,0]}><octahedronGeometry args={[0.14]} /><meshBasicMaterial color="#d6a33b" /></mesh>
    </group>}
  </Canvas>
}
