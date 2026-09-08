"use client"

import { useEffect } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"

import { benchmarkCity, cityBenchmarkStats } from "@/lib/game/city-benchmark"
import { processionRegistry } from "@/lib/game/relic-procession"
import { useBuildStore } from "@/lib/game/build-store"
import { useCameraStore } from "@/lib/game/camera-store"
import { placeEnvironment } from "@/lib/game/environment/placement"
import { cliffCorner } from "@/lib/game/map/cliff-corners"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import { surfaceHeight } from "@/lib/game/map/bridges"
import { SELECTED_CHARACTER_LAYER, type OutlineMode } from "@/lib/game/render/outline"
import type { Traveler } from "@/lib/game/travelers"
import { simRegistry, stepSim } from "@/lib/game/sim"
import type { MovementTuning } from "@/lib/game/motion"
import { strikeTree } from "@/lib/game/trees/impact"
import type { EntState } from "@/lib/game/trees/ents"
import { treeResource, STUMP_LIFETIME_DAYS } from "@/lib/game/trees/timber"

import { characterOcclusionRequest, type CharacterOcclusionSample } from "@/lib/game/render/character-occlusion"
import { buildingBatchControl } from "./building-batches"
import { characterBatchControl } from "./character-batches"
import { staticBatchControl } from "./static-batches"
import { outlineFrameRef } from "./outline-pass"
import { frameProfile } from "@/lib/game/render/frame-profile"
import { sceneryDetailStatus } from "@/lib/game/render/scenery-detail"
import { batchedSourceRoots } from "@/lib/game/render/batch-source-visibility"
import { BENCHMARK_SIMULATION_SPEEDS, useSimulationStore } from "@/lib/game/simulation-store"

/**
 * Exposes a small handle on `window` so the scene can be driven deterministically
 * from Playwright or the console — set a camera pose, screenshot, compare.
 * (The world seed itself comes from the URL: /play?seed=….)
 * Development only, unless a local benchmark build explicitly enables it.
 */
export function DebugHandle({ map, travelers, speed, movement, speedScales, characterScale }: { map: GameMap; travelers: Traveler[]; speed: number; movement: MovementTuning; speedScales?: ReadonlyMap<number, number>; characterScale?: number }) {
  const { gl, camera, scene } = useThree()

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_GAME_BENCHMARK !== "1") return

    let motionSubjects: Array<{ unit: THREE.Object3D; sprite: THREE.Sprite }> = []
    const handle = {
      map,
      benchmarkTarget: benchmarkCity(map)?.centre,
      cityStats: () => cityBenchmarkStats(simRegistry.current, map),
      inventory: () => {
        let scenerySprites = 0
        scene.traverse(object => {
          if (object instanceof THREE.InstancedMesh && object.layers.isEnabled(0)
            && object.parent?.parent?.name === "environment-sprites") scenerySprites += object.count
        })
        const images = [...new Set(performance.getEntriesByType("resource").map(entry => new URL(entry.name).pathname)
          .filter(path => /\/textures\/.*\.(png|webp|jpg)$/.test(path)))]
        return { characters: simRegistry.current?.travelers.size ?? 0, buildings: map.buildings.length,
          cityBuildings: benchmarkCity(map)?.buildings, scenerySprites, images: images.length, imagePaths: images }
      },
      motionSamples: () => {
        if (!motionSubjects.length) scene.traverseVisible(unit => {
          if (unit.name !== "traveler-unit" || motionSubjects.length >= 32) return
          const sprite = unit.getObjectByName("traveler")
          if (sprite instanceof THREE.Sprite) motionSubjects.push({ unit, sprite })
        })
        return motionSubjects.filter(({ unit }) => unit.visible).map(({ unit, sprite }) => {
          const state = simRegistry.current?.travelers.get(unit.userData.travelerId)
          return { id: unit.userData.travelerId, x: state?.x, z: state?.z, activity: state?.activity,
            moving: unit.userData.moving, spriteX: sprite.matrixWorld.elements[12], spriteZ: sprite.matrixWorld.elements[14],
            phase: sprite.userData.walkPhase, clip: sprite.userData.clip, distance: unit.userData.distance,
            poseDetail: sprite.userData.walkDetail, displayedFrame: sprite.userData.displayedFrame }
        })
      },
      characterOcclusion: () => new Promise<CharacterOcclusionSample>(resolve => {
        if (characterOcclusionRequest.current) throw new Error("Occlusion sample already pending")
        characterOcclusionRequest.current = resolve
      }),
      distantEffects: () => {
        const counts = { smoke: 0, fires: 0, pointLights: 0, floaters: 0, cutaways: 0 }
        scene.traverseVisible(object => {
          if (object.name === "building-smoke") counts.smoke++
          if (object.name === "hearth-fire") counts.fires++
          if (object instanceof THREE.PointLight) counts.pointLights++
          if (["admission-effects", "piety-effects", "construction-cost-effects"].includes(object.name)) counts.floaters++
          if (object.userData.cutaway) counts.cutaways++
        })
        return counts
      },
      profileFrames: frameProfile.capture,
      setBuildingBatching: (enabled: boolean) => { buildingBatchControl.enabled = enabled },
      setBatching: (enabled: boolean) => { characterBatchControl.enabled = enabled },
      setSceneryBatching: (enabled: boolean) => { staticBatchControl.enabled = enabled },
      setPaused: (paused: boolean) => useSimulationStore.setState({ paused }),
      setSpeed: (label: number) => {
        const speed = BENCHMARK_SIMULATION_SPEEDS.find(speed => speed.label === label)
        if (!speed) throw new Error(`Unknown playback speed: ${label}`)
        useSimulationStore.setState({ speed: speed.rate })
      },
      playback: () => useSimulationStore.getState(),
      selectTraveler: (id: number) => useCameraStore.getState().select({ kind: "traveler", id }),
      selectionVisuals: () => {
        let shadows = 0, sprites = 0, reducedWalking = 0
        scene.traverseVisible(object => {
          if (object.name === "character-selection-shadow") shadows++
          if (object instanceof THREE.Sprite && object.layers.isEnabled(SELECTED_CHARACTER_LAYER)) {
            sprites++
            if (object.userData.walkDetail > 0) reducedWalking++
          }
        })
        return { shadows, sprites, reducedWalking }
      },
      cameraAlignment: () => {
        let error = 0
        scene.traverseVisible(object => {
          const view = object.name === "character-atlas-batch" ? object.userData.viewMatrix as THREE.Matrix4 : undefined
          if (view) for (let i = 0; i < 16; i++) error = Math.max(error, Math.abs(view.elements[i] - camera.matrixWorldInverse.elements[i]))
        })
        return error
      },
      sceneStats: () => {
        let objects = 0, visible = 0, sprites = 0, units = 0
        const loaded = new Set<THREE.Object3D>()
        scene.traverse(object => {
          objects++
          if (object.name === "traveler-unit") units++
          if (object instanceof THREE.Sprite) for (let node = object.parent; node; node = node.parent) {
            if (node.name === "traveler-unit") { loaded.add(node); break }
          }
        })
        scene.traverseVisible(object => { visible++; if (object instanceof THREE.Sprite) sprites++ })
        const figures = scene.getObjectByName("travelers")?.userData
        const foliage = scene.getObjectByName("foliage-prototype")?.children[0] as THREE.InstancedMesh | undefined
        return { objects, visible, sprites, units, prunedCharacterRoots: [...batchedSourceRoots(scene)].length, treeRenderer: foliage ? "sprites" : "procedural",
          totalTrees: foliage?.userData.totalTrees, visibleTrees: foliage?.count, loadedUnits: loaded.size, requestedUnits: figures?.requestedUnits,
          pendingUnits: figures?.pendingUnits, missingVisibleUnits: figures?.missingVisibleUnits }
      },
      sceneryDetail: () => scene.getObjectByName("scenery-batches")?.userData.sceneryDetail,
      sceneryDetailStatus: () => ({ ...sceneryDetailStatus(scene), presentationFade: scene.userData.sceneryFadeActive === true }),
      /** Inspect scenery footprints and focus the camera on rarer outcrops. */
      environment: () => placeEnvironment(map),
      cliffCorners: () => map.tiles.flatMap((_, i) => {
        const x = i % map.width, z = Math.floor(i / map.width), cut = cliffCorner(map, x, z)
        return cut ? [{ ...cut, x: tileToWorldX(map, x), z: tileToWorldZ(map, z), water: map.tiles[cut.donor] === "water" }] : []
      }),
      camera: () => useCameraStore.getState(),
      /** Jump straight to a pose. The rig still tweens toward it over a few frames. */
      setView: (viewIndex: number) =>
        useCameraStore.setState({ viewIndex: Math.round(viewIndex) }),
      setTarget: (x: number, z: number) => useCameraStore.setState({ targetX: x, targetZ: z }),
      setZoom: (viewSize: number) => useCameraStore.setState({ viewSize }),
      setOutline: (mode: OutlineMode) => useCameraStore.setState({ outlineMode: mode }),
      reset: () => useCameraStore.getState().reset(),
      /** Live traveler sim state (stats, activities), for e2e assertions. */
      sim: () => (simRegistry.current ? [...simRegistry.current.travelers.values()] : []),
      time: () => simRegistry.current?.time ?? null,
      constructionBars: () => {
        const bars: Array<{ visible: boolean }> = []
        scene.traverse(object => { if (object.name === "construction-progress") bars.push({ visible: object.visible }) })
        return bars
      },
      constructionCosts: () => scene.getObjectByName("construction-cost-effects")?.children.flatMap(object =>
        object instanceof THREE.Sprite && object.visible ? [{ resource: object.userData.resource, amount: object.userData.amount,
          position: object.position.toArray(), opacity: object.material.opacity }] : []) ?? [],
      /** Donation receipts and their live floating amounts for payment smoke tests. */
      payments: () => ({
        receipts: simRegistry.current?.admissionPayments ?? [],
        effects: scene.getObjectByName("admission-effects")?.children.flatMap(object =>
          object instanceof THREE.Sprite && object.visible
            ? [{ amount: object.userData.amount, position: object.position.toArray(), opacity: object.material.opacity }] : []) ?? [],
      }),
      piety: () => ({
        blessings: processionRegistry.current?.blessings ?? [],
        effects: scene.getObjectByName("piety-effects")?.children.flatMap(object =>
          object instanceof THREE.Sprite && object.visible
            ? [{ amount: object.userData.amount, position: object.position.toArray(), opacity: object.material.opacity }] : []) ?? [],
      }),
      setTerrainVisible: (visible: boolean) => { const terrain = scene.getObjectByName("terrain"); if (terrain) terrain.visible = visible },
      setHearthLightsVisible: (visible: boolean) => { const lights = scene.getObjectByName("hearth-light-pool"); if (lights) lights.visible = visible },
      renderInfo: () => ({
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        programs: gl.info.programs?.length ?? 0,
        spritePrograms: gl.info.programs?.filter((p) => p.cacheKey.includes("traveler-id")).length ?? 0,
        textures: gl.info.memory.textures,
      }),
      /** Visible geometry by kind, including each instance and both ID/color meshes. */
      geometryStats: () => {
        const totals = new Map<string, { meshes: number; triangles: number }>()
        const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
        scene.traverseVisible(object => {
          if (!(object instanceof THREE.Mesh) || (object.frustumCulled && !frustum.intersectsObject(object))) return
          const key = object.name || object.geometry.name || object.geometry.type, total = totals.get(key) ?? { meshes: 0, triangles: 0 }
          total.meshes++
          total.triangles += Math.min(object.geometry.drawRange.count, object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3 * (object instanceof THREE.InstancedMesh ? object.count : 1)
          totals.set(key, total)
        })
        return Object.fromEntries([...totals].sort(([, a], [, b]) => b.triangles - a.triangles))
      },
      /** Sprite layout and active clip for comparing road character models. */
      travelerSprites: () => {
        const sprites: Array<{ model: string; calling: string; variant: number | null; bodyType: string; appearanceScale: number; position: number[]; phase: number; sync: boolean; fps: number; sheet: string; repeat: number[]; offset: number[]; center: number[]; scale: number[] }> = []
        scene.traverse((object) => {
          if (object.name !== "traveler" || !(object instanceof THREE.Sprite)) return
          const map = object.material.map
          const image = map?.image as HTMLImageElement | undefined
          sprites.push({ model: object.userData.characterModel, calling: object.userData.calling, variant: object.userData.variant, bodyType: object.userData.bodyType, appearanceScale: object.userData.appearanceScale, position: object.getWorldPosition(new THREE.Vector3()).toArray(), phase: object.userData.walkPhase, sync: object.userData.sync, fps: object.userData.fps, sheet: image?.src ?? "",
            repeat: map?.repeat.toArray() ?? [], offset: map?.offset.toArray() ?? [], center: object.center.toArray(), scale: object.scale.toArray() })
        })
        return sprites
      },
      roadsideSignals: () => {
        const signals: Array<{ activity: string; visible: boolean; marks: number; positions: number[][] }> = []
        scene.traverse(object => {
          if (object.name !== "roadside-signals") return
          let visible = object.visible
          object.traverseAncestors(parent => { visible &&= parent.visible })
          signals.push({ activity: object.parent?.parent?.userData.activity, visible,
            marks: object.children.filter(child => child.visible).length,
            positions: object.children.map(child => child.position.toArray()) })
        })
        return signals
      },
      burrows: () => scene.getObjectByName("wildlife")?.userData.burrows ?? [],
      wildlife: () => scene.getObjectByName("wildlife")?.userData.animals ?? [],
      transportSprites: () => {
        const sprites: Array<{ kind: string; bridgeGuided: boolean; position: number[]; sheet: string; columns: number; rows: number; visible: boolean; heading: number; grazing: boolean; reversing: boolean; phase: number }> = []
        scene.traverse(object => {
          if (!(object instanceof THREE.Sprite) || !["cart", "horse", "donkey", "merchant"].includes(object.name)) return
          const map = object.material.map, data = object.parent?.parent?.userData
          let visible = true; object.traverseAncestors(parent => { visible &&= parent.visible })
          sprites.push({ kind: object.name, bridgeGuided: data?.bridgeGuided === true, position: object.getWorldPosition(new THREE.Vector3()).toArray(), sheet: (map?.image as HTMLImageElement)?.src ?? "",
            columns: 1 / (map?.repeat.x ?? 1), rows: 1 / (map?.repeat.y ?? 1), visible,
            heading: data?.heading ?? 0, grazing: data?.grazing === true, reversing: object.userData.reversing === true, phase: object.userData.walkPhase ?? 0 })
        })
        return sprites
      },
      travelerShadows: () => {
        const shadows: Array<{ visible: boolean; offset: number[]; depthWrite: boolean }> = []
        scene.traverse(object => {
          if (object.name === "traveler-shadow" && object instanceof THREE.Sprite) shadows.push({ visible: object.visible, offset: object.material.map?.offset.toArray() ?? [], depthWrite: object.material.depthWrite })
        })
        return shadows
      },
      setShadowsVisible: (visible: boolean) => scene.traverse(object => { if (object.name === "traveler-shadow") object.visible = visible }),
      /** Live Ent state for checking staggered walks and replanting. */
      ents: () => {
        const ents: EntState[] = []
        scene.traverse((object) => {
          if (object.name === "ent-legs") ents.push(...object.userData.ents)
        })
        return ents
      },
      /** Monk positions and equipped boosters, for cheat-code smoke tests. */
      monks: () => {
        const points: Array<{ x: number; y: number; z: number; flying: boolean; equipped: boolean; activity: string; clip: string; phase: number; columns: number; offset: number[] }> = []
        const position = new THREE.Vector3()
        scene.traverse((object) => {
          if (object.name !== "monk") return
          object.getWorldPosition(position)
          points.push({
            x: position.x, y: position.y, z: position.z,
            flying: object.parent?.parent?.userData.activity === "flying",
            equipped: object.parent?.parent?.userData.rocketPack === true,
            activity: object.parent?.parent?.userData.activity,
            phase: object.userData.walkPhase,
            columns: object instanceof THREE.Sprite ? 1 / (object.material.map?.repeat.x ?? 1) : 1,
            clip: object.userData.clip,
            offset: object instanceof THREE.Sprite ? object.material.map?.offset.toArray() ?? [] : [],
          })
        })
        return points
      },
      /** Advance bounded simulation ticks without waiting for the WebGL frame rate. */
      advance: (seconds: number) => {
        const sim = simRegistry.current
        if (!sim) return
        const ticks = Math.ceil(Math.max(0, Math.min(120, seconds)) * 10)
        for (let i = 0; i < ticks; i++) stepSim(sim, travelers, map, speed, 0.1, movement, speedScales, characterScale)
        useBuildStore.getState().syncResources(sim, travelers)
      },
      /** Live settlement loop: who works where, who lives where, and the takings. */
      travelers: () => [...(simRegistry.current?.travelers.values() ?? [])].map(s => ({
        id: s.id, activity: s.activity, employer: s.employer, home: s.home, jobSlot: s.jobSlot,
        gold: s.gold, hunger: Math.round(s.hunger), thirst: Math.round(s.thirst), stamina: Math.round(s.stamina),
      })),
      takings: () => ({ shrineGold: simRegistry.current?.shrineGold ?? 0, tradeGold: simRegistry.current?.tradeGold ?? 0 }),
      settlement: () => ({
        buildings: map.buildings,
        felled: [...useBuildStore.getState().felled],
        trees: simRegistry.current ? [...simRegistry.current.treeResources.entries()] : [],
        piles: useBuildStore.getState().piles,
        wood: simRegistry.current?.wood ?? 0,
        visits: simRegistry.current?.visits ?? 0,
      }),
      treePlacements: () => simRegistry.current?.trees ?? [],
      /** Complete a felling for visual checks of remains and disappearing canopy shade. */
      fellTree: (index: number) => {
        const sim = simRegistry.current, tree = sim?.trees?.[index]
        if (!sim || !tree || sim.felled.has(index)) return
        const resource = sim.treeResources.get(index) ?? treeResource(tree, index, sim.seed)
        resource.health = 0
        resource.felledAt = sim.time
        resource.stumpUntil = sim.time + STUMP_LIFETIME_DAYS
        sim.treeResources.set(index, resource)
        sim.felled.add(index)
        sim.resourceRevision++
        useBuildStore.getState().syncResources(sim, travelers)
      },
      strikeTree: (index: number) => {
        const tree = simRegistry.current?.trees?.[index]
        if (tree) strikeTree(tree, 0)
      },
      /** Exact relic position and pulse values for scene/selection smoke tests. */
      procession: () => processionRegistry.current,
      relic: () => {
        let object: THREE.Object3D | undefined
        scene.traverseVisible(candidate => { if (candidate.name === "relic") object = candidate })
        if (!(object instanceof THREE.Mesh)) return null
        const world = object.getWorldPosition(new THREE.Vector3())
        const point = world.clone().project(camera), rect = gl.domElement.getBoundingClientRect()
        const light = object.parent?.parent?.getObjectByName("relic-light")
        return {
          world: world.toArray(), x: rect.left + (point.x + 1) / 2 * rect.width, y: rect.top + (1 - point.y) / 2 * rect.height,
          emissiveIntensity: (object.material as THREE.MeshStandardMaterial).emissiveIntensity,
          lightIntensity: light instanceof THREE.PointLight ? light.intensity : null,
        }
      },
      worldScreenPoint: (x: number, y: number, z: number) => {
        const rect = gl.domElement.getBoundingClientRect()
        const point = new THREE.Vector3(x, y, z).project(camera)
        return { x: rect.left + (point.x + 1) / 2 * rect.width, y: rect.top + (1 - point.y) / 2 * rect.height }
      },
      tileScreenPoint: (x: number, z: number) => {
        const rect = gl.domElement.getBoundingClientRect()
        const point = new THREE.Vector3(tileToWorldX(map, x), surfaceHeight(map, x, z), tileToWorldZ(map, z)).project(camera)
        return { x: rect.left + (point.x + 1) / 2 * rect.width, y: rect.top + (1 - point.y) / 2 * rect.height }
      },
      /** Screen positions (client px) of traveler sprites, for e2e clicks. */
      travelerScreenPoints: () => {
        const rect = gl.domElement.getBoundingClientRect()
        const v = new THREE.Vector3()
        const points: Array<{ x: number; y: number }> = []
        scene.traverse((object) => {
          if (object.name !== "traveler") return
          object.getWorldPosition(v)
          v.y += 0.25
          v.project(camera)
          points.push({
            x: rect.left + ((v.x + 1) / 2) * rect.width,
            y: rect.top + ((1 - v.y) / 2) * rect.height,
          })
        })
        return points
      },
      /**
       * Data URL of the current frame. Renders first so the drawing buffer is
       * populated — without that, reading it back returns a blank image unless
       * the context was created with `preserveDrawingBuffer`.
       */
      screenshot: () => {
        // Prefer the outline pass's frame render so screenshots match the screen.
        if (outlineFrameRef.current) outlineFrameRef.current()
        else gl.render(scene, camera)
        return gl.domElement.toDataURL("image/png")
      },
    }

    ;(window as unknown as Record<string, unknown>).__pilgrimage = handle
    return () => {
      delete (window as unknown as Record<string, unknown>).__pilgrimage
    }
  }, [gl, camera, scene, map, travelers, speed, movement, speedScales, characterScale])

  return null
}
