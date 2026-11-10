"use client"

import { Component, createContext, Suspense, useContext, useLayoutEffect, type ReactNode } from "react"
import { useLoader } from "@react-three/fiber"
import * as THREE from "three"
import type { MapRevealState } from "@/lib/game/render/map-reveal"

export const SceneAssetsContext = createContext<MapRevealState | null>(null)

function PendingSceneAsset() {
  const assets = useContext(SceneAssetsContext)
  useLayoutEffect(() => assets?.begin(), [assets])
  return null
}

/** First retry of a failed asset; each further failure doubles it, up to the cap. */
export const ASSET_RETRY_BASE_MS = 2_000
export const ASSET_RETRY_MAX_MS = 60_000
/** Longest URL list a single `useLoader` call passes (a character's clips plus depth maps). */
const MAX_LOADER_KEYS = 64
/** Requests remembered per URL, in case another list asked for it after the failed one. */
const BURSTS_PER_URL = 4

/**
 * URLs in the order three's loaders resolved them, grouped by synchronous
 * burst. `useLoader` caches its result — including a rejection — under the
 * whole URL list it was given, but its error names only the URL that failed.
 * Each call requests its list in one synchronous burst, so the failed call's
 * list is a contiguous run, of some burst, that contains that URL.
 */
const recentBursts = new Map<string, string[][]>()
/** URLs whose image failed at the loader, not yet evicted from `useLoader`'s cache. */
const erroredUrls = new Set<string>()
let burst: string[] | null = null

/** Record a URL resolved by any three.js loader. Exported for tests. */
export function noteLoaderUrl(url: string) {
  if (!burst) {
    const current: string[] = burst = []
    queueMicrotask(() => { if (burst === current) burst = null })
  }
  burst.push(url)
  const bursts = recentBursts.get(url) ?? []
  if (bursts[bursts.length - 1] !== burst) bursts.push(burst)
  if (bursts.length > BURSTS_PER_URL) bursts.shift()
  recentBursts.set(url, bursts)
}

/** Record a URL whose load failed at the loader. Exported for tests. */
export function noteLoaderError(url: string) { erroredUrls.add(url) }

// Every three.js loader resolves its URL through the default manager before it
// fetches or reads the cache, and reports failures to it. Wrap these rather
// than use `setURLModifier`, which is a public slot others could need.
const TRACKED = Symbol.for("pilgrimage.sceneAssetUrls")
type Tracker = { resolved: (url: string) => void; failed: (url: string) => void }
const manager = THREE.DefaultLoadingManager as THREE.LoadingManager & { [TRACKED]?: Tracker }
if (typeof window !== "undefined" && !manager[TRACKED]) {
  const resolve = manager.resolveURL.bind(manager), itemError = manager.itemError.bind(manager)
  manager.resolveURL = url => { manager[TRACKED]?.resolved(url); return resolve(url) }
  manager.itemError = url => { manager[TRACKED]?.failed(url); itemError(url) }
}
// Hot reloads re-point the wrappers at this module's state.
manager[TRACKED] = { resolved: noteLoaderUrl, failed: noteLoaderError }

/** Every URL list a `useLoader` call could have passed that includes `url`. Exported for tests. */
export function candidateLoaderKeys(url: string): string[][] {
  const keys: string[][] = [[url]]
  for (const urls of recentBursts.get(url) ?? []) urls.forEach((entry, at) => {
    if (entry !== url) return
    for (let start = Math.max(0, at - MAX_LOADER_KEYS + 1); start <= at; start++)
      for (let end = Math.max(at + 1, start + 2); end <= Math.min(urls.length, start + MAX_LOADER_KEYS); end++)
        keys.push(urls.slice(start, end))
  })
  return keys
}

/** The URL named by fiber's `useLoader` rejection ("Could not load <url>: …"), if any. */
export function failedAssetUrl(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (!message.startsWith("Could not load ")) return null
  const rest = message.slice("Could not load ".length)
  for (const url of recentBursts.keys()) if (rest.startsWith(`${url}: `)) return url
  const end = rest.lastIndexOf(": ")
  return end > 0 ? rest.slice(0, end) : rest
}

/**
 * Drop cached loads so the next mount refetches: suspend-react keeps a
 * rejection for good, so a remount would rethrow at once. Every URL that has
 * failed at the loader is dropped too: three's image cache can hand a request
 * made while a failed image is still settling a 0×0 "loaded" image, which
 * surfaces later as an unrelated error (a pixel read) with no URL in it.
 */
export function forgetFailedLoads(error: unknown) {
  const urls = new Set(erroredUrls)
  const named = failedAssetUrl(error)
  if (named) urls.add(named)
  erroredUrls.clear()
  for (const url of urls) for (const keys of candidateLoaderKeys(url)) useLoader.clear(THREE.TextureLoader, keys)
}

/** Delay before the `attempt`th retry (1-based): doubling from the base, capped. */
export function assetRetryDelay(attempt: number) {
  return Math.min(ASSET_RETRY_MAX_MS, ASSET_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1))
}

const failures = new Map<string, number>()
const logged = new Set<string>()
const failureKey = (error: unknown) => failedAssetUrl(error) ?? (error instanceof Error ? error.message : String(error))

/**
 * Renders nothing in place of a subtree whose asset failed, instead of letting
 * R3F rethrow the error to the page root. The failed load is evicted and the
 * subtree remounts after a doubling delay, so a network blip recovers and a
 * file that is gone for good is fetched at most once a minute.
 */
class SceneAssetErrorBoundary extends Component<{ children: ReactNode }, { failed: string | null }> {
  state = { failed: null as string | null }
  private retry: ReturnType<typeof setTimeout> | undefined

  static getDerivedStateFromError(error: unknown) { return { failed: failureKey(error) } }

  componentDidCatch(error: unknown) {
    const key = failureKey(error)
    forgetFailedLoads(error)
    failures.set(key, (failures.get(key) ?? 0) + 1)
    if (!logged.has(key)) {
      logged.add(key)
      console.error("Scene asset failed; hiding it and retrying with backoff.", error)
    }
    this.scheduleRetry()
  }

  // A parent Suspense that re-suspends hides this subtree, which unmounts
  // class instances' timers; resume the retry when it is shown again.
  componentDidMount() { if (this.state.failed) this.scheduleRetry() }

  componentDidUpdate(_props: unknown, previous: { failed: string | null }) {
    // A retry that committed its children succeeded: start any later failure afresh.
    if (previous.failed && !this.state.failed) failures.delete(previous.failed)
  }

  componentWillUnmount() { clearTimeout(this.retry); this.retry = undefined }

  private scheduleRetry() {
    clearTimeout(this.retry)
    const failed = this.state.failed
    if (!failed) return
    this.retry = setTimeout(() => { this.retry = undefined; this.setState({ failed: null }) }, assetRetryDelay(failures.get(failed) ?? 1))
  }

  render() { return this.state.failed ? null : this.props.children }
}

/**
 * Also reports nested sprite boundaries; outside the game this is ordinary Suspense.
 * A failed load settles the boundary (its pending fallback unmounts), so it
 * cannot hold the map reveal, and the subtree retries later.
 */
export function SceneAssetBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PendingSceneAsset />}><SceneAssetErrorBoundary>{children}</SceneAssetErrorBoundary></Suspense>
}
