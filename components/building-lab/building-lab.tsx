"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BUILDING_STYLE, LEGACY_RECIPE, VARIANTS, buildingPrompt, recipeManifest, recipeSchema, type BuildingRecipe } from "@/lib/game/building-art/style"
import { AtlasPreview } from "./atlas-preview"
import { guideFile, atlasViewPng, validateAtlas, registeredAtlasPng } from "./image-files"
import { buildingGuideSvg, BUILDING_VIEWS } from "@/lib/game/building-art/projection"
import { studyRegistrations, registrationTransforms, type Registration, type Registrations, type Point } from "@/lib/game/building-art/registration"
import styles from "./building-lab.module.css"

const MapComparison = dynamic(() => import("./map-comparison").then((m) => m.MapComparison), { ssr: false })
import { PERSON_HEIGHT } from "@/lib/game/world-scale"
import type { CaptureMapGuide } from "./map-comparison"
const STORAGE = "pilgrimage-building-workshop-v2"
const LEGACY_STORAGE = "pilgrimage-building-workshop-v1"
type Result = { registrations: Registrations; source: "generated" | "imported"; image: string; recipe: BuildingRecipe; prompt: string; name: string }

function download(data: string, name: string, mime?: string) {
  const url = mime ? URL.createObjectURL(new Blob([data], { type: mime })) : data
  const link = document.createElement("a"); link.href = url; link.download = name; link.click()
  if (mime) setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function filename(recipe: BuildingRecipe) { return `${recipe.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "building"}-${recipe.variant}-view-${recipe.view}` }

/** Building art workbench, using the existing Assets design language.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0 — Building workshop — map comparison (1XY-0)
 */
export function BuildingLab() {
  const [recipe, setRecipe] = useState<BuildingRecipe>(LEGACY_RECIPE)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<"compare" | "concept" | "result">("compare")
  const [grid, setGrid] = useState(true)
  const [zoom, setZoom] = useState(1.15)
  const [compareSource, setCompareSource] = useState<"study" | "result">("study")
  const captureGuide = useRef<CaptureMapGuide | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const onGuideReady = useCallback((capture: CaptureMapGuide | null) => { captureGuide.current = capture; setMapReady(Boolean(capture)) }, [])
  const [allViews, setAllViews] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [corners, setCorners] = useState<Point[]>([])
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [reference, setReference] = useState<File | null>(null)
  const [referenceUrl, setReferenceUrl] = useState("")
  const [results, setResults] = useState<Result[]>([])
  const [selected, setSelected] = useState(0)
  const upload = useRef<HTMLInputElement>(null)
  const importRecipe = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const variant = (VARIANTS.find((v) => v.id === recipe.variant) ?? VARIANTS[0])
  const prompt = buildingPrompt(recipe)
  const result = results[selected]
  const imageRecipe = useMemo(() => compareSource === "result" && result ? result.recipe : { ...LEGACY_RECIPE, variant: recipe.variant }, [compareSource, result, recipe.variant])
  const imageRegistrations = useMemo(() => compareSource === "result" && result ? result.registrations : studyRegistrations(recipe.variant), [compareSource, result, recipe.variant])
  const comparisonImage = compareSource === "result" && result ? result.image : variant.image
  const imageLabel = compareSource === "result" && result ? "Your image" : "Saved study"
  const imageMatches = imageRecipe.width === recipe.width && imageRecipe.depth === recipe.depth && imageRecipe.wallHeight === recipe.wallHeight && imageRecipe.roofRise === recipe.roofRise && imageRecipe.variant === recipe.variant

  async function downloadMapGuide() {
    try {
      if (!captureGuide.current) throw new Error("The map is still loading. Try again in a moment.")
      const file = await captureGuide.current()
      const url = URL.createObjectURL(file)
      download(url, file.name); setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice("Map guide saved: the procedural building on game tiles, from all four angles.")
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not capture the map.") }
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE)
      const legacy = saved ? null : localStorage.getItem(LEGACY_STORAGE)
      if (saved || legacy) {
        const data = JSON.parse(saved ?? legacy!)
        if (legacy) { data.wallHeight = Math.max(0.8, data.wallHeight * 0.5); data.roofRise *= 0.5 }
        const parsed = recipeSchema.safeParse(data)
        if (parsed.success) setRecipe(parsed.data)
      }
    } catch { /* A blocked storage area still allows an in-memory workshop. */ }
    setReady(true)
    fetch("/api/buildings/generate").then((r) => r.json()).then((r) => setAvailable(r.available === true)).catch(() => setAvailable(false))
  }, [])
  useEffect(() => { if (ready) { try { localStorage.setItem(STORAGE, JSON.stringify(recipe)) } catch { /* Downloads remain available. */ } } }, [ready, recipe])
  useEffect(() => {
    if (!reference) { setReferenceUrl(""); return }
    const url = URL.createObjectURL(reference); setReferenceUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [reference])

  function update<K extends keyof BuildingRecipe>(key: K, value: BuildingRecipe[K]) { setRegistering(false); setCorners([]); setRecipe((r) => ({ ...r, [key]: value })) }
  function acceptReference(file?: File) {
    if (!file) return
    if (file.size > 8 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setNotice("Choose a PNG, JPEG or WebP reference under 8 MB."); return }
    setReference(file); setNotice("Reference added. Generation will use it for the shared visual style.")
  }
  async function exportStudy(currentView=false) {
    try {
      const atlas=await registeredAtlasPng(variant.image,{...LEGACY_RECIPE,variant:recipe.variant},studyRegistrations(recipe.variant))
      download(currentView ? await atlasViewPng(atlas,recipe.view) : atlas,`hovel-${recipe.variant}-${currentView?BUILDING_VIEWS[recipe.view].name.toLowerCase():"registered-atlas"}-v4.png`)
    } catch(error) {setNotice(error instanceof Error?error.message:"Could not export this study.")}
  }
  async function useConcept() {
    try {
      const response = await fetch(variant.image)
      if (!response.ok) throw new Error()
      const blob = await response.blob()
      acceptReference(new File([blob], `${variant.id}.png`, { type: "image/png" }))
    } catch { setNotice("Could not load the concept reference.") }
  }
  async function generate() {
    if (busyRef.current) return
    if (!captureGuide.current) { setNotice("Wait for the map preview to load before generating."); return }
    const valid = recipeSchema.safeParse(recipe)
    if (!valid.success) { setNotice("Give the building a subject and valid dimensions before generating."); return }
    busyRef.current = true; setRegistering(false); setCorners([]); setBusy(true); setNotice("Generating all four isometric views. This can take a few minutes…")
    const snapshot = { ...valid.data }
    try {
      const body = new FormData(); body.set("recipe", JSON.stringify(snapshot)); body.set("guide", await captureGuide.current()); if (reference) body.set("reference", reference)
      else { const response = await fetch(variant.image); if (!response.ok) throw new Error("Could not load the selected style study."); body.set("reference", new File([await response.blob()], "building-style-study.png", { type: "image/png" })) }
      const response = await fetch("/api/buildings/generate", { method: "POST", body })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Generation failed.")
      await validateAtlas(payload.image)
      setResults((r) => [{ registrations: [null,null,null,null], source: "generated" as const, image: payload.image, prompt: payload.prompt, recipe: snapshot, name: `${filename(snapshot)}-${Date.now()}` }, ...r].slice(0, 8))
      setSelected(0); setCompareSource("result"); setTab("compare"); setNotice("Your illustration is on the map. Rotate to compare all four angles. Use Your sprites to fine-tune the ground fit before exporting.")
    } catch (error) { setNotice(error instanceof Error ? error.message : "Generation failed. Your recipe is preserved.") }
    finally { busyRef.current = false; setBusy(false) }
  }
  function registerPoint(point: Point) {
    if (!result) return
    const next=[...corners,point]
    if(next.length<4) {setCorners(next);return}
    try {
      const registration=next as Registration
      registrationTransforms(result.recipe,recipe.view,registration)
      setResults((results)=>results.map((item,i)=> i===selected ? {...item,registrations:item.registrations.map((r,j)=>j===recipe.view?registration:r)} : item))
      setRegistering(false);setCorners([]);setGrid(true)
      setNotice(`${BUILDING_VIEWS[recipe.view].name} fitted to the isometric grid. Check the outline and repeat for the remaining views.`)
    } catch(error) {setCorners([]);setNotice(error instanceof Error?error.message:"Choose the ground corners again.")}
  }
  async function exportAtlas(currentView=false) {
    if(!result)return
    try {
      const atlas=await registeredAtlasPng(result.image,result.recipe,result.registrations)
      download(currentView ? await atlasViewPng(atlas,recipe.view) : atlas,`${result.name}-${currentView?BUILDING_VIEWS[recipe.view].name.toLowerCase():"registered-atlas"}.png`)
    } catch(error) {setNotice(error instanceof Error?error.message:"Could not export the atlas.")}
  }
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); setNotice("Prompt copied. Supply the isometric guide as image 1 and your style reference as image 2.") }
    catch { setNotice("Clipboard unavailable. Select and copy the prompt below.") }
  }
  async function loadRecipe(file?: File) {
    if (!file) return
    try {
      if (file.size > 64_000) throw new Error()
      const data = JSON.parse(await file.text())
      const imported = data.recipe ?? data
      if (data.style === "pilgrimage-buildings-v2") { imported.wallHeight = Math.max(0.8, imported.wallHeight * 0.5); imported.roofRise *= 0.5 }
      const parsed = recipeSchema.parse(imported)
      setRecipe(parsed); setRegistering(false); setCorners([]); setNotice("Recipe restored.")
    } catch { setNotice("That file is not a valid building recipe.") }
  }

  return <main className={styles.lab}>
    <header className={styles.header}>
      <Link href="/assets/characters?asset=buildings" className={styles.eyebrow}>← Buildings playground</Link>
      <p className={styles.intro}>Illustrated references and earlier experiments. Buildings in the game use the procedural model; these studies inform its palette and materials.</p>
      <div className={styles.headingRow}><div><p className={styles.eyebrow}>The art workshop · Ink & thatch</p><h1>Build it on the map</h1></div><span className={styles.badge}>Four isometric views · Image Gen 2</span></div>
      <p className={styles.intro}>Shape the building on the left. Compare its illustrated version on the same game tiles on the right. Rotate and zoom both together, then generate a new illustration from your design.</p>
    </header>

    <div className={styles.workspace}>
      <aside className={styles.controls}>
        <div className={styles.sectionTitle}><span>01 / The building</span><button onClick={() => { setRecipe(LEGACY_RECIPE); setRegistering(false); setCorners([]); setNotice("Recipe reset.") }}>Reset</button></div>
        <label>Subject<input value={recipe.subject} maxLength={160} onChange={(e) => update("subject", e.target.value)} /></label>
        <label>Silhouette<select value={recipe.variant} onChange={(e) => update("variant", e.target.value as BuildingRecipe["variant"])}>{VARIANTS.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        <div className={styles.twoColumns}>{(["width", "depth"] as const).map((key) => <label key={key}>{key === "width" ? "Building width" : "Building depth"}<select value={recipe[key]} onChange={(e) => update(key, Number(e.target.value))}>{Array.from({ length: 3 }, (_, i) => i + 3).map((n) => <option key={n} value={n}>{n} tiles</option>)}</select></label>)}</div>
        <label>Wall height <span>{(recipe.wallHeight / PERSON_HEIGHT).toFixed(1)} × person</span><input type="range" min="0.8" max="1.4" step="0.05" value={recipe.wallHeight} onChange={(e) => update("wallHeight", Number(e.target.value))} /></label>
        <label>Roof rise <span>{(recipe.roofRise / PERSON_HEIGHT).toFixed(1)} × person</span><input type="range" min="0.3" max="1.5" step="0.025" value={recipe.roofRise} onChange={(e) => update("roofRise", Number(e.target.value))} /></label>
        <button className={styles.primary} onClick={generate} disabled={!available || busy || !mapReady || !recipe.subject.trim()}>{busy ? "Drawing four views…" : "Generate illustrated version ↗"}</button>
        <p className={styles.help}>{available ? "Uses the procedural building on these map tiles as its guide. Generates all four angles; billed to your local OpenAI API account." : "To generate here, set OPENAI_API_KEY in .env.local and restart the local dev server. Prompt export works everywhere."}</p>
        <button className={styles.secondary} onClick={downloadMapGuide} disabled={!mapReady}>Download map guide · four angles ↓</button>
        <button className={styles.secondary} onClick={copyPrompt}>Copy Image Gen 2 prompt</button>
        <details className={styles.options}><summary>Style & image options</summary><div>
        <label>Character & details<textarea rows={4} maxLength={2000} value={recipe.notes} onChange={(e) => update("notes", e.target.value)} /></label>
        <label>Output<select value={recipe.output} onChange={(e) => update("output", e.target.value as BuildingRecipe["output"])}><option value="concept">Concept · warm ivory</option><option value="sprite">Sprite · transparent PNG</option></select></label>
        <div className={styles.reference}>
          {referenceUrl && <img src={referenceUrl} alt="Chosen style reference" />}
          <div><p>{reference ? reference.name : "Uses the selected study for style unless you add a reference."}</p><button onClick={() => upload.current?.click()}>{reference ? "Replace reference" : "Add style reference"}</button>{reference && <button onClick={() => setReference(null)}>Remove</button>}</div>
          <input ref={upload} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => { acceptReference(e.target.files?.[0]); e.target.value = "" }} />
        </div>
        </div></details>
      </aside>

      <section className={styles.workbench} aria-label="Building previews">
        <div className={styles.stageHeader}><div className={styles.tabs}>{([['compare','On the map'],['concept','Art & exports'],['result','Your sprites']] as const).map(([id, title]) => <button key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setRegistering(false); setCorners([]) }}>{title}</button>)}</div><span>Four views · {tab === "concept" ? "5 × 5" : `${recipe.width} × ${recipe.depth}`} plot</span></div>
        <div className={styles.viewBar}>
          <button hidden={tab === "compare"} aria-pressed={allViews && tab !== "compare"} onClick={() => setAllViews(true)} disabled={tab === "compare" || registering}>All four</button>
          {BUILDING_VIEWS.map((view) => <button key={view.id} aria-pressed={(!allViews || tab === "compare") && recipe.view === view.id} onClick={() => { update("view", view.id); setAllViews(false); setRegistering(false); setCorners([]) }}>{view.name}</button>)}
          <label><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Isometric grid</label>
        </div>
        <div hidden={tab !== "compare"}>
          <div className={styles.compareToolbar}>
            <span>Same terrain · same camera · gold line = building footprint</span>
            <label>Zoom both <input type="range" min="0.75" max="1.7" step="0.05" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
          </div>
          <MapComparison recipe={recipe} imageRecipe={imageRecipe} image={comparisonImage} registrations={imageRegistrations} label={imageLabel} grid={grid} zoom={zoom} onGuideReady={onGuideReady} />
          <div className={styles.compareHelp}>
            <p>{imageMatches ? "Change the shape to update the procedural building. Generate an illustration when you like it." : `Your draft has changed. The illustration keeps its original ${imageRecipe.width} × ${imageRecipe.depth} plot and dimensions until you generate a new version.`}</p>
            <p>{imageRecipe.output === "concept" ? "Paper is hidden in this map preview; the original artwork is preserved." : "Transparent artwork is placed at its shared ground anchor."}{compareSource === "result" && result && result.registrations.some(r => !r?.[3]) ? " New image: ground fit still needs checking in Your sprites." : ""}</p>
            {result && <div><button aria-pressed={compareSource === "study"} onClick={() => setCompareSource("study")}>Show saved study</button><button aria-pressed={compareSource === "result"} onClick={() => setCompareSource("result")}>Show your latest image</button><button onClick={() => { setTab("result"); setAllViews(false) }}>Adjust image fit & export →</button></div>}
          </div>
        </div>
        <div hidden={tab === "compare"} className={`${styles.stage} ${tab === "result" ? styles.checker : ""}`}>
          {tab === "concept" && <AtlasPreview image={variant.image} recipe={{ ...LEGACY_RECIPE, variant: recipe.variant }} view={recipe.view} allViews={allViews} grid={grid} registrations={studyRegistrations(recipe.variant)} />}
          {tab === "result" && (result ? <AtlasPreview image={result.image} recipe={result.recipe} view={recipe.view} allViews={allViews} grid={grid && !registering} registrations={registering ? undefined : result.registrations} onRegisterPoint={registering ? registerPoint : undefined} points={corners} /> : <div className={styles.empty}><span className={styles.eyebrow}>A place for the next building</span><h2>Your village starts here.</h2><p>Generate all four angles, or import a 2×2 atlas to inspect its grid alignment and transparency.</p><label className={styles.secondary}>Import four-view atlas<input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => {
            const file = e.target.files?.[0]; if (!file) return
            if (file.size > 8 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setNotice("Choose a PNG, JPEG or WebP under 8 MB."); return }
            const reader = new FileReader(); reader.onload = async () => { try { await validateAtlas(String(reader.result)) } catch (error) { setNotice(error instanceof Error ? error.message : "Invalid atlas."); return } setResults((r) => [{ registrations: [null,null,null,null], source: "imported" as const, image: String(reader.result), recipe: { ...recipe }, prompt, name: file.name.replace(/\.[^.]+$/, "") }, ...r].slice(0,8)); setSelected(0); setCompareSource("result"); setTab("compare"); setNotice("Your illustration is on the map using the current draft’s scale. Use Your sprites to adjust its ground fit.") }; reader.readAsDataURL(file)
          }} /></label></div>)}
        </div>
        <div hidden={tab === "compare"} className={styles.stageFooter}>
          {tab === "concept" && <><span>5 × 5 · SE / NE / NW / SW · ivory atlas</span><button onClick={() => download(JSON.stringify({ ...recipeManifest({ ...LEGACY_RECIPE, variant: recipe.variant }), sourceImage: variant.image, sourceGenerationRecord: variant.manifest, generation: null, sourceRegistrations: studyRegistrations(recipe.variant), provenance: "Existing illustrated study refitted to the current tile footprint. Original generation provenance is in sourceGenerationRecord. Exported PNGs already apply sourceRegistrations." }, null, 2), `hovel-${recipe.variant}-fitted-recipe.json`, "application/json")}>Study recipe ↓</button><button onClick={() => exportStudy()}>Export fitted atlas ↓</button><button onClick={() => exportStudy(true)}>Current view ↓</button><button onClick={useConcept}>Use as style reference ↗</button></>}
          {tab === "result" && result && <><span>{result.recipe.subject} · {result.recipe.width} × {result.recipe.depth}</span><button onClick={() => { setRegistering(!registering);setCorners([]);setAllViews(false);setNotice("Click the left, nearest and right foundation corners, then the eave directly above the nearest corner. The eave sets the wall height against the character scale.") }}>{registering ? `Cancel · ${corners.length}/4 points` : `Fit ${BUILDING_VIEWS[recipe.view].name} to grid`}</button><span>{result.registrations.filter(r => r?.[3]).length}/4 views fitted</span><button disabled={result.registrations.filter(r => r?.[3]).length!==4} onClick={() => exportAtlas()}>Export atlas ↓</button><button disabled={result.registrations.filter(r => r?.[3]).length!==4} onClick={() => exportAtlas(true)}>Current view ↓</button><button onClick={() => download(JSON.stringify({ ...recipeManifest(result.recipe), source: result.source, sourceRegistrations: result.registrations, exportedPixels: "Registered to the game grid; do not reapply sourceRegistrations to exported PNGs.", validation: { status: result.registrations.filter(r => r?.[3]).length === 4 ? "four-views-registered" : "registration-incomplete", requiresVisualReview: true }, generation: result.source === "imported" ? null : recipeManifest(result.recipe).generation, prompt: result.prompt, provenance: result.source === "imported" ? "Imported image; attached recipe is a draft, not original generation provenance." : "Generated in the local workshop." }, null, 2), `${result.name}.json`, "application/json")}>Recipe ↓</button></>}
        </div>
        {tab === "result" && results.length > 0 && <div className={styles.history}>{results.map((r, i) => <button key={`${r.name}-${i}`} aria-pressed={selected === i} onClick={() => { setSelected(i);setRegistering(false);setCorners([]) }}><img src={r.image} alt={r.recipe.subject} /></button>)}<p>Last eight images in this tab’s session. Download to keep.</p></div>}
        <div className={styles.variantHeading}><span className={styles.eyebrow}>Three beginnings for the relic hovel</span><span>Choose a study to explore</span></div>
        <div className={styles.variants}>{VARIANTS.map((v, i) => <button key={v.id} className={recipe.variant === v.id ? styles.activeVariant : ""} onClick={() => { update("variant", v.id); setCompareSource("study"); setTab("compare") }}><div className={styles.variantImage}><AtlasPreview image={v.image} recipe={{ ...LEGACY_RECIPE, variant: v.id }} view={0} closeup registrations={studyRegistrations(v.id)} /></div><div><span className={styles.eyebrow}>0{i + 1} / {v.id}</span><h3>{v.name}</h3><p>{v.description}</p></div></button>)}</div>
      </section>
    </div>

    {registering && <p className={styles.notice}>Register {BUILDING_VIEWS[recipe.view].name}: click {corners.length === 0 ? "the left ground corner" : corners.length === 1 ? "the nearest ground corner" : corners.length === 2 ? "the right ground corner" : "the eave above the nearest corner"} of the foundation. ({corners.length}/4)</p>}
    <p className={styles.notice} role="status" aria-live="polite">{notice || "The two scenes use the game’s terrain, roads, trees and travelers. Your building settings save in this browser."}</p>
    <section className={styles.styleGuide}>
      <div><p className={styles.eyebrow}>03 / A shared visual language</p><h2>Built from the same materials.</h2><p>Use geometry for structure, silhouettes and camera rotation. Use sprites for illustrated character and fine material detail. Both begin with this palette and camera.</p><div className={styles.swatches}>{Object.entries(BUILDING_STYLE.palette).map(([name, color]) => <div key={name}><span style={{ background: color }} /><small>{name}</small><code>{color}</code></div>)}</div></div>
      <ol>{BUILDING_STYLE.principles.map((p) => <li key={p}>{p}</li>)}</ol>
    </section>
    <details className={styles.prompt}><summary>Generation recipe <span>{BUILDING_STYLE.id}</span></summary><p>The geometry seed changes the procedural reeds. Image Gen 2 uses the style prompt and reference; it does not reproduce a deterministic seed. Every generation captures the actual procedural model on game terrain in four isometric views. The exported recipe records all four cell bounds, the shared anchor and tile projection. Check generated pixels against the overlay before entering the game.</p><textarea aria-label="Image Gen 2 prompt" readOnly value={prompt} rows={14} /><div><button onClick={copyPrompt}>Copy prompt</button><button onClick={() => download(buildingGuideSvg(recipe), `${filename(recipe)}-isometric-guide.svg`, "image/svg+xml")}>Grid guide SVG ↓</button><button onClick={async () => { try { const file = await guideFile(recipe); const url = URL.createObjectURL(file); download(url, "isometric-four-view-guide.png"); setTimeout(() => URL.revokeObjectURL(url), 1000) } catch { setNotice("Could not prepare the guide.") } }}>Grid guide PNG ↓</button><button onClick={() => download(JSON.stringify(recipeManifest(recipe), null, 2), `${filename(recipe)}.json`, "application/json")}>Export recipe ↓</button><button onClick={() => importRecipe.current?.click()}>Import recipe ↑</button><input type="file" ref={importRecipe} hidden accept="application/json,.json" onChange={(e) => { loadRecipe(e.target.files?.[0]); e.target.value = "" }} /><a href="/assets/buildings/style-guide.md" download>Style guide ↓</a></div></details>
    <footer className={styles.footer}><Link href="/play">Visit the relic hovel →</Link><a href="https://developers.openai.com/api/docs/guides/image-generation" target="_blank" rel="noreferrer">Image Gen 2 documentation ↗</a></footer>
  </main>
}
