"use client"

import { Cache, ImageLoader } from "three"
import { CHARACTER_ASSETS, type CharacterModel, type SpriteClip } from "../character-assets"
import { populationVisual } from "../base-person/population-assets"
import { monkVisual } from "../base-person/monk-assets"
import { usePersonDesignStore } from "../base-person/design-store"
import { usePopulationStore } from "../base-person/population-store"
import { useCharacterAssetStore } from "../character-asset-store"
import { GREY_HAIR_AGE } from "../character-age"
import { TRAVELER_TYPES } from "../travelers"
import { knightVisual, squireVisual } from "../knight/visual"
import { KNIGHT } from "../knight/design"
import { MINSTREL_PLAYING } from "../minstrel/assets"
import { pullingVisual } from "../transport/visual"
import { CARGO, TRANSPORT, animalUrl, cartUrl } from "../transport/assets"
import { COATS } from "../transport/coats"
import { ENVIRONMENT_ATLAS, BOULDER_ATLAS } from "../environment/sprites"
import { DEFAULT_FOLIAGE_ATLAS } from "../trees/foliage/assets"
import { WATER_SOURCE_ATLAS } from "../water-sources/assets"
import { TREE_GROUND_ATLAS } from "../trees/ground"
import { ROAD_TIERS } from "../map/road"
import { GRASS_TEXTURE_URL } from "./ground-surface"
import { TERRAIN_EDGE_GRAIN_URL } from "./terrain-edge-grain"

type Visual = { walk: SpriteClip; idle: SpriteClip; actions: Partial<Record<string, SpriteClip>> }

/** Published opening-scene assets, derived from the same visuals as the renderer.
 * No map, population identities, WebGL context or simulation is created here. */
export function openingAssetUrls(characterModel: CharacterModel = "base") {
  const urls = new Set<string>([
    GRASS_TEXTURE_URL, TERRAIN_EDGE_GRAIN_URL, TREE_GROUND_ATLAS,
    "/textures/forest-floors-v2.png", "/textures/ground.png", "/textures/sand.png",
    "/textures/dirt-side.png", "/textures/water.png", ...ROAD_TIERS.map(tier => tier.textureUrl),
  ])
  const clip = (asset: SpriteClip) => { urls.add(asset.url); if (asset.depth) urls.add(asset.depth) }
  const visual = (asset: Visual) => {
    clip(asset.walk); clip(asset.idle)
    Object.values(asset.actions).forEach(action => { if (action) clip(action) })
  }
  for (const atlas of [DEFAULT_FOLIAGE_ATLAS, ENVIRONMENT_ATLAS, BOULDER_ATLAS, WATER_SOURCE_ATLAS]) {
    urls.add(atlas.color); urls.add(atlas.depth)
  }
  visual(monkVisual(18)); visual(monkVisual(GREY_HAIR_AGE))
  const pack = usePopulationStore.getState().pack
  for (const type of Object.keys(TRAVELER_TYPES) as (keyof typeof TRAVELER_TYPES)[]) {
    if (characterModel === "base" || (type === "beggar" || type === "nun")) {
      visual(populationVisual(type, 0, pack))
      visual(populationVisual(type, 0, pack, GREY_HAIR_AGE))
    } else urls.add((useCharacterAssetStore.getState().assets[type] ?? CHARACTER_ASSETS[type]).sheet)
  }
  visual(knightVisual(0)); visual(squireVisual()); visual(pullingVisual(0)); clip(MINSTREL_PLAYING)
  const transport = (url: string) => {
    urls.add(url); urls.add(url.replace(/([^/]+)$/, "depth-$1"))
  }
  for (const cargo of CARGO) {
    for (const puller of ["hand", "donkey", "horse"] as const) transport(cartUrl(cargo, puller))
    for (const side of [-1, 1]) for (const compact of [false, true]) transport(cartUrl(cargo, "shop", side, compact))
    transport(`/textures/transport/${TRANSPORT.version}/cart-${cargo}-driver.png`)
  }
  for (const kind of ["donkey", "horse"] as const) for (const coat of COATS[kind]) {
    transport(animalUrl(kind, coat.id)); transport(animalUrl(kind, coat.id, true))
    if (kind === "horse") for (const pose of ["mounted", "saddled"]) transport(`/textures/knights/${KNIGHT.version}/${pose}-${coat.id}.png`)
  }
  transport(`/textures/transport/${TRANSPORT.version}/merchant-setup.png`)
  transport(`/textures/transport/${TRANSPORT.version}/merchant-selling.png`)
  return [...urls]
}

const pending = new Map<string, Promise<unknown>>()

/** ImageLoader's cache is also consumed by TextureLoader (including useLoader).
 * Keep requests bounded and let the browser manage decoding of large atlases.
 * Failed preloads are evicted by Three and can retry through normal scene loading. */
export async function preloadGameAssets(characterModel: CharacterModel = "base") {
  Cache.enabled = true
  const loader = new ImageLoader()
  const urls = openingAssetUrls(characterModel)
  let next = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < urls.length) {
      const url = urls[next++]
      let request = pending.get(url)
      if (!request) {
        request = loader.loadAsync(url).catch(() => { pending.delete(url) })
        pending.set(url, request)
      }
      await request
    }
  }))
}

/** Restore authored people during the landing-page idle time as well. */
export async function prepareOpeningCharacters() {
  await usePersonDesignStore.getState().hydrate()
  await usePopulationStore.getState().prepare(usePersonDesignStore.getState().design)
}
