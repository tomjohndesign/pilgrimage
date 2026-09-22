"use client"

import { buildingSurfaceMaterial } from "@/lib/game/render/building-surface"

import { addSurfaceLighting } from "@/lib/game/render/lighting"

import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"
import { GRASS_TEXTURE_URL } from "@/lib/game/render/ground-surface"
import { BUILD_CATALOG, type BuildDefinition, type BuildId } from "@/lib/game/balance"
import { playerBuildingParts } from "@/lib/game/player-color"
import { structureParts } from "@/lib/game/building-art/structure"
import { batchDetails } from "@/components/building-lab/building-model"
import { BUILDING_STYLE, AVAILABLE_EARLY_BUILDINGS, type EarlyBuildingType } from "@/lib/game/building-art/style"
import { buildingPartGeometry, BUILDING_DIRT_TEXTURE, configureBuildingDirt, dirtFloorMaterial } from "@/lib/game/building-art/part-geometry"
import { cameraOffset, yawForView } from "@/lib/game/render/iso"

type ThumbnailId = BuildId | EarlyBuildingType
const thumbnails = new Map<string, Promise<Partial<Record<ThumbnailId, string>>>>()
const THUMBNAIL_WIDTH = 216, THUMBNAIL_HEIGHT = 196

/** Bake the live game catalogue at a fixed preview resolution, using one short-lived context. */
async function buildThumbnails(catalog: readonly BuildDefinition[], playerColor: string | null) {
  const load = async (url: string, fallbackColor: number[]) => configureBuildingDirt(await new THREE.TextureLoader().loadAsync(url).catch(() => {
    const fallback = new THREE.DataTexture(new Uint8Array(fallbackColor), 1, 1)
    fallback.needsUpdate = true
    return fallback
  }))
  const [dirt, grass] = await Promise.all([load(BUILDING_DIRT_TEXTURE, [164,147,114,255]), load(GRASS_TEXTURE_URL, [148,161,88,255])])
  const images: Partial<Record<ThumbnailId, string>> = {}
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false })
  renderer.setSize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
  renderer.setClearColor(0, 0)
  const yaw = yawForView(0)
  try {
    const definitions = [...catalog, ...AVAILABLE_EARLY_BUILDINGS.filter(preset => !catalog.some(def => def.id === preset.id)).map(preset => ({id:preset.id, w:preset.width, d:preset.depth, height:preset.wallHeight, color:BUILDING_STYLE.palette.plaster, roofColor:BUILDING_STYLE.palette.thatch}))]
    for (const definition of definitions) {
      const scene = new THREE.Scene(), model = new THREE.Group()
      const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = []
      for (const part of batchDetails(playerBuildingParts(structureParts({ ...definition, buildType: definition.id }), playerColor))) {
        const geometry = buildingPartGeometry(part)
        const material = part.surface === "trail" ? dirtFloorMaterial(part, dirt, grass)
          : buildingSurfaceMaterial(undefined, { color: part.color, vertexColors: false })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(...part.position)
        if (part.rotation) mesh.rotation.set(...part.rotation)
        model.add(mesh)
        geometries.push(geometry); materials.push(material)
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

/** Actual model thumbnails shared by the build tray and building browser.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/BX2-0
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/D7K-0
 */
export function BuildThumbnail({ id, scale = 1, catalog = BUILD_CATALOG, playerColor = null }: {
  id: ThumbnailId; scale?: number; catalog?: readonly BuildDefinition[]; playerColor?: string | null
}) {
  const key = useMemo(() => JSON.stringify([catalog, playerColor]), [catalog, playerColor])
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    let active = true
    setSrc(undefined)
    let images = thumbnails.get(key)
    if (!images) {
      // Keep a bounded cache across live tuning presets and player palettes.
      if (thumbnails.size >= 4) thumbnails.delete(thumbnails.keys().next().value!)
      images = buildThumbnails(catalog, playerColor)
      thumbnails.set(key, images)
    }
    void images.then(result => { if (active) setSrc(result[id]) }).catch(() => { thumbnails.delete(key) })
    return () => { active = false }
  }, [id, key, catalog, playerColor])
  return src ? <Image src={src} unoptimized alt="" width={54 * scale} height={49 * scale} style={{ imageRendering:"pixelated" }} /> : null
}
