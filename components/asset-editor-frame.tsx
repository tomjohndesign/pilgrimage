"use client"

import { Children, Fragment, cloneElement, createContext, isValidElement, useContext, useId, useState, type ReactNode, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowUpRight, Shuffle, SlidersHorizontal, X, Info } from "lucide-react"
import "./game/game-hud.css"
import "./base-person-lab.css"

import { TERRAIN } from "@/lib/game/map/terrain"
import { PLAYGROUND_TOOLS, type PlaygroundTool } from "@/lib/asset-playground"
import * as Tooltip from "@radix-ui/react-tooltip"
import { HudHelp } from "./game/hud-controls"

export const REFERENCE_PAGES = [
  { id: "docs", label: "Design document", href: "/docs" },
  { id: "specs", label: "Game specifications", href: "/docs/game-specs" },
  { id: "changelog", label: "Changelog", href: "/changelog" },
] as const

export type AssetEditorMode = PlaygroundTool
export interface AssetEditorNavigation { mode: AssetEditorMode; onModeChange: (mode: AssetEditorMode) => void }

/** Shared character-playground frame, controls drawer and asset switch.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/81D-0 — Characters
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/930-0 — Buildings
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/AY5-0 — Mobile · controls drawer
 */
export function AssetEditorFrame({ mode, onModeChange, controlsOpen, onControlsToggle, roadHref = "/play", label, status, detail, children, onRandomize, randomizeDisabled }: AssetEditorNavigation & {
  onRandomize?: () => void; randomizeDisabled?: string;
  version: string; controlsOpen?: boolean; onControlsToggle?: () => void; roadHref?: string;
  label: string; status: ReactNode; detail: ReactNode; children: ReactNode
}) {
  return <WorkspaceFrame selection={mode} onToolChange={onModeChange} title="Playground" label={label} status={status} detail={detail}
    controlsOpen={controlsOpen} onControlsToggle={onControlsToggle} roadHref={roadHref}
    actions={onRandomize && <button className="hud-action" aria-label="Randomize" onClick={onRandomize} disabled={!!randomizeDisabled} title={randomizeDisabled ?? "Randomize map appearance"}><Shuffle size={14} /><span className="asset-randomize-label">Randomize</span></button>}>
    {children}
  </WorkspaceFrame>
}

/** Common navigation and chrome for every screen outside the running game. */
export function WorkspaceFrame({ selection, title, label, status, detail, children, onToolChange, controlsOpen, onControlsToggle, roadHref = "/play", actions }: {
  selection: string; title: string; label: string; status?: ReactNode; detail?: ReactNode; children: ReactNode;
  onToolChange?: (tool: PlaygroundTool) => void; controlsOpen?: boolean; onControlsToggle?: () => void; roadHref?: string; actions?: ReactNode
}) {
  const router = useRouter()
  const tool = PLAYGROUND_TOOLS.find(item => item.id === selection)
  return <Tooltip.Provider delayDuration={250}><section className="game-hud person-editor" aria-label={label} style={{ "--workspace-grass": TERRAIN.grass.color } as CSSProperties}>
    <header className="person-header">
      <div className="person-title"><Link href="/" className="hud-action" aria-label="Back to menu"><ArrowLeft size={14} /><span className="asset-back-label">Menu</span></Link><h1>{title}</h1></div>
      <label className="person-choice asset-mode-toggle"><span className="sr-only">Workspace</span>
        <select aria-label={onToolChange ? "Playground tool" : "Workspace page"} value={selection} onChange={event => {
          const page = REFERENCE_PAGES.find(item => item.id === event.target.value)
          if (page) router.push(page.href)
          else if (onToolChange) onToolChange(event.target.value as PlaygroundTool)
          else router.push(`/assets?asset=${event.target.value}`)
        }}>
          <optgroup label="Playground">{PLAYGROUND_TOOLS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>
          <optgroup label="Reference">{REFERENCE_PAGES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>
        </select>
      </label>
      {tool && <AssetEditorHelp label={tool.label}>{tool.help}</AssetEditorHelp>}
      <nav aria-label="Editor navigation">{actions}{onControlsToggle && <button className="hud-action person-controls-toggle" aria-label="Controls" aria-expanded={controlsOpen} onClick={onControlsToggle}><SlidersHorizontal size={14} /><span className="asset-controls-label">Controls</span></button>}<Link className="hud-action" aria-label="On the road" href={roadHref}><span className="person-road-label">On the road</span><ArrowUpRight size={14} /></Link></nav>
    </header>
    {children}
    <footer className="person-status"><span role="status">{status}</span><span className="person-status-detail">{detail}</span></footer>
  </section></Tooltip.Provider>
}

/** A full-width workspace for forms, catalogues and reading, with the same toolbar and sections. */
export function AssetEditorContent({ toolbar, children }: { toolbar?: ReactNode; children: ReactNode }) {
  return <div className="workspace-content">
    {toolbar && <div className="person-preview-toolbar hud-well">{toolbar}</div>}
    <div className="workspace-content-scroll">{children}</div>
  </div>
}

const CanvasControlsContext = createContext<HTMLDivElement | null>(null)

/** Preview-specific controls join the same dock as directions and animation frames.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/AM2-0 — Merchant journey · canvas dock
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/AUG-0 — Mobile · merchant journey
 */
export function AssetEditorCanvasControls({ children }: { children: ReactNode }) {
  const target = useContext(CanvasControlsContext)
  return target ? createPortal(children, target) : null
}

/** The character/building workspace layout, also used by simulation tools. */
export function AssetEditorWorkspace({ title, controlsOpen, onControlsClose, controls, controlsHeading, controlsHeader, controlsFooter, toolbar, dock, children }: {
  title: string; controlsOpen: boolean; onControlsClose: () => void; controls: ReactNode;
  controlsHeading?: ReactNode; controlsHeader?: ReactNode; controlsFooter?: ReactNode;
  toolbar: ReactNode; dock: ReactNode; children: ReactNode
}) {
  const [canvasControls, setCanvasControls] = useState<HTMLDivElement | null>(null)
  const footerHelp: ReactNode[] = []
  const footer = sectionContent(controlsFooter, footerHelp)
  return <div className="person-workspace">
    <aside className={`person-controls hud-well ${controlsOpen ? "is-open" : ""}`} aria-label={`${title} controls`}>
      <div className="person-panel-heading">{controlsHeading ?? <span>{title}</span>}{footerHelp.length > 0 && <AssetEditorHelp label="Saving changes">{footerHelp}</AssetEditorHelp>}<button type="button" className="hud-close person-controls-toggle" aria-label="Close controls" onClick={onControlsClose}><X size={14} /></button></div>
      {controlsHeader}
      <div className="person-controls-scroll"><AssetEditorPanels>{controls}</AssetEditorPanels></div>
      {footer}
    </aside>
    <div className="person-preview" aria-label={`${title} preview`}>
      <div className="person-preview-toolbar hud-well">{toolbar}</div>
      <CanvasControlsContext.Provider value={canvasControls}>{children}</CanvasControlsContext.Provider>
      <div className="workspace-canvas-dock"><div ref={setCanvasControls} />{dock}</div>
    </div>
  </div>
}

/** Small help trigger, available by hover, keyboard focus, or tap. */
export function AssetEditorHelp({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <HudHelp className="workspace-tooltip" open={open} onOpenChange={setOpen} content={<div className="playground-help-content">{children}</div>}>
    <button type="button" className="playground-help" aria-label={`Help: ${label}`} onClick={() => setOpen(value => !value)}><Info size={14} /></button>
  </HudHelp>
}

type SectionProps = { title: string; children: ReactNode; initialOpen?: boolean }

/** Keep explanatory prose in section help; live status and interactive content stay visible. */
function sectionContent(children: ReactNode, help: ReactNode[]): ReactNode {
  return Children.map(children, child => {
    if (!isValidElement<{ children?: ReactNode; className?: string; role?: string; "data-testid"?: string }>(child)) return child
    const { children: nested, role, className, "data-testid": testId } = child.props
    if (role || testId || (typeof child.type !== "string" && child.type !== Fragment)) return child
    if (child.type === "p" && (className?.includes("person-hint") || className?.includes("text-ink-light"))) {
      help.push(<Fragment key={help.length}>{child}</Fragment>)
      return null
    }
    return nested ? cloneElement(child, {}, sectionContent(nested, help)) : child
  })
}

/** A control group in the shared sub-navigation, without another card or accordion. */
export function AssetEditorSection({ title, children }: SectionProps) {
  const help: ReactNode[] = []
  const content = sectionContent(children, help)
  return <section className="playground-control-section" aria-label={title}>
    <div className="playground-section-heading"><h2>{title}</h2>{help.length > 0 && <AssetEditorHelp label={title}>{help}</AssetEditorHelp>}</div>
    <div className="person-file-actions">{content}</div>
  </section>
}

/** Conditional sections and fragments form one flat, keyboard-accessible set of tabs. */
export function AssetEditorPanels({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState("")
  const id = useId()
  const panels = new Map<string, ReactNode[]>()
  const persistent: ReactNode[] = []
  const collect = (nodes: ReactNode) => Children.forEach(nodes, node => {
    if (!isValidElement<SectionProps>(node)) { if (node) persistent.push(node); return }
    if (node.type === Fragment) collect(node.props.children)
    else if (node.type === AssetEditorSection) {
      const items = panels.get(node.props.title) ?? []
      items.push(<Fragment key={items.length}>{node.props.children}</Fragment>); panels.set(node.props.title, items)
    } else persistent.push(node)
  })
  collect(children)
  const titles = [...panels.keys()]
  const current = panels.has(selected) ? selected : titles[0]
  return <>
    {persistent}
    {titles.length > 1 && <div className="playground-subnav" role="tablist" aria-label="Control sections">
      {titles.map((title, index) => <button key={title} type="button" role="tab" id={`${id}-tab-${index}`}
        aria-selected={current === title} aria-controls={`${id}-panel`} tabIndex={current === title ? 0 : -1}
        onClick={() => setSelected(title)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (index + 1) % titles.length : event.key === "ArrowLeft" ? (index + titles.length - 1) % titles.length : event.key === "Home" ? 0 : event.key === "End" ? titles.length - 1 : null
          if (next === null) return
          event.preventDefault(); setSelected(titles[next]); document.getElementById(`${id}-tab-${next}`)?.focus()
        }}>{title}</button>)}
    </div>}
    {current && <div role="tabpanel" id={`${id}-panel`} aria-labelledby={titles.length > 1 ? `${id}-tab-${titles.indexOf(current)}` : undefined}>
      <AssetEditorSection title={current}>{panels.get(current)}</AssetEditorSection>
    </div>}
  </>
}
