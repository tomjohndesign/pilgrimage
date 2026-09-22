"use client"

import { useTheme } from "next-themes"
import { useEffect, useRef, useState } from "react"
import { AssetEditorFrame, AssetEditorContent, AssetEditorWorkspace, AssetEditorSection, type AssetEditorNavigation } from "../asset-editor-frame"
import { EntitySelect } from "../workspace-navigation"
import { ChromeButton, ChromeSelect } from "../ui/chrome-controls"
import { Tuner } from "../game/property-controls"
import { PreviewViewport } from "../preview-viewport"
import { ILLUSTRATED_ICONS, RESOURCE_ICONS, ACTION_ICONS, ICON_SIZES, ICON_THEMES, DEFAULT_ICON_DESIGN, type IconTheme, type IconDesign, type IconSize } from "@/lib/game/resource-icons/design"
import type { IconAtlas } from "@/lib/game/resource-icons/bake"
import { GAME_ICON_VERSION, gameIconUrl } from "@/lib/game/resource-icons/assets"
import { ICON_CATALOGUE, ICON_REPLACEMENTS } from "./catalogue"
import { CatalogueArtwork, IconCatalogue } from "./icon-catalogue"
import styles from "./icon-lab.module.css"

declare global {
  interface Window { __iconBake?: { atlas: IconAtlas; themes: typeof ICON_THEMES; design: IconDesign; icons: typeof ILLUSTRATED_ICONS; sizes: typeof ICON_SIZES } }
}

function download(url: string, name: string) {
  const link = document.createElement("a"); link.href = url; link.download = name; link.click()
}

/** App-wide icon studies, alongside the actual UI symbols and existing artwork. */
export function IconLab({ mode, onModeChange, active = true }: AssetEditorNavigation & { active?: boolean }) {
  const [selected, setSelected] = useState("all")
  const [design, setDesign] = useState<IconDesign>(DEFAULT_ICON_DESIGN)
  const [size, setSize] = useState<IconSize>(32)
  const [background, setBackground] = useState("both")
  const [filter, setFilter] = useState("all")
  const [atlas, setAtlas] = useState<IconAtlas | null>(null)
  const { resolvedTheme } = useTheme()
  const workspaceTheme: IconTheme = resolvedTheme === "light" ? "light" : "dark"
  const theme: IconTheme = background === "light" || background === "dark" ? background : workspaceTheme
  const [exportTheme, setExportTheme] = useState<IconTheme>("dark")
  const sheet = atlas?.[theme] ?? null
  const previewThemes = background === "both" ? ICON_THEMES : [theme]
  const [bakedKey, setBakedKey] = useState("")
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const preview = useRef<HTMLDivElement>(null)
  const key = JSON.stringify(design)
  const current = sheet !== null && bakedKey === key && !busy
  const icon = ICON_CATALOGUE.find(icon => icon.id === selected)
  const illustrated = icon?.kind === "illustrated"
  const counterpartId = illustrated ? Object.entries(ICON_REPLACEMENTS).find(([, id]) => id === icon.id)?.[0] : ICON_REPLACEMENTS[selected]
  const counterpart = ICON_CATALOGUE.find(item => item.id === counterpartId)
  const select = (id: string) => { setSelected(id); setNotice("") }

  // Export scripts use the same completed draft that is visible in this workspace.
  useEffect(() => {
    if (!active || !current || !sheet) return
    const bake = { atlas: atlas!, themes: ICON_THEMES, design, icons: ILLUSTRATED_ICONS, sizes: ICON_SIZES }
    window.__iconBake = bake
    return () => { if (window.__iconBake === bake) delete window.__iconBake }
  }, [active, current, sheet, atlas, design])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    setBusy(true); setError(""); setNotice("")
    const timer = setTimeout(() => {
      import("@/lib/game/resource-icons/bake").then(({ bakeResourceIcons }) => {
        if (cancelled) return
        const result = bakeResourceIcons(design)
        if (!cancelled) { setAtlas(result); setBakedKey(JSON.stringify(design)); setBusy(false) }
      }).catch(cause => { if (!cancelled) { setError(cause instanceof Error ? cause.message : "Could not generate icons."); setBusy(false) } })
    }, 120)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [active, design, attempt])

  async function exportStrip() {
    if (!current || !sheet) return
    try {
      const images = await Promise.all(ILLUSTRATED_ICONS.map(async icon => { const image = new Image(); image.src = atlas![exportTheme][icon.id][size]; await image.decode(); return image }))
      const canvas = Object.assign(document.createElement("canvas"), { width: size * images.length, height: size })
      images.forEach((image, index) => canvas.getContext("2d")!.drawImage(image, index * size, 0))
      download(canvas.toDataURL("image/png"), `illustrated-icons-${exportTheme}-${size}px-view-${design.view + 1}.png`)
      setNotice(`Exported ${images.length} illustrated icons in sidebar order.`)
    } catch { setNotice("Could not export the strip. Try again.") }
  }

  async function exportIcon() {
    if (!icon) return
    try {
      if (icon.kind === "illustrated") {
        if (!current) return
        download(atlas![exportTheme][icon.id][size], `${icon.id}-${exportTheme}-${size}px-view-${design.view + 1}.png`)
      } else {
        const image = new Image()
        if (icon.kind === "artwork") image.src = icon.url
        else {
          const element = preview.current?.querySelector("svg")
          if (!element) throw new Error()
          const svg = element.cloneNode(true) as SVGElement
          svg.setAttribute("xmlns", "http://www.w3.org/2000/svg")
          svg.setAttribute("width", String(size)); svg.setAttribute("height", String(size))
          svg.setAttribute("color", getComputedStyle(element).color)
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`
        }
        await image.decode()
        const canvas = Object.assign(document.createElement("canvas"), { width: size, height: size })
        const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight)
        const width = image.naturalWidth * scale, height = image.naturalHeight * scale
        canvas.getContext("2d")!.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
        download(canvas.toDataURL("image/png"), `${icon.id}-${size}px.png`)
      }
      setNotice(`${icon.label} PNG exported.`)
    } catch { setNotice("Could not export this icon. Try again.") }
  }

  const backgroundControl = <ChromeSelect aria-label="Preview background" value={background} onChange={event => setBackground(event.target.value)} options={[{ value: "both", label: "Light + dark" }, { value: "workspace", label: "Workspace" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
  const sizeControl = <ChromeSelect aria-label="Icon size" value={size} onChange={event => setSize(Number(event.target.value) as IconSize)} options={ICON_SIZES.map(value => ({ value: String(value), label: `${value} px` }))} />
  const catalogue = <IconCatalogue atlas={atlas} theme={theme} size={size} filter={filter} background={background} onSelect={select} />

  return <AssetEditorFrame mode={mode} onModeChange={onModeChange} label="App icon playground" version="" status={error || (busy ? "Generating illustrated icons…" : notice || `Game icons ${GAME_ICON_VERSION} · preview edits stay in this draft`)} detail="Inspect native sizes and compare appearance drafts with the icons shipped in the game. Settings stay in this playground draft.">
    <EntitySelect autoSelect value={selected} overview={<IconCatalogue atlas={atlas} theme={theme} size={size} filter="all" background={background} onSelect={select} />} options={[{ value: "all", label: "All icons" }, ...ICON_CATALOGUE.map(icon => ({ value: icon.id, label: icon.label, group: icon.group }))]} onChange={event => select(event.target.value)}
      renderIcon={option => { const item = ICON_CATALOGUE.find(icon => icon.id === option.value); return item ? <CatalogueArtwork icon={item} sheet={sheet} size={16} /> : null }} />
    {!icon ? <AssetEditorContent toolbar={<><ChromeSelect aria-label="Icon collection" value={filter} onChange={event => setFilter(event.target.value)} options={[{ value: "all", label: "All styles" }, { value: "illustrated", label: "Illustrated" }, { value: "ui", label: "UI symbols" }, { value: "artwork", label: "App artwork" }]} />{sizeControl}{backgroundControl}</>}>{catalogue}{error && <ChromeButton className="hud-action" onClick={() => setAttempt(value => value + 1)}>Generate again</ChromeButton>}</AssetEditorContent> :
      <AssetEditorWorkspace key={icon.kind} title="Icon" controlsOpen onControlsClose={() => {}}
        toolbar={<>{illustrated && ["wood", "gold", "stone"].includes(icon.id) && <ChromeSelect aria-label="Icon direction" value={design.view} onChange={event => setDesign(value => ({ ...value, view: Number(event.target.value) }))} options={["Front right", "Back right", "Back left", "Front left"].map((label, view) => ({ label, value: String(view) }))} />}{backgroundControl}</>}
        dock={null}
        controls={<>
          <AssetEditorSection title={illustrated ? "Appearance" : "Source"}>
            <label className="person-choice">Subject<span>{icon.subject}</span></label>
            {illustrated ? <>
              <Tuner label="Edge ink" value={design.ink} min={0} max={1} step={.1} display={`${Math.round(design.ink * 100)}%`} onChange={ink => setDesign(value => ({ ...value, ink }))} />
              {(icon.id === "faith" || icon.id === "renown") && <Tuner label="Glow" value={design.glow} min={0} max={1} step={.1} display={`${Math.round(design.glow * 100)}%`} onChange={glow => setDesign(value => ({ ...value, glow }))} />}
              <p className="person-hint">Shared lighting, rural materials and native-pixel edge ink. Each theme has its own contour palette. Portraits and action symbols face the viewer for small-size readability; timber, coins and stone can be rotated. Ink and glow settings apply to the illustrated collection.</p>
              <ChromeButton className="hud-action" onClick={() => { setDesign(DEFAULT_ICON_DESIGN); setAttempt(value => value + 1) }}>Reset appearance</ChromeButton>
            </> : <><span className={styles.sourceLabel}>{icon.kind === "ui" ? "Lucide · current UI" : "Bundled artwork"}</span><ul className={styles.sources}>{icon.sources.map(source => <li key={source}>{source}</li>)}</ul></>}
            {!illustrated && counterpart && <ChromeButton className="hud-action" onClick={() => select(counterpart.id)}>Inspect illustrated icon</ChromeButton>}
          </AssetEditorSection>
          <AssetEditorSection title="Export">
            <label className="person-choice">PNG size{sizeControl}</label>
            {illustrated && <label className="person-choice">Export theme<ChromeSelect aria-label="Export theme" value={exportTheme} onChange={event => setExportTheme(event.target.value as IconTheme)} options={ICON_THEMES.map(value => ({ value, label: value === "light" ? "Light" : "Dark" }))} /></label>}
            <ChromeButton className="hud-action" disabled={illustrated && !current} onClick={exportIcon}>Export {icon.label.toLowerCase()} PNG</ChromeButton>
            {illustrated && <ChromeButton className="hud-action" disabled={!current} onClick={exportStrip}>Export illustrated PNG strip</ChromeButton>}
            <p className="person-hint">Illustrated PNGs preserve their native pixels and transparent glow. The illustrated strip contains resources followed by actions in sidebar order. Current UI symbols export in the visible foreground colour.</p>
          </AssetEditorSection>
        </>}>
        <div className={styles.themePreviews}>{previewThemes.map(previewTheme => <div key={previewTheme} className={`${styles.preview} ${styles.surface}`} data-background={previewTheme} aria-busy={illustrated && busy}>
          <h2 className={styles.themeLabel}>{previewTheme === "light" ? "Light mode" : "Dark mode"}</h2><div className={styles.enlarged}><PreviewViewport><div ref={previewTheme === theme ? preview : undefined}><CatalogueArtwork icon={icon} sheet={atlas?.[previewTheme] ?? null} size={size} scale={4} label={`${icon.label} icon enlarged four times`} /></div></PreviewViewport><span className={styles.caption}>{size} px · 4× inspection{illustrated ? "" : " · current icon"}</span></div>
          <section className={styles.native} aria-label="Native icon sizes"><h2>Native sizes</h2><div className={styles.sizes}>{ICON_SIZES.map(value => <figure key={value}><CatalogueArtwork icon={icon} sheet={atlas?.[previewTheme] ?? null} size={value} label={`${icon.label} at ${value} pixels`} /><figcaption>{value} px</figcaption></figure>)}</div></section>
          {illustrated ? <section className={styles.comparison} aria-label="Style comparison"><span>In game · {GAME_ICON_VERSION}</span><img className={styles.icon} src={gameIconUrl(icon.id, size, previewTheme)} width={size} height={size} alt={`${icon.label} shipped in game`} /></section> : counterpart && <section className={styles.comparison} aria-label="Style comparison"><span>Illustrated icon</span><ChromeButton onClick={() => select(counterpart.id)} aria-label={`Inspect ${counterpart.label} comparison`}><CatalogueArtwork icon={counterpart} sheet={atlas?.[previewTheme] ?? null} size={size} /><span>{counterpart.label}</span></ChromeButton></section>}
          {illustrated && sheet && <section className={styles.resources} aria-label="App icon preview"><h2>{icon.group === "Resources" ? "Resource bar" : "App actions"} · {size} px</h2><div>{(icon.group === "Resources" ? RESOURCE_ICONS : ACTION_ICONS).map(item => <span key={item.id} title={item.label}><img className={styles.icon} src={atlas![previewTheme][item.id][size]} width={size} height={size} alt={item.label} /><span>{"count" in item ? item.count : item.label}</span></span>)}</div></section>}
          {error && <ChromeButton className="hud-action" onClick={() => setAttempt(value => value + 1)}>Generate again</ChromeButton>}
        </div>)}</div>
      </AssetEditorWorkspace>}
  </AssetEditorFrame>
}
