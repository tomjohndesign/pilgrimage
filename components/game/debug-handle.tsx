"use client"

import { useEffect } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"

import { processionRegistry } from "@/lib/game/relic-procession"
import { useBuildStore } from "@/lib/game/build-store"
import { useCameraStore } from "@/lib/game/camera-store"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import { surfaceHeight } from "@/lib/game/map/bridges"
import type { OutlineMode } from "@/lib/game/render/outline"
import type { Traveler } from "@/lib/game/travelers"
import { simRegistry, stepSim } from "@/lib/game/sim"
import type { MovementTuning } from "@/lib/game/motion"
import { strikeTree } from "@/lib/game/trees/impact"
import type { EntState } from "@/lib/game/trees/ents"

import { outlineFrameRef } from "./outline-pass"

/**
 * Exposes a small handle on `window` so the scene can be driven deterministically
 * from Playwright or the console — set a camera pose, screenshot, compare.
 * (The world seed itself comes from the URL: /play?seed=….)
 * Development only; it is never mounted in a production build.
 */
export function DebugHandle({ map, travelers, speed, movement, speedScales, characterScale }: { map: GameMap; travelers: Traveler[]; speed: number; movement: MovementTuning; speedScales?: ReadonlyMap<number, number>; characterScale?: number }) {
  const { gl, camera, scene } = useThree()

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return

    const handle = {
      map,
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
      renderInfo: () => ({
        programs: gl.info.programs?.length ?? 0,
        spritePrograms: gl.info.programs?.filter((p) => p.cacheKey.includes("traveler-id")).length ?? 0,
        textures: gl.info.memory.textures,
      }),
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
