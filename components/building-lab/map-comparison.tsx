"use client"

import { SURFACE_LIGHT } from "@/lib/game/render/lighting"

import { RelicDisplay, RELIC_TABLE_DISPLAY_HEIGHT } from "@/components/game/relic-display"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import { PixelCanvas as Canvas, PixelCharacters } from "@/components/pixel-canvas"
import { TerrainTiles } from "@/components/game/terrain-tiles"
import { FoliageField } from "@/components/game/foliage-field"
import { DEFAULT_FOLIAGE_ATLAS } from "@/lib/game/trees/foliage/assets"
import { TravelerFigure } from "@/components/game/traveler-figure"
import { BASE_CHARACTER_SCALE } from "@/lib/game/base-person/gait"
import { TRAVELER_TYPES } from "@/lib/game/travelers"
import { TILE_HEIGHT } from "@/lib/game/map/terrain"
import { cameraOffset, yawForView, lightOffsetForYaw } from "@/lib/game/render/iso"
import { buildingPreviewMap } from "@/lib/game/building-art/map-preview"
import { hidePreviewPaper } from "@/lib/game/building-art/preview-alpha"
import { BUILDING_VIEWS, projectionLayout } from "@/lib/game/building-art/projection"
import { buildingDimensions, referencePersonPosition } from "@/lib/game/building-art/dimensions"
import { PERSON_HEIGHT, HOVEL_DOOR_HEIGHT } from "@/lib/game/world-scale"
import type { BuildingRecipe } from "@/lib/game/building-art/style"
import type { Registrations } from "@/lib/game/building-art/registration"
import { BuildingModel } from "./building-model"
import { registeredAtlasPng } from "./image-files"
import styles from "./building-lab.module.css"

export type CaptureMapGuide = () => Promise<File>

function SceneCamera({ recipe, zoom }: { recipe: BuildingRecipe; zoom: number }) {
  const { camera, size, invalidate } = useThree()
  useEffect(() => {
    camera.position.set(...cameraOffset(yawForView(recipe.view)))
    camera.position.y += TILE_HEIGHT + 0.6
    camera.lookAt(0, TILE_HEIGHT + 0.6, 0)
    if (camera instanceof THREE.OrthographicCamera) camera.zoom = Math.min(size.width, size.height) / (Math.max(buildingDimensions(recipe).width, buildingDimensions(recipe).depth) * 1.42 + 5) * zoom
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size, recipe.width, recipe.depth, recipe.view, zoom, invalidate])
  return null
}

/** Capture the actual procedural model on game tiles in all four guide cells. */
function GuideCapture({ recipe, onReady }: { recipe: BuildingRecipe; onReady: (capture: CaptureMapGuide | null) => void }) {
  const { gl, scene, invalidate } = useThree()
  useEffect(() => {
    onReady(async () => {
      const { pixelsPerUnit: scale, anchor } = projectionLayout(recipe)
      const camera = new THREE.OrthographicCamera(-anchor[0] / scale, (1 - anchor[0]) / scale, anchor[1] / scale, -(1 - anchor[1]) / scale, 0.1, 400)
      const target = new THREE.WebGLRenderTarget(1024, 1024)
      target.texture.colorSpace = THREE.SRGBColorSpace
      const atlas = document.createElement("canvas"); atlas.width = 2048; atlas.height = 2048
      const context = atlas.getContext("2d")
      if (!context) { target.dispose(); throw new Error("Could not capture the map guide.") }
      const cell = document.createElement("canvas"); cell.width = 1024; cell.height = 1024
      const cellContext = cell.getContext("2d")!
      const pixels = new Uint8Array(1024 * 1024 * 4)
      const previousTarget = gl.getRenderTarget()
      const sun = scene.getObjectByName("workshop-sun")!
      const oldSun = sun.position.clone()
      // Scenery establishes context on screen; omit it from the building guide.
      const surroundings = scene.getObjectByName("workshop-surroundings")!
      const reference = scene.getObjectByName("workshop-scale-reference")!
      const oldReference = reference.position.clone()
      const wasVisible = surroundings.visible
      surroundings.visible = false
      try {
        for (const view of BUILDING_VIEWS) {
          camera.position.set(...cameraOffset(yawForView(view.id)))
          camera.position.y += TILE_HEIGHT
          camera.lookAt(0, TILE_HEIGHT, 0)
          camera.updateMatrixWorld()
          sun.position.set(...lightOffsetForYaw(yawForView(view.id)))
          reference.position.set(...referencePersonPosition(recipe, view.id)); reference.position.y += TILE_HEIGHT
          gl.setRenderTarget(target); gl.render(scene, camera)
          gl.readRenderTargetPixels(target, 0, 0, 1024, 1024, pixels)
          const frame = cellContext.createImageData(1024, 1024)
          for (let y = 0; y < 1024; y++) frame.data.set(pixels.subarray((1023 - y) * 4096, (1024 - y) * 4096), y * 4096)
          cellContext.putImageData(frame, 0, 0)
          context.drawImage(cell, view.column * 1024, view.row * 1024)
        }
      } finally {
        surroundings.visible = wasVisible; sun.position.copy(oldSun); reference.position.copy(oldReference)
        gl.setRenderTarget(previousTarget); target.dispose(); invalidate()
      }
      const blob = await new Promise<Blob>((resolve, reject) => atlas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not save the map guide.")), "image/png"))
      return new File([blob], "isometric-four-view-map-guide.png", { type: "image/png" })
    })
    return () => onReady(null)
  }, [gl, scene, recipe, onReady, invalidate])
  return null
}

function Footprint({ recipe }: { recipe: BuildingRecipe }) {
  const vertices = useMemo(() => new Float32Array([
    -recipe.width / 2, TILE_HEIGHT + 0.012, -recipe.depth / 2,
    recipe.width / 2, TILE_HEIGHT + 0.012, -recipe.depth / 2,
    recipe.width / 2, TILE_HEIGHT + 0.012, recipe.depth / 2,
    -recipe.width / 2, TILE_HEIGHT + 0.012, recipe.depth / 2,
  ]), [recipe.width, recipe.depth])
  return <lineLoop><bufferGeometry><bufferAttribute attach="attributes-position" args={[vertices, 3]} /></bufferGeometry><lineBasicMaterial color="#ffe3a0" /></lineLoop>
}

function IllustratedBuilding({ image, recipe, view, registrations, onStatus }: {
  image: string; recipe: BuildingRecipe; view: number; registrations: Registrations; onStatus: (message: string) => void
}) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null)
  const { invalidate } = useThree()
  // Register once per atlas; rotating only swaps the displayed cell.
  const atlas = useMemo(() => registeredAtlasPng(image, recipe, registrations, true), [image, recipe, registrations])
  useEffect(() => {
    let cancelled = false, created: THREE.CanvasTexture | undefined
    setTexture(null); onStatus("Placing the illustration…")
    ;(async () => {
      const source = new Image(); source.src = await atlas; await source.decode()
      if (cancelled) return
      const size = source.naturalWidth / 2, cell = BUILDING_VIEWS[view]
      const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size
      const context = canvas.getContext("2d")!
      context.drawImage(source, cell.column * size, cell.row * size, size, size, 0, 0, size, size)
      if (recipe.output === "concept") {
        const pixels = context.getImageData(0, 0, size, size)
        hidePreviewPaper(pixels.data, size, size)
        context.putImageData(pixels, 0, 0)
      }
      created = new THREE.CanvasTexture(canvas)
      created.colorSpace = THREE.SRGBColorSpace
      setTexture(created); onStatus(""); invalidate()
    })().catch(() => { if (!cancelled) onStatus("Could not place this image. Open Art & exports to inspect it.") })
    return () => { cancelled = true; created?.dispose() }
  }, [atlas, recipe.output, view, invalidate, onStatus])
  const layout = projectionLayout(recipe), span = 1 / layout.pixelsPerUnit
  return texture && <sprite position={[0, TILE_HEIGHT, 0]} scale={[span, span, 1]} center={new THREE.Vector2(layout.anchor[0], 1 - layout.anchor[1])} renderOrder={10}>
    <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
  </sprite>
}

function Site({ recipe, grid }: { recipe: BuildingRecipe; grid: boolean }) {
  const map = useMemo(() => buildingPreviewMap(recipe), [recipe.width, recipe.depth, recipe.variant])
  const trees = useMemo(() => [
    { x: -recipe.width / 2 - 3.5, z: -recipe.depth / 2 - 3, y: TILE_HEIGHT, species: "oak" as const, scale: 0.7 },
    { x: recipe.width / 2 + 3, z: -recipe.depth / 2 - 3.5, y: TILE_HEIGHT, species: "birch" as const, scale: 0.8 },
  ], [recipe.width, recipe.depth])
  return <>
    <TerrainTiles map={map} showGrid={grid} traffic={35} relicTraffic={10} />
    <Footprint recipe={recipe} />
    <PixelCharacters><group name="workshop-scale-reference" position={(() => { const p = referencePersonPosition(recipe, recipe.view); return [p[0], p[1] + TILE_HEIGHT, p[2]] })()}>
      <TravelerFigure characterModel="base" characterScale={BASE_CHARACTER_SCALE} type={TRAVELER_TYPES.pilgrim} />
    </group>
    </PixelCharacters><group name="workshop-surroundings">
      <FoliageField atlas={DEFAULT_FOLIAGE_ATLAS} placements={trees} seed={7919} />
      <PixelCharacters><group position={[1.5, TILE_HEIGHT, recipe.depth / 2 + 1.8]}><TravelerFigure characterModel="base" characterScale={BASE_CHARACTER_SCALE} type={TRAVELER_TYPES.pilgrim} /></group>
      <group position={[-3, TILE_HEIGHT, recipe.depth / 2 + 2.5]} rotation={[0, Math.PI / 2, 0]}><TravelerFigure characterModel="base" characterScale={BASE_CHARACTER_SCALE} type={TRAVELER_TYPES.vendor} /></group></PixelCharacters>
    </group>
  </>
}

/** A single view of the same procedural asset used by the live hovel.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0 — Building workshop — procedural (214-0)
 */
export function ProceduralMapScene({ recipe, grid, zoom, cutaway, onGuideReady, embedded = false }: {
  recipe: BuildingRecipe; grid: boolean; zoom: number; cutaway: boolean; embedded?: boolean; onGuideReady?: (capture: CaptureMapGuide | null) => void
}) {
  return <section className={embedded ? "asset-building-scene" : styles.mapPanel} aria-label={`${BUILDING_VIEWS[recipe.view].name} procedural building on game tiles`}>
    {!embedded && <div className={styles.mapLabel}><strong>{BUILDING_VIEWS[recipe.view].name}</strong><span>{recipe.width} × {recipe.depth} tile footprint</span></div>}
    <div className={embedded ? "asset-building-viewport" : styles.mapCanvas}>
      <Canvas frameloop="demand" orthographic camera={{ near: 0.1, far: 400 }} outputDpr={1} fallback={<p>This map preview needs WebGL.</p>}>
        <color attach="background" args={["#14100a"]} />
        <SceneCamera recipe={recipe} zoom={zoom} />
        <ambientLight intensity={SURFACE_LIGHT.ambient} />
        <hemisphereLight args={[SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere]} />
        <directionalLight name="workshop-sun" position={lightOffsetForYaw(yawForView(recipe.view))} intensity={SURFACE_LIGHT.sun} />
        <Suspense fallback={null}>
          <Site recipe={recipe} grid={grid} />
          <group position={[0, TILE_HEIGHT, 0]}><BuildingModel terrainFloors recipe={recipe} cutaway={cutaway} />{recipe.variant === "enclosure" && <RelicDisplay height={RELIC_TABLE_DISPLAY_HEIGHT} />}</group>
          {onGuideReady && <GuideCapture recipe={recipe} onReady={onGuideReady} />}
        </Suspense>
      </Canvas>
      {embedded && <span className="person-stage-caption">{BUILDING_VIEWS[recipe.view].name} · {recipe.width} × {recipe.depth} tiles</span>}
    </div>
  </section>
}

/** Matched map scenes, sharing game terrain, camera, tile scale and surroundings.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0 — Building workshop — map comparison (1XY-0)
 */
export function MapComparison({ recipe, imageRecipe, image, registrations, label, grid, zoom, onGuideReady }: {
  recipe: BuildingRecipe; imageRecipe: BuildingRecipe; image: string; registrations: Registrations; label: string; grid: boolean; zoom: number; onGuideReady: (capture: CaptureMapGuide | null) => void
}) {
  const [status, setStatus] = useState("")
  return <div className={styles.comparison}>
    {(["procedural", "illustrated"] as const).map(kind => <section className={styles.mapPanel} key={kind} aria-label={`${kind} building on game tiles`}>
      <div className={styles.mapLabel}><strong>{kind === "procedural" ? "Procedural" : "Illustrated"}</strong><span>{kind === "procedural" ? `Live · ${recipe.width} × ${recipe.depth} plot` : `${label} · ${imageRecipe.width} × ${imageRecipe.depth} plot`}</span><span>Door target {(HOVEL_DOOR_HEIGHT / PERSON_HEIGHT).toFixed(2)}× person · {kind === "procedural" ? buildingDimensions(recipe).width : buildingDimensions(imageRecipe).width} × {kind === "procedural" ? buildingDimensions(recipe).depth : buildingDimensions(imageRecipe).depth} building</span></div>
      <div className={styles.mapCanvas}>
        <Canvas frameloop="demand" orthographic camera={{ near: 0.1, far: 400 }} outputDpr={1} fallback={<p>This map preview needs WebGL. Art & exports is still available.</p>}>
          <color attach="background" args={["#14100a"]} />
          <SceneCamera recipe={recipe} zoom={zoom} />
          <ambientLight intensity={SURFACE_LIGHT.ambient} />
          <hemisphereLight args={[SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere]} />
          <directionalLight name="workshop-sun" position={lightOffsetForYaw(yawForView(recipe.view))} intensity={SURFACE_LIGHT.sun} />
          <Suspense fallback={null}>
            <Site recipe={recipe} grid={grid} />
            {kind === "procedural" ? <><group position={[0, TILE_HEIGHT, 0]}><BuildingModel terrainFloors recipe={recipe} />{recipe.variant === "enclosure" && <RelicDisplay height={RELIC_TABLE_DISPLAY_HEIGHT} />}</group><GuideCapture recipe={recipe} onReady={onGuideReady} /></> : <IllustratedBuilding image={image} recipe={imageRecipe} view={recipe.view} registrations={registrations} onStatus={setStatus} />}
          </Suspense>
        </Canvas>
        {kind === "illustrated" && status && <p className={styles.mapStatus}>{status}</p>}
      </div>
    </section>)}
  </div>
}
