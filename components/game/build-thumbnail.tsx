"use client"

import { addSurfaceLighting } from "@/lib/game/render/lighting"

import Image from "next/image"
import { useEffect, useState } from "react"
import * as THREE from "three"
import { BUILD_CATALOG, type BuildId } from "@/lib/game/balance"
import { structureParts } from "@/lib/game/building-art/structure"
import { batchDetails } from "@/components/building-lab/building-model"
import { BUILDING_STYLE } from "@/lib/game/building-art/style"
import { buildingPartGeometry, BUILDING_DIRT_TEXTURE, configureBuildingDirt, dirtFloorMaterial } from "@/lib/game/building-art/part-geometry"
import { cameraOffset, yawForView } from "@/lib/game/render/iso"

let thumbnails: Promise<Partial<Record<BuildId, string>>> | undefined

/** Bake the actual meshes once, with one short-lived WebGL context for the tray. */
async function buildThumbnails() {
  const load = async (url: string, fallbackColor: number[]) => configureBuildingDirt(await new THREE.TextureLoader().loadAsync(url).catch(() => {
    const fallback = new THREE.DataTexture(new Uint8Array(fallbackColor), 1, 1)
    fallback.needsUpdate = true
    return fallback
  }))
  const [dirt, grass] = await Promise.all([load(BUILDING_DIRT_TEXTURE, [164,147,114,255]), load("/textures/grass.png", [148,161,88,255])])
  const images: Partial<Record<BuildId, string>> = {}
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false })
  renderer.setSize(54, 49)
  renderer.setClearColor(0, 0)
  const yaw = yawForView(0)
  try {
    for (const definition of BUILD_CATALOG) {
      const scene = new THREE.Scene(), model = new THREE.Group()
      const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = []
      for (const part of batchDetails(structureParts({ ...definition, buildType: definition.id }))) {
        const geometry = buildingPartGeometry(part)
        const material = part.surface === "trail" ? dirtFloorMaterial(part, dirt, grass)
          : new THREE.MeshLambertMaterial({ color: part.color, side: THREE.DoubleSide })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(...part.position)
        if (part.rotation) mesh.rotation.set(...part.rotation)
        model.add(mesh)
        geometries.push(geometry); materials.push(material)
        if (part.outline !== false && !/^(reed-|thatch-grain-|thatch-highlight-)/.test(part.name)) {
          const edges = new THREE.EdgesGeometry(geometry, 25)
          const ink = new THREE.LineBasicMaterial({ color: BUILDING_STYLE.palette.ink, transparent: true, opacity: 0.65 })
          mesh.add(new THREE.LineSegments(edges, ink))
          geometries.push(edges); materials.push(ink)
        }
      }
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400)
      camera.position.set(...cameraOffset(yaw))
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld()
      model.updateMatrixWorld(true)
      // Frame projected bounds, including thatch, raised legs and gable crosses.
      const bounds = new THREE.Box3().setFromObject(model).applyMatrix4(camera.matrixWorldInverse)
      const centre = bounds.getCenter(new THREE.Vector3())
      const size = bounds.getSize(new THREE.Vector3())
      const halfHeight = Math.max(size.y, size.x * 49 / 54) * 0.56
      camera.left = centre.x - halfHeight * 54 / 49
      camera.right = centre.x + halfHeight * 54 / 49
      camera.top = centre.y + halfHeight
      camera.bottom = centre.y - halfHeight
      camera.updateProjectionMatrix()
      scene.add(model)
      addSurfaceLighting(scene, yaw)
      try {
        renderer.render(scene, camera)
        images[definition.id] = renderer.domElement.toDataURL()
      } finally {
        geometries.forEach((geometry) => geometry.dispose())
        materials.forEach((material) => material.dispose())
      }
    }
    return images
  } finally {
    dirt.dispose()
    grass.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}

export function BuildThumbnail({ id }: { id: BuildId }) {
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    let active = true
    thumbnails ??= buildThumbnails()
    void thumbnails.then(images => { if (active) setSrc(images[id]) }).catch(() => { thumbnails = undefined })
    return () => { active = false }
  }, [id])
  return src ? <Image src={src} unoptimized alt="" width={54} height={49} /> : null
}
