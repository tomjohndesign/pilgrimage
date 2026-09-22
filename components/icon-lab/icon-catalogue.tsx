"use client"

import { useContext, useState } from "react"
import { ChromeButton } from "../ui/chrome-controls"
import { WorkspaceSlots } from "../workspace-context"
import { AssetEditorHelp } from "../asset-editor-frame"
import type { IconAtlas, IconSheet } from "@/lib/game/resource-icons/bake"
import { ICON_THEMES, type IconTheme, type IconSize } from "@/lib/game/resource-icons/design"
import { ICON_CATALOGUE, type CatalogueIcon } from "./catalogue"
import styles from "./icon-lab.module.css"

export function CatalogueArtwork({ icon, sheet, size, scale = 1, label = "" }: { icon: CatalogueIcon; sheet: IconSheet | null; size: IconSize; scale?: number; label?: string }) {
  if (icon.kind === "ui") {
    const Icon = icon.component
    return <Icon size={size * scale} strokeWidth={2} aria-label={label || undefined} aria-hidden={!label} role={label ? "img" : undefined} />
  }
  const url = icon.kind === "illustrated" ? sheet?.[icon.id][size] : icon.url
  return url ? <img className={icon.kind === "illustrated" ? styles.icon : styles.artwork} src={url} width={size * scale} height={size * scale} alt={label} /> : <span className={styles.placeholder} style={{ width: size * scale, height: size * scale }} aria-label="Generating icon" />
}

/** A single inventory of illustrated game icons, every imported UI symbol and app artwork. */
export function IconCatalogue({ atlas, theme, size, filter, background, onSelect }: { atlas: IconAtlas | null; theme: IconTheme; size: IconSize; filter: string; background: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("")
  const slots = useContext(WorkspaceSlots)
  const icons = ICON_CATALOGUE.filter(icon => (filter === "all" || icon.kind === filter) && `${icon.label} ${icon.subject} ${icon.group} ${"sources" in icon ? icon.sources.join(" ") : ""}`.toLowerCase().includes(query.toLowerCase()))
  return <div className={`${styles.catalogue} ${styles.surface}`} data-background={background === "both" ? "workspace" : theme}>
    <div className={styles.catalogueHeading}>
      <label className="person-choice">Search all icons<input type="search" aria-label="Search all icons" placeholder="Name or use…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <span role="status">{icons.length} icons</span>
      <AssetEditorHelp label="Icon inventory">Illustrated icons share the game’s artwork; select one to compare your appearance draft with the shipped PNG. UI symbols come from the app’s remaining Lucide imports, including shared controls. App artwork includes the existing game SVGs and app icons.</AssetEditorHelp>
    </div>
    {["Resources", "Actions", "UI symbols", "App artwork"].map(group => {
      const items = icons.filter(icon => icon.group === group)
      return items.length > 0 && <section key={group} className={styles.catalogueGroup} aria-label={group}>
        <h2>{group}<span>{items.length}</span></h2>
        <div className={styles.grid}>{items.map(icon => <ChromeButton key={icon.id} className={styles.tile} aria-label={`Inspect ${icon.label}${icon.kind === "ui" ? " UI icon" : icon.kind === "artwork" ? " artwork" : " icon"}`} onClick={() => { onSelect(icon.id); slots?.setEntitySelected(true) }}>
          <span className={styles.tilePair}>{(background === "both" ? ICON_THEMES : [theme]).map(variant => <span key={variant} className={`${styles.tileSample} ${styles.surface}`} data-background={variant}><span className={styles.tileArt}><CatalogueArtwork icon={icon} sheet={atlas?.[variant] ?? null} size={size} /></span>{background === "both" && <small>{variant === "light" ? "Light" : "Dark"}</small>}</span>)}</span>
          <span>{icon.label}</span>
        </ChromeButton>)}</div>
      </section>
    })}
    {!icons.length && <p className={styles.empty}>No icons match your search.</p>}
  </div>
}
