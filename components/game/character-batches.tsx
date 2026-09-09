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
import { SpriteFrames } from "./sprite-frames"
import { benchmarkWork } from "@/lib/game/benchmark-work"
import { frameQuality } from "@/lib/game/render/frame-quality"

interface AtlasGroup {
  entries: CharacterBatchEntry[]
  batch?: CharacterBatch
}

class CharacterEntries extends Set<CharacterBatchEntry> {
  readonly legacy = new Set<CharacterBatchEntry>()
  constructor(readonly publish: (entry: CharacterBatchEntry, batched?: boolean) => void) { super() }
  override add(entry: CharacterBatchEntry) {
    super.add(entry)
    if (!entry.publishesPose) this.legacy.add(entry)
    return this
  }
  override delete(entry: CharacterBatchEntry) { this.legacy.delete(entry); return super.delete(entry) }
}

const Context = createContext<CharacterEntries | null>(null)
export const characterBatchControl = { enabled: true }
export const useCharacterBatches = () => useContext(Context)

/** Batch ordinary road people inside the existing color/ID/selection renderer.
 * Selected figures and carts with composited drivers retain their individual sprites and picking. */
export function CharacterBatches({ children }: { children: ReactNode }) {
  const scene = useThree(state => state.scene)
  const groups = useMemo(() => new Map<string, AtlasGroup>(), [])
  const membership = useMemo(() => new WeakMap<CharacterBatchEntry, {
    color: THREE.Texture["source"]; depth: THREE.Texture["source"]; recolor: boolean; group: AtlasGroup
  }>(), [])
  const candidates = useMemo(() => new Set<THREE.Object3D>(), [])
  const entries = useMemo(() => new CharacterEntries((entry, knownBatched) => {
    const sprite = entry.sprite, map = entry.color ?? sprite.material.map, depth = entry.depth.map.value
    const batched = knownBatched ?? (characterBatchControl.enabled && isWorldVisible(sprite.parent) &&
      !sprite.layers.isEnabled(SELECTED_CHARACTER_LAYER) && !!map && !!depth && entry.ground.value.y > 0)
    sprite.visible = entry.ids.visible = !batched
    if (!batched) return
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
  }), [groups, membership, candidates])
  const root = useRef<THREE.Group>(null)
  const worldTexel = usePixelWorldTexel()
  const phaseStart = useRef(0)
  useFrame(() => { phaseStart.current = frameProfile.start() }, -2.5)
  useFrame(() => {
    frameProfile.end("figureSetup", phaseStart.current)
    phaseStart.current = frameProfile.start()
  }, -1.5)
  useFrame(() => {
    if (!isWorldVisible(root.current) || (process.env.NEXT_PUBLIC_GAME_BENCHMARK === "1" && !benchmarkWork.characterVisuals)) return
    for (const group of groups.values()) group.entries.length = 0
    candidates.clear()
  }, -1)
  useFrame(({ camera, scene, clock }, delta) => {
    // This interval also contains wildlife's independently reported callback.
    frameProfile.end("animationAndWildlife", phaseStart.current)
    const started = frameProfile.start()
    if (!root.current) return
    if (!isWorldVisible(root.current)) {
      candidates.clear(); clearBatchSourceVisibility(scene)
      frameProfile.end("characterBatches", started)
      return
    }
    if (process.env.NEXT_PUBLIC_GAME_BENCHMARK === "1" && !benchmarkWork.characterVisuals) {
      frameProfile.end("characterBatches", started)
      return
    }
    // Humanoids already publish their resolved pose. Transport sources retain
    // their existing callbacks and are collected after those have finished.
    for (const entry of entries.legacy) entries.publish(entry)
    for (const group of groups.values()) {
      let batch = group.batch
      if (!batch && group.entries.length) {
        batch = group.batch = new CharacterBatch(group.entries[0], worldTexel, root.current.children.length + 1)
        root.current.add(batch.root)
      }
      group.entries.sort((a, b) => a.sprite.renderOrder - b.sprite.renderOrder)
      batch?.setSimplified(frameQuality(scene) === 2, delta)
      batch?.write(group.entries, camera, true)
    }
    updateBatchSourceVisibility(scene, candidates, clock.elapsedTime)
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
    <SpriteFrames visibleRoot={root}>{children}</SpriteFrames>
    <PixelCharacters><group name="character-batches" ref={root} /></PixelCharacters>
  </Context.Provider>
}
