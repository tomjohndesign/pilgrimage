"use client"

import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { prioritizePeople, SELECTION_OUTLINE_COLOR, SELECTION_OUTLINE_OPACITY } from "@/lib/game/selection"
import { useCameraStore } from "@/lib/game/camera-store"
import { BASE_CHARACTER_SCALE } from "@/lib/game/base-person/gait"
import { walkingSurface } from "@/lib/game/map/walking-surface"
import type { GameMap } from "@/lib/game/map/types"
import { simRegistry } from "@/lib/game/sim"
import { monkPositionRegistry } from "@/lib/game/monks"
import { wildlifeRegistry } from "@/lib/game/wildlife/registry"
import { isBird, WILDLIFE_PROFILES } from "@/lib/game/wildlife/species"
import { animalProfile, RIG_TO_WORLD } from "@/lib/game/transport/assets"
import type { TreePlacement } from "@/lib/game/trees/placement"
import { SELECTED_CHARACTER_LAYER } from "@/lib/game/render/outline"
import type { FigureClickHandler } from "./traveler-figure"

/**
 * Clicks pick the person under the pointer before the scenery in front of them,
 * so a walker stays reachable through the crowns and walls that hide them.
 * Mounted once per scene; every monk and traveler group marks itself with
 * `markPerson`.
 */
export function PersonPicking() {
  const setEvents = useThree((s) => s.setEvents)
  useEffect(() => {
    setEvents({ filter: prioritizePeople })
    return () => setEvents({ filter: undefined })
  }, [setEvents])
  return null
}

/** A generous click volume shared by monks and travelers, without visible geometry. */
export function CharacterHitTarget({ onClick }: { onClick: FigureClickHandler }) {
  return <mesh name="character-hit-target" position={[0, 0.4, 0]} onClick={onClick}>
    <boxGeometry args={[0.8, 1, 0.8]} />
    <meshBasicMaterial visible={false} />
  </mesh>
}

/** Ground markers share the scenery pixel grid and follow the road/deck surface.
 * Keep this outside PixelCharacters so it stays beneath the actual feet. */
export function GroundSelection({ map, trees, characterScale }: { map: GameMap; trees: readonly TreePlacement[]; characterScale: number }) {
  const root = useRef<THREE.Group>(null)
  const rings = useMemo(() => {
    const shape = new THREE.RingGeometry(.1, .5, 64).rotateX(-Math.PI / 2)
    const coordinates = new Float32Array(shape.getAttribute("position").array)
    // Derivatives measure the current render target's pixels. The world pass
    // therefore draws the same one-texel line used by selection outlines,
    // independent of marker radius, camera angle, zoom, or character scale.
    const primary = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(SELECTION_OUTLINE_COLOR) }, opacity: { value: SELECTION_OUTLINE_OPACITY } },
      vertexShader: `varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float opacity; varying vec2 vUv;
        void main() {
          float radius = length(vUv - 0.5);
          float pixel = length(vec2(dFdx(radius), dFdy(radius)));
          if (abs(radius - 0.43) > pixel * 0.5) discard;
          gl_FragColor = vec4(color, opacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    })
    const companion = primary.clone(); companion.uniforms.opacity.value = .3
    // Up to twenty companions and their two pack animals.
    const entries = Array.from({ length: 22 }, () => {
      const mesh = new THREE.Mesh(shape.clone(), companion)
      mesh.name = "selection-ground-ring"; mesh.visible = false; mesh.renderOrder = 3
      mesh.raycast = () => {}
      return { mesh, x: NaN, z: NaN, scale: NaN, map: null as GameMap | null }
    })
    shape.dispose()
    return { entries, coordinates, primary, companion }
  }, [])
  useEffect(() => () => {
    for (const { mesh } of rings.entries) mesh.geometry.dispose()
    rings.primary.dispose(); rings.companion.dispose()
  }, [rings])
  useFrame(() => {
    if (!root.current) return
    const selection = useCameraStore.getState().selection
    const sim = simRegistry.current
    const markers: Array<{ x: number; z: number; scale: number; id: number; kind: string; primary: boolean }> = []
    const scale = characterScale / BASE_CHARACTER_SCALE
    if (selection?.kind === "traveler") {
      const selected = sim?.travelers.get(selection.id)
      if (selected) {
        const party = selected.partyId === undefined ? undefined : sim?.parties.get(selected.partyId)
        for (const id of party?.members ?? [selected.id]) {
          const person = sim?.travelers.get(id)
          if (person) markers.push({ x: person.x, z: person.z, scale, id, kind: "traveler", primary: id === selected.id })
        }
        for (const pack of party?.packs ?? []) {
          const radius = (animalProfile(pack.kind).legZ + .2) * RIG_TO_WORLD * characterScale
          markers.push({ x: pack.pose.hitch.x, z: pack.pose.hitch.z, scale: radius / .43,
            id: pack.handler, kind: "traveler", primary: pack.handler === selected.id })
        }
      }
    } else if (selection?.kind === "monk") {
      const monk = monkPositionRegistry.current?.get(selection.id)
      if (monk) markers.push({ ...monk, scale, id: selection.id, kind: "monk", primary: true })
    } else if (selection?.kind === "animal") {
      const animal = wildlifeRegistry.current?.animals[selection.id]
      if (animal && !animal.reserve && !animal.concealed && animal.burrowState !== "inside") {
        const radius = isBird(animal.kind) ? .24 * scale
          : Math.max(.2 * scale, (WILDLIFE_PROFILES[animal.kind].legZ + .2) * RIG_TO_WORLD * characterScale)
        markers.push({ x: animal.x, z: animal.z, scale: radius / .43, id: animal.id, kind: "animal", primary: true })
      }
    } else if (selection?.kind === "tree") {
      const tree = trees[selection.id]
      if (tree) markers.push({ x: tree.x, z: tree.z, scale: Math.max(.43, (tree.footprint ?? .5) * (tree.scale ?? 1)) / .43,
        id: selection.id, kind: "tree", primary: true })
    }
    root.current.visible = markers.length > 0
    rings.entries.forEach((entry, i) => {
      const person = markers[i], mesh = entry.mesh
      mesh.visible = !!person
      if (!person) return
      const scale = person.scale
      mesh.material = person.primary ? rings.primary : rings.companion
      mesh.userData.selection = { kind: person.kind, id: person.id }
      mesh.userData.primary = person.primary
      if (entry.x === person.x && entry.z === person.z && entry.scale === scale && entry.map === map) return
      entry.x = person.x; entry.z = person.z; entry.scale = scale; entry.map = map
      mesh.position.set(person.x, 0, person.z)
      const positions = mesh.geometry.getAttribute("position")
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const x = rings.coordinates[vertex * 3] * scale, z = rings.coordinates[vertex * 3 + 2] * scale
        positions.setXYZ(vertex, x, walkingSurface(map, person.x + x, person.z + z).height + .015, z)
      }
      positions.needsUpdate = true
      mesh.geometry.computeBoundingSphere()
    })
  }, -0.5)
  return <group ref={root} visible={false} name="selection-ground-markers">
    {rings.entries.map(({ mesh }, i) => <primitive key={i} object={mesh} />)}
  </group>
}

/** Include the animated figure and carried items in the selection outline. */
export function CharacterSelectionOutline({ flying = false }: { flying?: boolean }) {
  const anchor = useRef<THREE.Group>(null)
  const scene = useThree((s) => s.scene)
  useLayoutEffect(() => {
    const tagged: Array<{ object: THREE.Object3D; mask: number }> = []
    const include = (object: THREE.Object3D) => {
      tagged.push({ object, mask: object.layers.mask })
      object.layers.enable(SELECTED_CHARACTER_LAYER)
    }
    // Use the actual animated figure, including its cart and carried items.
    // Sprites manage their own layer so selection also works after async loading.
    // The click volume and flat ID copies must never enlarge its silhouette.
    anchor.current?.parent?.traverse((object) => {
      if ((object instanceof THREE.Mesh || object instanceof THREE.Sprite) && object.layers.isEnabled(0) && object.name !== "character-hit-target") include(object)
    })
    scene.traverse((object) => {
      if (object instanceof THREE.Light) include(object)
    })
    return () => {
      for (const { object, mask } of tagged) object.layers.mask = mask
    }
  }, [scene, flying])
  return <group ref={anchor} />
}
