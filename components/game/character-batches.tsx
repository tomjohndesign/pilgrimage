"use client"

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { PixelCharacters, usePixelWorldTexel } from "@/components/pixel-canvas"
import { CharacterBatch, type CharacterBatchEntry } from "@/lib/game/render/character-batch"
import { SELECTED_CHARACTER_LAYER } from "@/lib/game/render/outline"
import { batchSourceRoot, updateBatchSourceVisibility, clearBatchSourceVisibility } from "@/lib/game/render/batch-source-visibility"
import { isWorldVisible } from "@/lib/game/render/visibility"
import { frameProfile } from "@/lib/game/render/frame-profile"

interface AtlasGroup {
  entries: CharacterBatchEntry[]
  batch?: CharacterBatch
}

const Context = createContext<Set<CharacterBatchEntry> | null>(null)
export const characterBatchControl = { enabled: true }
export const useCharacterBatches = () => useContext(Context)

/** Batch ordinary road people inside the existing color/ID/selection renderer.
 * Selected figures and carts with composited drivers retain their individual sprites and picking. */
export function CharacterBatches({ children }: { children: ReactNode }) {
  const scene = useThree(state => state.scene)
  const entries = useMemo(() => new Set<CharacterBatchEntry>(), [])
  const groups = useMemo(() => new Map<string, AtlasGroup>(), [])
  const membership = useMemo(() => new WeakMap<CharacterBatchEntry, {
    color: THREE.Texture["source"]; depth: THREE.Texture["source"]; recolor: boolean; group: AtlasGroup
  }>(), [])
  const candidates = useMemo(() => new Set<THREE.Object3D>(), [])
  const root = useRef<THREE.Group>(null)
  const worldTexel = usePixelWorldTexel()
  const phaseStart = useRef(0)
  useFrame(() => { phaseStart.current = frameProfile.start() }, -2.5)
  useFrame(() => {
    frameProfile.end("figureSetup", phaseStart.current)
    phaseStart.current = frameProfile.start()
  }, -1.5)
  useFrame(({ camera, scene }) => {
    // This interval also contains wildlife's independently reported callback.
    frameProfile.end("animationAndWildlife", phaseStart.current)
    const started = frameProfile.start()
    if (!root.current) return
    for (const group of groups.values()) group.entries.length = 0
    candidates.clear()
    for (const entry of entries) {
      const sprite = entry.sprite, map = sprite.material.map, depth = entry.depth.map.value
      const batched = characterBatchControl.enabled && isWorldVisible(sprite.parent) &&
        !sprite.layers.isEnabled(SELECTED_CHARACTER_LAYER) && !!map && !!depth && entry.ground.value.y > 0
      sprite.visible = entry.ids.visible = !batched
      if (!batched) continue
      candidates.add(batchSourceRoot(sprite))
      let cached = membership.get(entry)
      if (!cached || cached.color !== map!.source || cached.depth !== depth!.source || cached.recolor !== !!entry.complexion) {
        const key = `${map!.source.uuid}:${depth!.source.uuid}:${!!entry.complexion}`
        let group = groups.get(key)
        if (!group) { group = { entries: [] }; groups.set(key, group) }
        cached = { color: map!.source, depth: depth!.source, recolor: !!entry.complexion, group }
        membership.set(entry, cached)
      }
      cached.group.entries.push(entry)
    }
    for (const group of groups.values()) {
      let batch = group.batch
      if (!batch && group.entries.length) {
        batch = group.batch = new CharacterBatch(group.entries[0], worldTexel, root.current.children.length + 1)
        root.current.add(batch.root)
      }
      group.entries.sort((a, b) => a.sprite.renderOrder - b.sprite.renderOrder)
      batch?.write(group.entries, camera, true)
    }
    updateBatchSourceVisibility(scene, candidates)
    frameProfile.end("characterBatches", started)
  }, .5)
  useEffect(() => () => {
    for (const entry of entries) entry.sprite.visible = entry.ids.visible = true
    for (const group of groups.values()) {
      if (group.batch) { root.current?.remove(group.batch.root); group.batch.dispose() }
      group.batch = undefined; group.entries.length = 0
    }
    // Keep group identities for entries cached across React's effect replay.
    candidates.clear(); clearBatchSourceVisibility(scene)
  }, [entries, groups, candidates, scene])
  return <Context.Provider value={entries}>
    {children}
    <PixelCharacters><group ref={root} /></PixelCharacters>
  </Context.Provider>
}
