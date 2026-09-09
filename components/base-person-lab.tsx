"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Check, Pause, Play, RotateCcw, X } from "lucide-react"
import { ASSET_ZOOMS, useAssetPreviewStore, usePreviewWheel } from "./asset-preview-controls"
import { AssetEditorFrame, type AssetEditorNavigation } from "./asset-editor-frame"
import { Section, Tuner } from "@/components/game/property-controls"
import "./game/game-hud.css"
import "./base-person-lab.css"
import { actionPlaybackRate } from "@/lib/game/base-person/activity"
import { BASE_PERSON, PERSON_CLIPS, SOCKET_NAMES, type BaseClip } from "@/lib/game/base-person/pose"
import { bakeChoppingBlock, bakePersonProgressively, personFrameRenderer, personSessionKey, renderPersonPreview, type BakeProgress, type BasePersonBake, type PersonPreview, type PersonSession } from "@/lib/game/base-person/bake"

import { DEFAULT_DESIGN, DESIGN_CONTROLS, HAIR_STYLES, HAT_STYLES, HAND_TOOLS, TUNIC_STYLES, PERSON_PRESETS, personRecipe, withBodyType, validatePersonDesign, type DesignKey, type PersonDesign } from "@/lib/game/base-person/design"
import { usePopulationStore } from "@/lib/game/base-person/population-store"
import { usePersonDesignStore } from "@/lib/game/base-person/design-store"
import { MerchantMapPreview } from "./merchant-map-preview"
import { COATS, animalCoat } from "@/lib/game/transport/coats"
import { CARGO, TRANSPORT, CART, SHOP, cartLoadout, animalStride, cartUrl, animalUrl, type Puller, type ShopState, cartColumn, type Cargo, type CartMode, type HorseVariant } from "@/lib/game/transport/assets"
import { KNIGHT, knightDesign } from "@/lib/game/knight/design"
import { MONK_VISUAL } from "@/lib/game/base-person/monk-assets"
import { knightLoadout, knightTravelSpeed } from "@/lib/game/knights"
import { personWalkStride } from "@/lib/game/base-person/gait"
import { squireVisual } from "@/lib/game/knight/visual"
import knightMetadata from "@/public/textures/knights/v12/manifest.json"
import transportMetadata from "@/public/textures/transport/v25/manifest.json"

const SUBJECTS = { person: "Person", cart: "Merchant cart", donkey: "Donkey", horse: "Horse", knight: "Knight" } as const
type Subject = keyof typeof SUBJECTS
declare global { interface Window {
  __jobBake?: typeof import("@/lib/game/jobs/bake").bakeJobs
  __minstrelBake?: typeof import("@/lib/game/minstrel/bake").bakeMinstrels
  __knightBake?: typeof import("@/lib/game/knight/bake").bakeKnights
  __transportBake?: typeof import("@/lib/game/transport/bake").bakeTransport
  __choppingBlockBake?: typeof import("@/lib/game/base-person/bake").bakeChoppingBlock
  __rocketMonkBake?: typeof import("@/lib/game/rocket/bake").bakeRocketMonks
} }

import { characterEditsJson, parseCharacterEdits, restoreCharacterDesign } from "@/lib/game/base-person/share-edits"
import { CharacterAnimationDock } from "./character-rig-editor"
import { RigOverlay, RigInspector } from "./person-rig-editor"
import { inspectRig } from "@/lib/game/base-person/rig-inspection"
import { clearFrameKeys, poseOffset, setPoseKey, type EditableJoint, type PoseEdits } from "@/lib/game/base-person/pose-edits"
import type { RigJoint } from "@/lib/game/base-person/rig-joints"
import { staffMotion } from "@/lib/game/base-person/staff-motion"
import type { Point3 } from "@/lib/game/base-person/pose"
import { populationDesign, POPULATION_PROFILES } from "@/lib/game/base-person/population"
import { previewRandomSeed } from "@/lib/game/preview-random"
import { travelerAppearance } from "@/lib/game/base-person/population"
import { TRAVELER_TYPES, generateTravelers } from "@/lib/game/travelers"

import { SETTLEMENT_JOBS, jobDesign, type SettlementJob } from "@/lib/game/jobs/design"

const JOB_DESIGNS = (Object.keys(SETTLEMENT_JOBS) as SettlementJob[]).flatMap(job => POPULATION_PROFILES.map((profile, variant) => ({ id: `job/${job}/${profile.id}`, label: `${SETTLEMENT_JOBS[job].label} · ${profile.id.replaceAll("-", " ")}`, design: jobDesign(job, variant) })))

const ROAD_DESIGNS = Object.values(TRAVELER_TYPES).flatMap(type => POPULATION_PROFILES.map((profile, variant) => ({ id: `${type.id}/${profile.id}`, label: `${type.label} · ${profile.id.replaceAll("-", " ")}`, design: populationDesign(type, variant) })))

const DRAFT_KEY = "pilgrimage-rig-editor-v1"
const button = "hud-action"

function Tile({ url, shadowUrl, row, frame, columns, zoom = 1, name, cellSize = BASE_PERSON.cellSize, rows = 8 }: {
  url: string; shadowUrl?: string; row: number; frame: number; columns: number; zoom?: number; name: string; cellSize?: number; rows?: number
}) {
  const size = cellSize * zoom
  return <span role="img" aria-label={name} className="block shrink-0" style={{ width: size, height: size,
    imageRendering: "pixelated", backgroundImage: `url("${url}")${shadowUrl ? `, url("${shadowUrl}")` : ""}`,
    backgroundSize: `${columns * size}px ${rows * size}px`, backgroundPosition: `${-frame * size}px ${-row * size}px`,
  }} />
}

function download(url: string, name: string) {
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click()
}

// Both actors use their actual atlas anchors and the game's following distance.
function entourageLayout(mounted: boolean, row: number) {
  const size = mounted ? KNIGHT.cellSize : knightMetadata.person.cellSize
  const anchor = mounted ? KNIGHT.anchor : knightMetadata.person.anchor
  const angle = -row * Math.PI / 4, gap = 0.75 * TRANSPORT.cellSize / TRANSPORT.scale
  const x = Math.round(anchor[0] - Math.sin(angle) * gap - knightMetadata.squire.anchor[0])
  const depth = -Math.cos(angle) * gap
  const y = Math.round(anchor[1] + depth * Math.sin(BASE_PERSON.camera.pitch * Math.PI / 180) - knightMetadata.squire.anchor[1])
  const left = Math.min(0, x), top = Math.min(0, y)
  return { width: Math.max(size, x + knightMetadata.squire.cellSize) - left,
    height: Math.max(size, y + knightMetadata.squire.cellSize) - top,
    knight: { left: -left, top: -top }, squire: { left: x - left, top: y - top }, inFront: depth > 0 }
}

function KnightEntourage({ mounted, row, frame, visibleFrame, variant, walking, zoom = 1, offset = [0, 0], ...tile }: {
  mounted: boolean; row: number; frame: number; variant: number; walking: boolean; zoom?: number; offset?: [number, number]
  url: string; columns: number; visibleFrame: number; rows: number; cellSize: number; name: string
}) {
  const layout = entourageLayout(mounted, row), squire = squireVisual()
  const stride = mounted ? animalStride("horse", 1, "noble") : personWalkStride(knightDesign(variant))
  const phase = walking ? frame / (mounted ? KNIGHT.frames : knightMetadata.person.frameCounts.walk) * stride / squire.walkStride : 0
  const clip = walking ? squire.walk : squire.idle
  const position = (at: { left: number; top: number }) => ({ position: "absolute" as const, left: at.left * zoom, top: at.top * zoom })
  return <div className="person-sprite knight-entourage" style={{ width: layout.width * zoom, height: layout.height * zoom, transform: `translate(${offset[0]}px, ${offset[1]}px)` }}>
    <div style={position(layout.knight)}><Tile {...tile} row={variant * 8 + row} frame={visibleFrame} zoom={zoom} /></div>
    <div style={{ ...position(layout.squire), zIndex: layout.inFront ? 1 : -1 }}><Tile url={clip.url} row={squire.rowOffset + row} frame={Math.floor(phase * clip.columns) % clip.columns} columns={clip.columns} rows={clip.rows} cellSize={knightMetadata.squire.cellSize} zoom={zoom} name={`Squire ${BASE_PERSON.directions[row]}, ${walking ? "following" : "waiting"}`} /></div>
  </div>
}

/** Character proportions and editable animation poses.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0
 */
export function BasePersonLab({ mode, onModeChange, active = true }: AssetEditorNavigation & { active?: boolean }) {
  const [subject, setSubject] = useState<Subject>("person")
  const [cargo, setCargo] = useState<Cargo>("produce")
  const [view, setView] = useState<"character" | "native" | "sheet" | "map">("character")
  const [shopState, setShopState] = useState<ShopState>("travel")
  const [cartPuller, setCartPuller] = useState<Puller>("donkey")
  const cartMode: CartMode = shopState === "travel" ? cartPuller : "shop"
  const [coat, setCoat] = useState("")
  const [grazing, setGrazing] = useState(false)
  const [horseVariant, setHorseVariant] = useState<HorseVariant>("common")
  const [mountedKnight, setMountedKnight] = useState(true)
  const [knightVariant, setKnightVariant] = useState(0)
  const [showSquire, setShowSquire] = useState(true)
  const isKnight = subject === "knight"
  const isPerson = subject === "person"
  const onMap = subject === "cart" && view === "map"
  useEffect(() => { setView(subject === "cart" ? "map" : "character"); if (subject === "cart") setZoom(6) }, [subject])
  const animalKind = isKnight ? "horse" : subject === "cart" ? cartPuller === "hand" ? null : cartPuller : subject === "horse" || subject === "donkey" ? subject : null
  useEffect(() => {
    const asset = new URLSearchParams(window.location.search).get("asset")
    if (asset && Object.hasOwn(SUBJECTS, asset)) setSubject(asset as Subject)
  }, [])
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    const target = window as unknown as { __bakePersonPopulation?: (progress?: (done: number) => void, only?: import("@/lib/game/travelers").TravelerTypeId) => Promise<unknown> }
    target.__bakePersonPopulation = async (progress, only) => (await import("@/lib/game/base-person/bake-population")).bakePopulation(undefined, progress, undefined, only)
    window.__jobBake = async progress => (await import("@/lib/game/jobs/bake")).bakeJobs(progress)
    window.__minstrelBake = async () => (await import("@/lib/game/minstrel/bake")).bakeMinstrels()
    window.__knightBake = async () => (await import("@/lib/game/knight/bake")).bakeKnights()
    window.__transportBake = async () => (await import("@/lib/game/transport/bake")).bakeTransport()
    window.__choppingBlockBake = bakeChoppingBlock
    window.__rocketMonkBake = async () => (await import("@/lib/game/rocket/bake")).bakeRocketMonks()
    return () => { delete target.__bakePersonPopulation; delete window.__jobBake; delete window.__transportBake; delete window.__knightBake; delete window.__minstrelBake; delete window.__choppingBlockBake; delete window.__rocketMonkBake }
  }, [])
  const [bake, setBake] = useState<BasePersonBake | null>(null)
  const [error, setError] = useState("")
  const [row, setRow] = useState(1)
  const [frame, setFrame] = useState(0)
  const [clip, setClip] = useState<BaseClip>("walk")
  const knightClip = mountedKnight ? clip === "idle" ? "idle" : "walk" : clip === "preaching" ? "idle" : clip
  const knightFrames = mountedKnight ? knightClip === "idle" ? 1 : knightMetadata.frames : knightMetadata.person.frameCounts[knightClip]
  const frameCount = isKnight ? knightFrames : isPerson ? PERSON_CLIPS[clip].frames : subject === "cart" ? shopState === "opening" || shopState === "packing" ? 48 : 120 : grazing ? TRANSPORT.grazeFrames : clip === "idle" ? 1 : transportMetadata.animalClips.walk.frames
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("clip")
    if (requested && Object.keys(PERSON_CLIPS).includes(requested)) setClip(requested as BaseClip)
  }, [])
  const [playing, setPlaying] = useState(true)
  const [fps, setFps] = useState(BASE_PERSON.defaultFps)
  const { zoom, setZoom } = useAssetPreviewStore()
  const [guides, setGuides] = useState(false)
  const [onion, setOnion] = useState(false)
  const [sides, setSides] = useState(false)
  const [design, setDesign] = useState<PersonDesign>(DEFAULT_DESIGN)
  const animationRate = isKnight ? mountedKnight ? knightTravelSpeed(1, showSquire) / animalStride("horse", 1, "noble") * knightMetadata.frames / BASE_PERSON.defaultFps : actionPlaybackRate(knightClip, knightDesign(knightVariant)) : isPerson ? actionPlaybackRate(clip, design) : subject === "cart" ? 12 / BASE_PERSON.defaultFps
    : grazing ? transportMetadata.animalClips.graze.fps / BASE_PERSON.defaultFps : transportMetadata.animalProfiles[subject === "donkey" ? "donkey" : horseVariant].cyclesPerSecond * transportMetadata.animalClips.walk.frames / BASE_PERSON.defaultFps
  const [busy, setBusy] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<PersonPreview | null>(null)
  const sheetMatchesDesign = !!bake && JSON.stringify(bake.metadata.design) === JSON.stringify(design)
  const [message, setMessage] = useState("")
  const applyDesign = usePersonDesignStore((s) => s.apply)
  const populationBuilding = usePopulationStore(s => s.building)
  const populationProgress = usePopulationStore(s => s.progress)
  const populationError = usePopulationStore(s => s.error)
  const storeError = usePersonDesignStore((s) => s.error)
  const [showRig, setShowRig] = useState(false)
  const [selectedJoint, setSelectedJoint] = useState<RigJoint>("rightHand")
  const [character, setCharacter] = useState("preset/Storybook")
  const drafts = useRef<Record<string, PersonDesign>>({})
  const [draftsReady, setDraftsReady] = useState(false)
  const [history, setHistory] = useState<PoseEdits[]>([])
  const [future, setFuture] = useState<PoseEdits[]>([])
  const dragSnapshot = useRef<PoseEdits | null>(null)
  const latestEdits = useRef<PoseEdits | undefined>(undefined); latestEdits.current = design.poseEdits
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null")
      if (stored?.drafts) {
        for (const [id, value] of Object.entries(stored.drafts)) drafts.current[id] = restoreCharacterDesign(value, stored.templateVersion ?? 20)
        if (drafts.current[stored.character]) { setCharacter(stored.character); setDesign(drafts.current[stored.character]) }
      } else {
        void usePersonDesignStore.getState().hydrate()
        setDesign(usePersonDesignStore.getState().design ?? DEFAULT_DESIGN)
      }
    } catch { setMessage("Saved editor draft could not load. Project defaults are available.") }
    setDraftsReady(true)
  }, [])
  useEffect(() => {
    if (!draftsReady) return
    drafts.current[character] = design
    if (dragging) return // Every draft is serialised here; wait for the pointer to settle.
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ templateVersion: BASE_PERSON.version, character, drafts: drafts.current })) }
    catch { setMessage("Browser storage is unavailable. Copy edits as JSON to keep a backup.") }
  }, [design, character, draftsReady, dragging])
  const jsonDialog = useRef<HTMLDialogElement>(null)
  const jsonArea = useRef<HTMLTextAreaElement>(null)
  const [jsonText, setJsonText] = useState("")
  const [jsonMessage, setJsonMessage] = useState("")
  const editsJson = () => characterEditsJson(character, drafts.current, design)
  const openJson = (text = editsJson(), note = "") => {
    setPlaying(false); setJsonText(text); setJsonMessage(note); jsonDialog.current?.showModal()
    requestAnimationFrame(() => { jsonArea.current?.focus(); jsonArea.current?.select() })
  }
  const copyJson = async (text = editsJson()) => {
    try {
      await navigator.clipboard.writeText(text)
      setMessage("All character drafts copied as JSON. Paste into the chat with ⌘V.")
      setJsonMessage("Copied. Paste into the chat with ⌘V.")
    } catch { openJson(text, "Clipboard access is unavailable. Press ⌘C to copy the selected JSON, then paste it into the chat.") }
  }
  const loadJson = () => {
    try {
      const imported = parseCharacterEdits(jsonText, character)
      const available = new Set([...Object.keys(PERSON_PRESETS).map(name => `preset/${name}`), ...ROAD_DESIGNS.map(entry => entry.id), ...JOB_DESIGNS.map(entry => entry.id)])
      if (Object.keys(imported.drafts).some(id => !available.has(id))) throw new Error("These edits include an unknown character.")
      const merged = { ...drafts.current, [character]: design, ...imported.drafts }
      // Keep a recoverable copy of the pre-import drafts before replacing keys.
      localStorage.setItem(`${DRAFT_KEY}-before-import`, JSON.stringify({ templateVersion: BASE_PERSON.version, character, drafts: { ...drafts.current, [character]: design } }))
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ templateVersion: BASE_PERSON.version, character: imported.character, drafts: merged }))
      drafts.current = merged
      setCharacter(imported.character); setDesign(merged[imported.character]); setHistory([]); setFuture([]); setPlaying(false)
      setMessage("JSON loaded. Other character drafts kept; previous edits backed up in this browser.")
      jsonDialog.current?.close()
    } catch (error) { setJsonMessage(error instanceof Error ? error.message : "Could not load JSON. Your edits have not changed.") }
  }
  const chooseCharacter = (id: string, initial: PersonDesign) => {
    if (id.startsWith("knight/")) {
      setKnightVariant(POPULATION_PROFILES.findIndex(profile => id === `knight/${profile.id}`) % KNIGHT.variants)
      setSubject("knight"); setClip("walk"); setFrame(0)
      return
    }
    drafts.current[character] = design
    setCharacter(id); setDesign(drafts.current[id] ?? { ...initial }); setHistory([]); setFuture([]); setMessage("")
  }
  const randomize = () => {
    const seed = previewRandomSeed()
    if (subject === "cart") {
      const loadout = cartLoadout(seed % 65536)
      setCargo(loadout.cargo); setCartPuller(loadout.puller); setCoat(loadout.coat ?? "")
    } else if (subject === "horse" || subject === "donkey") setCoat(COATS[subject][seed % COATS[subject].length].id)
    else if (subject === "knight") {
      const loadout = knightLoadout(seed % 65536)
      setKnightVariant(travelerAppearance(seed, 0).variant % KNIGHT.variants)
      setCoat(loadout.coat); setShowSquire(loadout.squire)
    }
    else {
      const type = generateTravelers(seed, 1)[0].type
      const appearance = travelerAppearance(seed, 0)
      if (type.id === "knight") {
        const loadout = knightLoadout(seed % 65536)
        setSubject("knight"); setKnightVariant(appearance.variant % KNIGHT.variants)
        setCoat(loadout.coat); setShowSquire(loadout.squire)
        return
      }
      drafts.current[character] = design
      setCharacter("random/map")
      setDesign({ ...(type.id === "friar" ? MONK_VISUAL.design : populationDesign(type, appearance.variant)), skinColor: appearance.complexion.skin, hairColor: appearance.complexion.hair })
      setHistory([]); setFuture([])
      setMessage(`${type.label} · ${POPULATION_PROFILES[appearance.variant].id.replaceAll("-", " ")} · map appearance`)
    }
  }
  // One render session per design serves both the rig handles and the live preview, so a drag keeps its rig and compiled shaders.
  const session = useRef<{ key: string; session: PersonSession } | null>(null)
  const previewSession = (design: PersonDesign) => {
    const key = personSessionKey(design)
    if (session.current?.key !== key) { session.current?.session.dispose(); session.current = { key, session: personFrameRenderer(design) } }
    return session.current.session
  }
  useEffect(() => () => { session.current?.session.dispose(); session.current = null }, [])
  const inspected = useMemo(() => isPerson && showRig ? inspectRig(design, clip, frame % PERSON_CLIPS[clip].frames, row, previewSession(design).rig) : {}, [isPerson, showRig, design, clip, frame, row]) // eslint-disable-line react-hooks/exhaustive-deps
  const editFrame = (joint: EditableJoint) => joint === "staffTip" && (clip === "walk" || clip === "wearyWalk") && staffMotion(frame / PERSON_CLIPS.walk.frames, personRecipe(design).body).planted ? 0 : frame % PERSON_CLIPS[clip].frames
  const currentOffset = (joint: EditableJoint) => poseOffset(design.poseEdits, clip, joint, editFrame(joint) / PERSON_CLIPS[clip].frames)
  const selectedKey = design.poseEdits?.[clip]?.[selectedJoint as EditableJoint]?.find(k => k.frame === editFrame(selectedJoint as EditableJoint))
  const frameKeyed = (step: number) => Object.values(design.poseEdits?.[clip] ?? {}).some(keys => keys?.some(key => key.frame === step))
  const radius = selectedKey?.radius ?? Math.min(3, Math.max(1, Math.floor(PERSON_CLIPS[clip].frames / 2)))
  const commitPose = (edits: PoseEdits) => {
    if (JSON.stringify(edits) === JSON.stringify(design.poseEdits ?? {})) return
    if (!dragSnapshot.current) { setHistory(h => [...h.slice(-49), design.poseEdits ?? {}]); setFuture([]) }
    latestEdits.current = edits
    setDesign(d => ({ ...d, poseEdits: edits })); setMessage("")
  }
  const changeJoints = (changes: [EditableJoint, Point3][], blend = radius) => {
    setPlaying(false)
    let edits: PoseEdits = design.poseEdits ?? {}
    for (let [joint, offset] of changes) {
      const at = editFrame(joint)
      if (joint === "staffTip" && (clip === "idle" || ((clip === "walk" || clip === "wearyWalk") && staffMotion(frame / PERSON_CLIPS.walk.frames, personRecipe(design).body).planted))) offset = [offset[0], 0, offset[2]]
      edits = setPoseKey(edits, clip, joint, { frame: at, offset, radius: blend }, at)
    }
    commitPose(edits)
  }
  const changeJoint = (joint: EditableJoint, offset: Point3, blend = radius) => changeJoints([[joint, offset]], blend)
  const rigDragging = (active: boolean) => {
    setDragging(active); setPlaying(false)
    if (active) dragSnapshot.current = structuredClone(design.poseEdits ?? {})
    else if (dragSnapshot.current) {
      const before = dragSnapshot.current; dragSnapshot.current = null
      // The release may commit its final coalesced move in this same event, ahead of the next render.
      if (JSON.stringify(before) !== JSON.stringify(latestEdits.current ?? {})) { setHistory(h => [...h.slice(-49), before]); setFuture([]) }
    }
  }
  const [bakeProgress, setBakeProgress] = useState<BakeProgress | null>(null)
  useEffect(() => {
    setBusy(true)
    const target = window as unknown as { __basePersonBake?: BasePersonBake }
    delete target.__basePersonBake
    if (dragging || !isPerson) { if (!isPerson) { setBusy(false); setBakeProgress(null) } return }
    let job: ReturnType<typeof bakePersonProgressively> | undefined
    // Sheets bake between browser tasks, one row at a time, so the stage can show progress and stay responsive.
    const timer = setTimeout(() => {
      job = bakePersonProgressively(design, setBakeProgress)
      job.promise.then(result => {
        if (!result) return // Superseded by a newer design.
        setBake(result); setError(""); target.__basePersonBake = result
        setBusy(false); setBakeProgress(null)
      }, e => { setError(e instanceof Error ? e.message : "The base sprite could not render."); setBusy(false); setBakeProgress(null) })
    }, 180)
    return () => { clearTimeout(timer); job?.cancel(); delete target.__basePersonBake }
  }, [design, dragging, isPerson])
  useEffect(() => {
    if (sheetMatchesDesign || !isPerson) return
    // Coalesce inputs into a paint, without waiting for the user to stop dragging; a drag refreshes only the facing on screen.
    const request = requestAnimationFrame(() => {
      try {
        setPreview(renderPersonPreview(design, clip, frame % PERSON_CLIPS[clip].frames, sides, dragging ? [row] : undefined, previewSession(design)))
        setError("")
      } catch (e) { setError(e instanceof Error ? e.message : "The preview could not render.") }
    })
    return () => cancelAnimationFrame(request)
  }, [design, clip, frame, sides, sheetMatchesDesign, isPerson, dragging, row])
  useEffect(() => {
    if (!active || !playing || frameCount === 1 || onMap) return
    const timer = setInterval(() => setFrame((f) => subject === "knight" || (subject === "cart" && shopState !== "opening" && shopState !== "packing") ? f + 1 : (f + 1) % frameCount), 1000 / (fps * animationRate))
    return () => clearInterval(timer)
  }, [active, playing, fps, frameCount, animationRate, subject, shopState, onMap])

  const live = isPerson && !sheetMatchesDesign && preview?.clip === clip && preview.sides === sides ? preview : null
  const columns = isKnight ? mountedKnight ? knightMetadata.frames + 1 : knightFrames : isPerson ? live ? 1 : PERSON_CLIPS[clip].frames : subject === "cart" ? cartMode === "shop" ? transportMetadata.shop.frames : transportMetadata.cartColumns : transportMetadata.animalColumns
  const step = frame % frameCount
  const firstColumn = isKnight ? mountedKnight && knightClip === "walk" ? 1 : 0 : isPerson ? 0 : subject === "cart" ? cartColumn(cargo, cartMode, 0) : grazing ? transportMetadata.animalClips.graze.start : clip === "idle" ? transportMetadata.animalClips.idle.start : transportMetadata.animalClips.walk.start
  const visibleFrame = live ? 0 : subject === "cart" ? cartMode === "shop" ? Math.round((shopState === "opening" ? step / 47 : shopState === "packing" ? 1 - step / 47 : 1) * (TRANSPORT.shopFrames - 1)) : step % TRANSPORT.wheelFrames : firstColumn + step
  const bakedSheet = bake ? clip === "walk" || clip === "idle" ? sides ? clip === "walk" ? bake.debugWalk : bake.debugIdle : bake[clip] : sides ? bake.actions[clip].debug : bake.actions[clip].url : ""
  const bakedShadow = sides ? undefined : clip === "walk" ? bake?.shadowWalk : clip === "idle" ? bake?.shadowIdle : bake?.actions[clip].shadow
  const url = isKnight ? `/textures/knights/${KNIGHT.version}/${mountedKnight ? `mounted-${animalCoat("horse", coat).id}` : `knight-${knightClip}`}.png` : !isPerson ? subject === "cart" ? cartUrl(cargo, cartMode, 1, cartPuller === "hand") : animalUrl(subject, animalCoat(subject, coat).id) : live?.url ?? bakedSheet
  const shadowUrl = !isPerson || sides ? undefined : live?.shadowUrl ?? bakedShadow
  const partialLive = !!live && live.rows.length < BASE_PERSON.directions.length
  const renderPalette = personRecipe(design).renderPalette
  const sockets = isPerson ? live?.sockets[row] ?? bake?.metadata.clips[clip][row * columns + visibleFrame]?.sockets : undefined
  const pixels = isKnight ? mountedKnight ? knightMetadata.cellSize : knightMetadata.person.cellSize : isPerson ? BASE_PERSON.cellSize : subject === "cart" ? cartMode === "shop" ? SHOP.cellSize : CART.cellSize : transportMetadata.cellSize
  const directionStep = subject === "cart" ? CART.directions / 8 : 1
  const atlasRows = isKnight ? knightMetadata.variants * 8 : subject === "cart" ? CART.directions : subject === "horse" ? transportMetadata.animalRows.horse : 8
  const rowOffset = isKnight ? knightVariant * 8 : subject === "horse" ? transportMetadata.horseVariants[horseVariant].rowOffset : 0
  const clipLabel = isKnight ? mountedKnight ? knightClip === "idle" ? "Mounted · standing" : "Riding" : PERSON_CLIPS[knightClip].label : subject === "cart" ? { travel: `Pulled by ${cartPuller}`, opening: "Opening shop", trading: "Open for business", packing: "Packing up" }[shopState] : !isPerson && grazing ? "Grazing" : PERSON_CLIPS[clip].label
  const direction = BASE_PERSON.directions[row]
  const jsonDownload = () => {
    if (!bake) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(bake.metadata, null, 2) + "\n"], { type: "application/json" }))
    download(url, `base-person-v${BASE_PERSON.version}.json`); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [controlsOpen, setControlsOpen] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const [previewOffset, setPreviewOffset] = useState<[number, number]>([0, 0])
  const viewDrag = useRef<{ pointer: number; x: number; y: number; row: number; pan: boolean; offset: [number, number] } | null>(null)
  const [scrubbingViews, setScrubbingViews] = useState(false)
  usePreviewWheel(stageRef, view === "character")
  const fittedZoom = zoom
  const section = (title: string, defaultOpen = true) => ({ title, open: openSections[title] ?? defaultOpen,
    onToggle: () => setOpenSections(s => ({ ...s, [title]: !(s[title] ?? defaultOpen) })) })
  const controls = (keys: DesignKey[]) => keys.map(key => {
    const control = DESIGN_CONTROLS[key]
    return <Tuner key={key} label={control.label} labelClassName="w-28" value={design[key]}
      display={key === "armAngle" || key === "elbowBend" ? `${design[key]}°` : `${Math.round(design[key] * 100)}%`} min={control.min} max={control.max} step={control.step}
      onDragChange={setDragging} onChange={value => { setDesign(d => ({ ...d, [key]: value })); setMessage("") }} />
  })
  const ready = !busy && !error && !!bake && sheetMatchesDesign

  return <AssetEditorFrame mode={mode} onModeChange={onModeChange} label="Character playground" onRandomize={randomize}
    version={isPerson ? `Base person · v${BASE_PERSON.version}` : `${SUBJECTS[subject]} · ${isKnight ? KNIGHT.version : TRANSPORT.version}`}
    controlsOpen={controlsOpen} onControlsToggle={() => setControlsOpen(!controlsOpen)}
    roadHref={`/play?characters=base&baseSize=1.5&fps=${fps}`}
    status={onMap ? "Merchant journey and turning simulations · game scale" : !isPerson ? `${subject === "horse" ? transportMetadata.animalProfiles[horseVariant].label : SUBJECTS[subject]} · ${clipLabel}` : dragging ? "Live preview · release to finish sprite sheets." : busy ? bakeProgress ? `Updating sprite sheets · ${Math.round(bakeProgress.done / bakeProgress.total * 100)}%` : "Updating sprite sheets…" : populationBuilding ? `Updating road characters · ${Math.round(populationProgress * 100)}%` : populationError || message || "Ready · changes preview instantly"}
    detail={onMap ? "8 camera angles · game scale" : `${subject === "cart" ? CART.directions : 8} directions · ${Number((fps * animationRate).toFixed(1))} fps`}>
    <div className="person-workspace">
      <aside className={`person-controls hud-well ${controlsOpen ? "is-open" : ""}`} aria-label="Character controls">
        <div className="person-panel-heading"><label className="person-choice">Asset<select aria-label="Character asset" value={subject} onChange={e => { setSubject(e.target.value as Subject); setFrame(0); setClip("walk") }}>{Object.entries(SUBJECTS).filter(([id]) => id === "person" || id === "cart" || id === "knight").map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><button className="hud-close person-controls-toggle" aria-label="Close character controls" onClick={() => setControlsOpen(false)}><X size={14} /></button></div>
        <div className="person-controls-scroll">
          {isPerson ? <>
          <Section {...section("Presets")}><div className="person-presets">{Object.entries(PERSON_PRESETS).map(([name, preset]) => <button key={name} className={button} onClick={() => chooseCharacter(`preset/${name}`, preset)}>{name}</button>)}</div></Section>
          <Section {...section("Road characters")}><label className="person-choice">Character<select aria-label="Road character" value={ROAD_DESIGNS.some(entry => entry.id === character) ? character : ""} onChange={e => { const entry = ROAD_DESIGNS.find(d => d.id === e.target.value); if (entry) chooseCharacter(entry.id, entry.design) }}><option value="" disabled>Choose calling / body</option>{ROAD_DESIGNS.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label></Section>
          <Section {...section("Settlement jobs")}><label className="person-choice">Job<select aria-label="Settlement job character" value={character.startsWith("job/") ? character : ""} onChange={e => { const entry = JOB_DESIGNS.find(d => d.id === e.target.value); if (entry) chooseCharacter(entry.id, entry.design) }}><option value="" disabled>Choose job / body</option>{JOB_DESIGNS.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label></Section>
          <Section {...section("Body")}>
            <label className="person-choice">Body type<select aria-label="Body type" value={design.bodyType} onChange={event => { const bodyType = event.currentTarget.value as PersonDesign["bodyType"]; setDesign(d => withBodyType(d, bodyType)); setMessage("") }}><option>Male</option><option>Female</option></select></label>
            {controls(["head", "build", "torsoHeight", "neckHeight", "legs"])}
          </Section>
          <Section {...section("Arms")}>
            {controls(["shoulderHeight", "armSpacing", "upperArm", "forearm", "armAngle", "elbowBend", "armSwing", "hands", "sleeves"])}
          </Section>
          <Section {...section("Clothing")}>
            <label className="person-choice">Garment<select aria-label="Garment" value={design.garment} onChange={event => { const garment = event.currentTarget.value as PersonDesign["garment"]; setDesign(d => ({ ...d, garment })); setMessage("") }}><option>Everyday</option><option>Robe</option></select></label>
            <label className="person-choice">Belt<select aria-label="Belt" value={design.beltStyle} onChange={event => { const beltStyle = event.currentTarget.value as PersonDesign["beltStyle"]; setDesign(d => ({ ...d, beltStyle })); setMessage("") }}><option>Leather</option><option>Rope</option></select></label>
            <label className="person-choice">Tunic style<select aria-label="Tunic style" value={design.tunicStyle} onChange={event => { const tunicStyle = event.currentTarget.value as PersonDesign["tunicStyle"]; setDesign(d => ({ ...d, tunicStyle })); setMessage("") }}>{TUNIC_STYLES.map(style => <option key={style}>{style}</option>)}</select></label>
            <label className="person-choice">Accent color<input type="color" aria-label="Accent color" value={design.accentColor} onChange={event => { const accentColor = event.currentTarget.value; setDesign(d => ({ ...d, accentColor })); setMessage("") }} /></label>
            {controls(["tunicLength", "hem"])}
            <p className="person-hint">{design.garment === "Robe" ? "Ankle-length robe with full sleeves." : design.bodyType === "Female" ? "Sleeveless ankle-length dress over a long-sleeved shirt." : "Hip-length shirt with loose sleeves and trousers."}</p>
            <label className="person-choice">Clothing color<input type="color" aria-label="Clothing color" value={design.tunicColor} onChange={event => { const tunicColor = event.currentTarget.value; setDesign(d => ({ ...d, tunicColor })); setMessage("") }} /></label>
            {(design.bodyType === "Female" ? [["shirtColor", "Undershirt color"], ["coveringColor", "Head covering color"]] as const : [["trouserColor", "Trouser color"]] as const).map(([key, label]) => <label key={key} className="person-choice">{label}<input type="color" aria-label={label} value={design[key]} onChange={event => { const value = event.currentTarget.value; setDesign(d => ({ ...d, [key]: value })); setMessage("") }} /></label>)}
          </Section>
          <Section {...section("Road accessories")}>
            <label className="person-choice">Hat<select aria-label="Hat" value={design.hat} onChange={event => { const hat = event.currentTarget.value as PersonDesign["hat"]; setDesign(d => ({ ...d, hat })); setMessage("") }}>{HAT_STYLES.map(style => <option key={style}>{style}</option>)}</select></label>
            <label className="person-choice">Hand tool<select aria-label="Hand tool" value={design.handTool} onChange={event => { const handTool = event.target.value as PersonDesign["handTool"]; setDesign(d => validatePersonDesign({ ...d, handTool })) }}>{HAND_TOOLS.map(tool => <option key={tool}>{tool}</option>)}</select></label>
            {([["satchel", "Satchel"], ["walkingStick", "Walking staff"], ["lute", "Lute"]] as const).map(([key, label]) => <label key={key} className="person-check"><input aria-label={label} type="checkbox" checked={design[key]} onChange={event => { const value = event.currentTarget.checked; setDesign(d => ({ ...d, [key]: value })); setMessage("") }} />{label}</label>)}
            <p className="person-hint">Road equipment is worn while walking or idle. Other activities free the hands and set bags and instruments aside.</p>
          </Section>
          <Section {...section("Feet")}>
            {controls(["feet", "footWidth", "footHeight"])}
          </Section>
          <Section {...section("Appearance")}>
            {([["skinColor", "Skin color"], ["hairColor", "Hair color"]] as const).map(([key, label]) => <label key={key} className="person-choice">{label}<input type="color" aria-label={label} value={design[key]} onChange={event => { const value = event.currentTarget.value; setDesign(d => ({ ...d, [key]: value })); setMessage("") }} /></label>)}
            <label className="person-choice">Hair style<select aria-label="Hair style" value={design.hairStyle} onChange={event => { const hairStyle = event.currentTarget.value as PersonDesign["hairStyle"]; setDesign(d => ({ ...d, hairStyle })); setMessage("") }}>{HAIR_STYLES.map(style => <option key={style}>{style}</option>)}</select></label>
            <label className="person-check"><input aria-label="Short beard" disabled={design.bodyType === "Female"} type="checkbox" checked={design.beard} onChange={event => { const beard = event.currentTarget.checked; setDesign(d => ({ ...d, beard })); setMessage("") }} />Short beard</label>
            {controls(["shadow", "ink"])}
          </Section>
          <Section {...section("Walking")}>
            <label className="person-choice">Walk style<select aria-label="Walk style" value={design.walkStyle} onChange={event => { const walkStyle = event.currentTarget.value as PersonDesign["walkStyle"]; setDesign(d => ({ ...d, walkStyle })); setMessage("") }}><option>Natural</option><option>Devotional</option></select></label>
            {controls(["stride"])}
            <Tuner label="Walk timing" labelClassName="w-28" value={fps} min={1} max={24} display={`${fps} fps`} onChange={setFps} />
          </Section>
          <Section {...section("Inspection")}>
            <label className="person-check"><input type="checkbox" checked={onion} onChange={e => setOnion(e.target.checked)} />Previous frame ghost</label>
            <label className="person-check"><input type="checkbox" checked={sides} onChange={e => setSides(e.target.checked)} />Track left / right</label>
            <label className="person-check"><input type="checkbox" checked={guides} onChange={e => setGuides(e.target.checked)} />Attachment guides</label>
            <div className="person-palette">{renderPalette.map((color, index) => <span key={`${index}-${color}`} title={color} style={{ background: color }} />)}</div>
            <p className="person-hint">{pixels} × {pixels} px cell · {renderPalette.length} colours<br />{sheetMatchesDesign ? `${bake.metadata.safePadding} px safe margin` : "Checking margins…"}</p>
          </Section>
          <Section {...section("Files", false)}>
            <div className="person-file-actions">
              <button className={button} onClick={() => openJson()}>Copy / paste JSON</button>
              <button className={button} onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({ ...design, templateVersion: BASE_PERSON.version }, null, 2) + "\n"], { type: "application/json" })); download(url, `person-design-v${BASE_PERSON.version}.json`); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>Download parameters</button>
              <label className={`${button} person-file-input`}>Load parameters<input aria-label="Load person parameters" type="file" accept="application/json,.json" onChange={async event => {
                const file = event.target.files?.[0]; event.target.value = ""
                if (!file) return
                try {
                  if (file.size > 262144) throw new Error("Parameter files must be under 256 KB.")
                  const loaded = JSON.parse(await file.text()); setDesign(restoreCharacterDesign(loaded, loaded?.templateVersion ?? 20)); setMessage("Parameters loaded. Preview them, then apply to road.")
                } catch (e) { setMessage(e instanceof Error ? e.message : "Invalid parameter file.") }
              }} /></label>
              <button className={button} disabled={!ready} onClick={() => bake && download(bake.walk, `base-person-v${BASE_PERSON.version}-walk.png`)}>Download walk sheet</button>
              <button className={button} disabled={!ready} onClick={() => bake && download(bake.idle, `base-person-v${BASE_PERSON.version}-idle.png`)}>Download idle sheet</button>
              <button className={button} disabled={!ready} onClick={() => bake && download(bake.shadowWalk, `base-person-v${BASE_PERSON.version}-shadow-walk.png`)}>Download walk shadows</button>
              <button className={button} disabled={!ready} onClick={() => download(url, `base-person-v${BASE_PERSON.version}-${clip}.png`)}>Download selected pose sheet</button>
              <button className={button} disabled={!ready} onClick={jsonDownload}>Download attachment data</button>
              <Link className={button} href="/assets/characters/callings">Earlier character drafts <ArrowUpRight size={12} /></Link>
            </div>
          </Section>
          </> : <>
            {isKnight && <Section {...section("Knight")}>
              <label className="person-choice">Pose<select aria-label="Knight pose" value={mountedKnight ? "mounted" : "foot"} onChange={e => { setMountedKnight(e.target.value === "mounted"); setFrame(0); setClip("walk") }}><option value="mounted">Mounted</option><option value="foot">On foot</option></select></label>
              <label className="person-choice">Build<select aria-label="Knight build" value={knightVariant} onChange={e => { setKnightVariant(Number(e.target.value)); setFrame(0) }}>{["Regular", "Tall", "Broad"].map((label, variant) => <option key={label} value={variant}>{label}</option>)}</select></label>
              <label className="person-check"><input type="checkbox" checked={showSquire} onChange={e => setShowSquire(e.target.checked)} />Following squire</label>
              <p className="person-hint">Mail armour and a nasal helmet, riding a noble horse. Knights dismount outside the shrine; the squire carries a shield, rolled cloak and supplies, and waits with the horse.</p>
            </Section>}
            {subject === "horse" && <Section {...section("Horse")}>
              <label className="person-choice">Variant<select aria-label="Horse variant" value={horseVariant} onChange={e => { setHorseVariant(e.target.value as HorseVariant); setFrame(0) }}><option value="common">Common horse</option><option value="noble">Noble horse</option></select></label>
              <p className="person-hint">{horseVariant === "noble" ? "Deep chest, strong haunches and a proud carriage. A powerful, deliberate walk." : "Lean, worn and lower-headed, with a measured, weary walk."}</p>
            </Section>}
            {subject === "donkey" && <p className="person-hint">A slightly stooped head and a slow, weighty plod.</p>}
            {animalKind && (!isKnight || mountedKnight) && <Section {...section("Coat")}><label className="person-choice">Natural coat<select aria-label="Animal coat" value={animalCoat(animalKind, coat).id} onChange={e => setCoat(e.target.value)}>{COATS[animalKind].map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
              {subject !== "cart" && !isKnight && <label className="person-check"><input type="checkbox" checked={grazing} onChange={e => { setGrazing(e.target.checked); setFrame(0) }} />Grazing</label>}
            </Section>}
            {subject === "cart" && <Section {...section("Cart")}>
              <label className="person-choice">Offering<select aria-label="Offering" value={cargo} onChange={e => { setCargo(e.target.value as Cargo); setFrame(0) }}>{CARGO.map(value => <option key={value}>{value}</option>)}</select></label>
              <label className="person-choice">Puller<select aria-label="Cart puller" value={cartPuller} onChange={e => { setCartPuller(e.target.value as Puller); setFrame(0) }}><option value="hand">Person</option><option value="donkey">Donkey</option><option value="horse">Horse</option></select></label>
              {cartPuller === "horse" && <label className="person-choice">Horse<select aria-label="Cart horse variant" value={horseVariant} onChange={e => setHorseVariant(e.target.value as HorseVariant)}><option value="common">Common</option><option value="noble">Noble</option></select></label>}
              <label className="person-choice" style={onMap ? { display: "none" } : undefined}>Setup<select aria-label="Cart setup" value={shopState} onChange={e => { setShopState(e.target.value as ShopState); setFrame(0) }}><option value="travel">Travelling</option><option value="opening">Opening shop</option><option value="trading">Open for business</option><option value="packing">Packing up</option></select></label>
              <p className="person-hint">Choose a merchant journey or turning scenario below the map. Compare turn radii, pause and scrub the motion, or follow the hitch and axle trails at game scale.</p>
            </Section>}
            {!onMap && <Section {...section("Animation")}><Tuner label="Timing" labelClassName="w-28" value={fps} min={1} max={24} display={`${(fps * animationRate).toFixed(1)} fps`} onChange={setFps} /></Section>}
            <Section {...section("Files")}><div className="person-file-actions">
              <a className={button} href={url} download>Download sprite sheet</a>
              <a className={button} href={isKnight ? `/textures/knights/${KNIGHT.version}/manifest.json` : `/textures/transport/${TRANSPORT.version}/manifest.json`} download>Download sheet metadata</a>
            </div><p className="person-hint">{pixels} × {pixels} px cell · {subject === "cart" ? CART.directions : 8} directions<br />{isKnight ? mountedKnight ? knightMetadata.safePadding : 4 : transportMetadata.safePadding} px safe margin</p></Section>
          </>}
        </div>
        {isPerson && <footer className="person-panel-footer">
          <p className="person-hint">Apply these proportions to the mixed crowd. Clothing keeps each calling’s color.</p>
          <button className={`${button} person-apply`} disabled={!ready} onClick={() => { if (bake) { applyDesign(design, bake); void usePopulationStore.getState().prepare(design); setMessage("Foundation saved. Road characters keep their calling colors and varied bodies.") } }}><Check size={14} />Apply to road</button>
          <button className={button} onClick={() => { usePersonDesignStore.getState().reset(); void usePopulationStore.getState().prepare(null); setDesign({ ...DEFAULT_DESIGN }); setMessage("Project default restored on the road.") }}><RotateCcw size={12} />Restore project default</button>
        </footer>}
      </aside>
      <div className="person-preview" aria-label="Character preview">
        <div className="person-preview-toolbar hud-well">
          <div className="person-playback"><button className="hud-pause" aria-label={playing ? "Pause" : "Play"} disabled={frameCount === 1 || view === "sheet"} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
            <label style={subject === "cart" ? { display: "none" } : undefined}>Clip<select aria-label="Animation clip" value={isKnight ? knightClip : clip} onChange={e => { setClip(e.target.value as BaseClip); setFrame(0) }}>{Object.entries(PERSON_CLIPS).filter(([id]) => isPerson || (isKnight && !mountedKnight && id in knightMetadata.person.frameCounts) || id === "walk" || id === "idle").map(([id, entry]) => <option key={id} value={id}>{entry.label}</option>)}</select></label>
            <label>{onMap ? "View" : "Zoom"}<select aria-label={onMap ? "Map framing" : "Pixel inspection zoom"} value={zoom} onChange={e => setZoom(Number(e.target.value))}>{(onMap ? [4, 6, 8] : ASSET_ZOOMS).map(n => <option key={n} value={n}>{onMap ? ({ 4: "Wide", 6: "Map", 8: "Close" } as Record<number, string>)[n] : `${n}×`}</option>)}</select></label>
          </div>
          <div className="person-view-buttons" aria-label="Preview modes">{isPerson && <><button className={button} disabled={!draftsReady} onClick={() => void copyJson()}>Copy edits as JSON</button><button className={button} aria-pressed={showRig} onClick={() => { setShowRig(!showRig); setView("character"); setPlaying(false) }}>Show rig</button></>}{subject === "cart" && <button className={button} aria-pressed={onMap} onClick={() => { setView("map"); if (zoom < 4) setZoom(6) }}>Small map</button>}{([['character', 'Character'], ['native', 'Native size'], ['sheet', 'Sprite sheet']] as const).map(([mode, label]) => <button key={mode} className={button} aria-pressed={view === mode} onClick={() => setView(mode)}>{label}</button>)}</div>
        </div>
        <div className="person-stage-layout"><div ref={stageRef} className={`person-stage person-stage-${view}${scrubbingViews ? " is-scrubbing" : ""}`}
          onPointerDown={event => {
            if (view !== "character" || event.button !== 0 || !event.isPrimary ||
              (event.target as Element).closest('[role="button"], button, input, select, a')) return
            event.preventDefault()
            viewDrag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, row, pan: event.shiftKey, offset: previewOffset }
            event.currentTarget.setPointerCapture(event.pointerId); setScrubbingViews(true)
          }}
          onPointerMove={event => {
            const start = viewDrag.current
            if (!start || start.pointer !== event.pointerId) return
            if (start.pan) { setPreviewOffset([start.offset[0] + event.clientX - start.x, start.offset[1] + event.clientY - start.y]); return }
            const steps = Math.trunc((event.clientX - start.x) / 48)
            const count = BASE_PERSON.directions.length
            setRow(((start.row + steps) % count + count) % count)
          }}
          onPointerUp={event => {
            if (viewDrag.current?.pointer !== event.pointerId) return
            viewDrag.current = null; setScrubbingViews(false)
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onLostPointerCapture={event => {
            if (viewDrag.current?.pointer === event.pointerId) { viewDrag.current = null; setScrubbingViews(false) }
          }}>
          {onMap ? <MerchantMapPreview playing={active && playing} row={row} zoom={zoom} cargo={cargo} puller={cartPuller} horseVariant={horseVariant} coat={coat} /> : isPerson && !bake && !preview ? <p className="person-stage-message">Rendering the base person…</p> : view === "sheet" ? <div className="person-sheet">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} width={pixels * columns} height={pixels * atlasRows} alt={`${SUBJECTS[subject]} ${clipLabel}: ${subject === "cart" ? CART.directions : 8} directions${subject === "horse" ? ", common and noble variants" : ""} and ${columns} frames`} />
          </div> : view === "native" ? <div className="person-native" aria-label="Native size lineup">
            {BASE_PERSON.directions.map((d, i) => <div key={d}>{isKnight && showSquire ? <KnightEntourage mounted={mountedKnight} row={i} frame={frame} variant={knightVariant} walking={knightClip === "walk"} url={url} visibleFrame={visibleFrame} columns={columns} cellSize={pixels} rows={atlasRows} name={`${d}, native Knight`} /> : <Tile url={url} shadowUrl={shadowUrl} row={rowOffset + i * directionStep} frame={visibleFrame} columns={columns} cellSize={pixels} rows={atlasRows} name={`${d}, native ${SUBJECTS[subject]}`} />}<span>{d}</span></div>)}
          </div> : isKnight && showSquire ? <KnightEntourage mounted={mountedKnight} row={row} frame={frame} variant={knightVariant} walking={knightClip === "walk"} url={url} visibleFrame={visibleFrame} columns={columns} cellSize={pixels} rows={atlasRows} zoom={fittedZoom} offset={previewOffset} name={`Knight ${direction}, frame ${step + 1}`} /> : <div className="person-sprite" style={{ width: pixels * fittedZoom, height: pixels * fittedZoom, transform: `translate(${previewOffset[0]}px, ${previewOffset[1]}px)` }}>
            {isPerson && onion && !live && columns > 1 && <div className="absolute inset-0 opacity-25"><Tile url={url} row={row} frame={(visibleFrame + columns - 1) % columns} columns={columns} zoom={fittedZoom} name="Previous frame ghost" /></div>}
            <Tile url={url} shadowUrl={shadowUrl} row={rowOffset + row * directionStep} frame={visibleFrame} columns={columns} cellSize={pixels} rows={atlasRows} zoom={fittedZoom} name={`${SUBJECTS[subject]} ${direction}, frame ${step + 1}`} />
            {isPerson && showRig && <RigOverlay joints={inspected} selected={selectedJoint} row={row} offset={currentOffset} onSelect={joint => { setSelectedJoint(joint); setPlaying(false) }} onChange={changeJoints} onDrag={rigDragging} />}
            {isPerson && guides && <svg aria-label="Origin and attachment guides" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${pixels} ${pixels}`}>
              <path d={`M${BASE_PERSON.anchor[0]} 0V${pixels} M0 ${BASE_PERSON.anchor[1]}H${pixels}`} stroke="#d9d5a7" strokeWidth="0.15" strokeDasharray="1 1" />
              {SOCKET_NAMES.map(name => {
                const point = sockets?.[name]
                return point ? <circle key={name} cx={point.x} cy={point.y} r="0.55" stroke="#1e2620" strokeWidth="0.15" fill={name.startsWith("left") ? "#329bc2" : name.startsWith("right") ? "#db7540" : "#eed66b"}><title>{name}</title></circle> : null
              })}
            </svg>}
          </div>}
          {isPerson && (error || storeError) && <p role="alert" className="person-stage-error">{error || storeError} Adjust the pose or undo to recover.</p>}
          {isPerson && !dragging && bakeProgress && <div className="person-stage-progress hud-well" role="status" aria-live="polite"><span>Updating sprite sheets · {Math.round(bakeProgress.done / bakeProgress.total * 100)}%</span><i style={{ width: `${bakeProgress.done / bakeProgress.total * 100}%` }} /></div>}
          <div className="person-stage-caption" style={onMap ? { display: "none" } : undefined}>{view === "native" ? "Actual pixels · 1×" : view === "sheet" ? `${SUBJECTS[subject]} atlas · ${columns * atlasRows} poses` : `${direction} · ${fittedZoom}×${view === "character" ? " · Drag left / right to turn · Shift-drag to pan · Scroll to zoom" : ""}`}</div>
        </div>
        {isPerson && showRig && <RigInspector joints={inspected} selected={selectedJoint} offset={currentOffset(selectedJoint as EditableJoint)} frame={frame} radius={radius} maxRadius={Math.max(1, Math.floor(PERSON_CLIPS[clip].frames / 2))} keyed={!!selectedKey} frameKeyed={frameKeyed(frame % PERSON_CLIPS[clip].frames)}
          onSelect={joint => { setSelectedJoint(joint); setPlaying(false) }} onChange={offset => changeJoint(selectedJoint as EditableJoint, offset)} onRadius={blend => changeJoint(selectedJoint as EditableJoint, currentOffset(selectedJoint as EditableJoint), blend)}
          onReset={() => commitPose(setPoseKey(design.poseEdits, clip, selectedJoint as EditableJoint, null, editFrame(selectedJoint as EditableJoint)))}
          onResetKey={() => changeJoint(selectedJoint as EditableJoint, [0, 0, 0])}
          onResetFrame={() => { const step = frame % PERSON_CLIPS[clip].frames; commitPose(step === 0 ? clearFrameKeys(design.poseEdits, clip, 0) : clearFrameKeys(setPoseKey(design.poseEdits, clip, "staffTip", null, editFrame("staffTip")), clip, step)) }}
          onResetClip={() => { const edits = { ...design.poseEdits }; delete edits[clip]; commitPose(edits) }}
          canUndo={history.length > 0} canRedo={future.length > 0}
          onUndo={() => { const previous = history.at(-1); if (previous) { setFuture(f => [...f, design.poseEdits ?? {}]); setHistory(h => h.slice(0, -1)); setDesign(d => ({ ...d, poseEdits: previous })) } }}
          onRedo={() => { const next = future.at(-1); if (next) { setHistory(h => [...h, design.poseEdits ?? {}]); setFuture(f => f.slice(0, -1)); setDesign(d => ({ ...d, poseEdits: next })) } }} />}
        </div>
        <CharacterAnimationDock directions={BASE_PERSON.directions} row={row} onDirection={next => { setRow(next); if (!onMap) setView("character") }}
          renderDirection={index => (!isPerson || bake) && (partialLive
            ? <Tile url={bakedSheet} shadowUrl={bakedShadow} row={index} frame={step} columns={PERSON_CLIPS[clip].frames} name={`${BASE_PERSON.directions[index]} direction`} />
            : <Tile url={url} shadowUrl={shadowUrl} row={rowOffset + index * directionStep} frame={visibleFrame} columns={columns} cellSize={pixels} rows={atlasRows} zoom={BASE_PERSON.cellSize / pixels} name={`${BASE_PERSON.directions[index]} direction`} />)}
          frameCount={frameCount} maxFrames={isPerson ? frameCount : 24} frame={step} clipLabel={clipLabel} showFrames={!onMap}
          keyed={step => isPerson && frameKeyed(step)}
          onFrame={next => { setFrame(next); setPlaying(false); setView("character") }} />
      </div>
    </div>
    <dialog ref={jsonDialog} className="person-json-dialog" aria-labelledby="person-json-title">
      <div className="person-panel-heading"><h2 id="person-json-title">Copy / paste character edits</h2><button className="hud-close" aria-label="Close JSON" onClick={() => jsonDialog.current?.close()}><X size={14} /></button></div>
      <div className="person-json-content">
        <p className="person-hint">Includes all saved characters, their proportions, and every pose key. Copy this JSON and paste it directly into the chat. To restore edits, paste JSON here and load it. Loading replaces matching characters and keeps the others.</p>
        <textarea ref={jsonArea} aria-label="Character edits JSON" spellCheck={false} value={jsonText} onChange={event => { setJsonText(event.target.value); setJsonMessage("") }} />
        <p role="status" className="person-hint">{jsonMessage}</p>
        <div className="person-json-actions"><button className={button} onClick={() => void copyJson(jsonText)}>Copy JSON</button><button className={button} onClick={() => { const url = URL.createObjectURL(new Blob([editsJson()], { type: "application/json" })); download(url, "character-edits.json"); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>Download all drafts</button><button className={button} onClick={loadJson}>Load JSON</button><button className={button} onClick={() => jsonDialog.current?.close()}>Close</button></div>
      </div>
    </dialog>
  </AssetEditorFrame>
}
