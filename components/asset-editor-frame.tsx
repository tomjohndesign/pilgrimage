"use client"

import { Children, Fragment, cloneElement, createContext, isValidElement, useContext, useState, useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowUpRight, Shuffle, X, Info } from "lucide-react";
import "./game/game-hud.css"
import "./base-person-lab.css"

import { TERRAIN } from "@/lib/game/map/terrain"
import { PLAYGROUND_TOOLS, type PlaygroundTool } from "@/lib/asset-playground"
import { Accordion } from "@base-ui/react/accordion"
import { Dialog } from "@base-ui/react/dialog"
import { PanelGroup, Panel, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels"
import { PanelLeft, PanelRight, ChevronRight } from "lucide-react"
import { ChromeButton } from "./ui/chrome-controls"
import { ThemeToggle } from "./chrome-provider"
import { EntitySelect } from "./workspace-navigation"
import { WorkspaceSlots } from "./workspace-context"
import { HudHelp } from "./game/hud-controls"

export const REFERENCE_PAGES = [
  { id: "docs", label: "Design document", href: "/docs" },
  { id: "specs", label: "Game specifications", href: "/docs/game-specs" },
  { id: "changelog", label: "Changelog", href: "/changelog" },
] as const

export type AssetEditorMode = PlaygroundTool
export interface AssetEditorNavigation { mode: AssetEditorMode; onModeChange: (mode: AssetEditorMode) => void }

/** Shared editor entry point for the navigation, canvas and property panes.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/81D-0 — Characters
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/930-0 — Buildings
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/AY5-0 — Mobile · controls drawer
 */
export function AssetEditorFrame({ mode, onModeChange, controlsOpen, onControlsToggle, roadHref = "/play", label, status, detail, children, onRandomize, randomizeDisabled, onSelectionChange }: AssetEditorNavigation & {
  onSelectionChange?: (selected: boolean) => void; onRandomize?: () => void; randomizeDisabled?: string;
  version: string; controlsOpen?: boolean; onControlsToggle?: () => void; roadHref?: string;
  label: string; status: ReactNode; detail: ReactNode; children: ReactNode
}) {
  return <WorkspaceFrame onSelectionChange={onSelectionChange} selection={mode} onToolChange={onModeChange} title="Playground" label={label} status={status} detail={detail}
    controlsOpen={controlsOpen} onControlsToggle={onControlsToggle} roadHref={roadHref}
    actions={onRandomize && <ChromeButton className="hud-action" aria-label="Randomize" onClick={onRandomize} disabled={!!randomizeDisabled} title={randomizeDisabled ?? "Randomize map appearance"}><Shuffle size={14} /></ChromeButton>}>
    {children}
  </WorkspaceFrame>
}

/** Common navigation and chrome for every screen outside the running game.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/B67-0 — Workspace navigation
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/BA2-0 — Characters · browse
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/C99-0 — Character · sidebars collapsed
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/CCL-0 — Character · resized sidebars
 */
export function WorkspaceFrame({ selection, title, label, status, detail, children, onToolChange, controlsOpen, onControlsToggle, roadHref = "/play", actions, onSelectionChange }: {
  onSelectionChange?: (selected: boolean) => void; selection: string; title: string; label: string; status?: ReactNode; detail?: ReactNode; children: ReactNode;
  onToolChange?: (tool: PlaygroundTool) => void; controlsOpen?: boolean; onControlsToggle?: () => void; roadHref?: string; actions?: ReactNode
}) {
  const router = useRouter()
  const tool = PLAYGROUND_TOOLS.find(item => item.id === selection)
  const root = selection === "workspace"
  const [overview, setOverview] = useState<HTMLDivElement | null>(null)
  const [navigation, setNavigation] = useState<HTMLDivElement | null>(null)
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null)
  const [inspector, setInspector] = useState<HTMLDivElement | null>(null)
  const [hasEntities, setHasEntities] = useState(false)
  const [entitySelected, setEntitySelected] = useState(false)
  useEffect(() => { onSelectionChange?.(entitySelected) }, [entitySelected, onSelectionChange])
  const [entityTitle, setEntityTitle] = useState("")
  const [navOpen, setNavOpen] = useState(true)
  const [propertiesOpen, setPropertiesOpen] = useState(true)
  const [mobile, setMobile] = useState(false)
  const [drawer, setDrawer] = useState<"navigation" | "properties" | null>(null)
  const navPanel = useRef<ImperativePanelHandle>(null)
  const propPanel = useRef<ImperativePanelHandle>(null)
  const [hasInspector, setHasInspector] = useState(false)
  useEffect(() => {
    const query = matchMedia("(max-width: 900px)")
    const update = () => { setMobile(query.matches); setDrawer(null) }
    update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update)
  }, [])
  useEffect(() => {
    if (!inspector) return
    const update = () => setHasInspector(inspector.childElementCount > 0)
    update(); const observer = new MutationObserver(update); observer.observe(inspector, { childList: true }); return () => observer.disconnect()
  }, [inspector])
  const canInspect = hasInspector && (!hasEntities || entitySelected)
  useEffect(() => { if (mobile || !canInspect) propPanel.current?.collapse(); else if (propertiesOpen) propPanel.current?.expand() }, [mobile, canInspect, propertiesOpen])
  useEffect(() => { if (mobile) navPanel.current?.collapse(); else if (navOpen) navPanel.current?.expand() }, [mobile, navOpen])
  const chooseTool = (next: PlaygroundTool) => { setDrawer(null); if (onToolChange) onToolChange(next); else router.push(`/assets?asset=${next}`) }
  const back = () => { setDrawer(null); if (onToolChange) window.history.pushState(null, "", "/assets"); else router.push("/assets") }
  const nav = <div className="chrome-navigation">
    <div className="chrome-navigation-heading">{root ? <span>Workspace</span> : <ChromeButton className="chrome-back" onClick={back}><ArrowLeft size={14} />Workspace</ChromeButton>}</div>
    {!root && <h2><ChromeButton title="Show all items" onClick={() => { if (hasEntities) setEntitySelected(false); setDrawer(null) }}>{tool?.label ?? label}</ChromeButton></h2>}
    <div className="chrome-navigation-scroll"><div ref={setNavigation} />
      {(root || !hasEntities) && <nav aria-label="Workspace pages">{[
        { title: "Entities", ids: ["characters", "animals", "buildings", "ents", "trees", "maps", "textures"] },
        { title: "Explorations", ids: ["paths", "town", "placement", "rendering", "pipeline"] },
        { title: "Pages", ids: ["tuning"] },
      ].map(group => <div key={group.title}><h3>{group.title}</h3>{PLAYGROUND_TOOLS.filter(item => group.ids.includes(item.id)).map(item => <ChromeButton key={item.id} className="chrome-nav-row" aria-current={item.id === selection ? "page" : undefined} onClick={() => chooseTool(item.id)}><span>{item.label}</span><ChevronRight size={12} /></ChromeButton>)}
        {group.title === "Pages" && REFERENCE_PAGES.map(page => <Link key={page.id} className="chrome-nav-row" href={page.href}>{page.label}<ChevronRight size={12} /></Link>)}
      </div>)}</nav>}
    </div>
    <div className="chrome-navigation-footer"><Link href={roadHref}>Open game<ArrowUpRight size={13} /></Link><ThemeToggle /></div>
  </div>
  const inspectorContent = <div className="chrome-inspector"><div className="chrome-inspector-heading">Properties<AssetEditorHelp label="Properties">{detail || "Edit the selected item. Changes stay in your draft until applied."}</AssetEditorHelp></div><div className="chrome-inspector-content" ref={setInspector} /><div className="chrome-local-status" role="status">{status}</div></div>
  return <WorkspaceSlots.Provider value={{ overview, navigation, toolbar, inspector, entitySelected, setEntitySelected, setHasEntities, setEntityTitle, onEntityActivate: () => setDrawer(null) }}>
    <section className="game-hud person-editor chrome-workspace" aria-label={label} style={{ "--workspace-grass": TERRAIN.grass.color } as CSSProperties}>
      <PanelGroup direction="horizontal" autoSaveId="pilgrimage-workspace-v2">
        <Panel id="navigation" order={1} ref={navPanel} defaultSize={17.2} minSize={14} maxSize={26} collapsible collapsedSize={0} onCollapse={() => { if (!mobile) setNavOpen(false) }} onExpand={() => { if (!mobile) setNavOpen(true) }}>
          {!mobile && nav}
        </Panel>
        <PanelResizeHandle className="chrome-resize-handle" aria-label="Resize navigation" onDoubleClick={() => navPanel.current?.resize(17.2)} disabled={mobile} />
        <Panel id="canvas" order={2} defaultSize={62} minSize={30}>
          <div className="chrome-canvas"><header className="chrome-canvas-header" data-browsing={hasEntities && !entitySelected || undefined}>
            <ChromeButton className="chrome-icon-button" aria-label={navOpen && !mobile ? "Hide navigation" : "Show navigation"} title="Toggle navigation" aria-expanded={mobile ? drawer === "navigation" : navOpen} onClick={() => { if (mobile) setDrawer("navigation"); else if (navOpen) navPanel.current?.collapse(); else navPanel.current?.expand() }}><PanelLeft size={16} /></ChromeButton>
            <h1>{hasEntities && entitySelected ? entityTitle : tool?.label ?? label}</h1><div className="chrome-header-controls" ref={setToolbar} />{(!hasEntities || entitySelected) && actions}
            {tool && <AssetEditorHelp label={tool.label}>{tool.help}</AssetEditorHelp>}
            <ChromeButton className="chrome-icon-button" aria-label={propertiesOpen && !mobile ? "Hide properties" : "Show properties"} title="Toggle properties" disabled={!canInspect} aria-expanded={mobile ? drawer === "properties" : propertiesOpen && canInspect} onClick={() => { if (mobile) setDrawer("properties"); else { setPropertiesOpen(!propertiesOpen); if (propertiesOpen) propPanel.current?.collapse(); else propPanel.current?.expand() } }}><PanelRight size={16} /></ChromeButton>
          </header><div className="chrome-canvas-content" data-empty={hasEntities && !entitySelected ? "true" : undefined}>{children}<div className="chrome-empty-selection" hidden={!hasEntities || entitySelected}><div ref={setOverview} className="chrome-entity-overview" /><span className="chrome-select-prompt">Select an item to preview</span></div></div></div>
        </Panel>
        <PanelResizeHandle className="chrome-resize-handle" aria-label="Resize properties" onDoubleClick={() => propPanel.current?.resize(20.8)} disabled={mobile || !canInspect} />
        <Panel id="properties" order={3} ref={propPanel} defaultSize={20.8} minSize={18} maxSize={35} collapsible collapsedSize={0} onCollapse={() => { if (!mobile && canInspect) setPropertiesOpen(false) }} onExpand={() => { if (!mobile) setPropertiesOpen(true) }}>
          {!mobile && inspectorContent}
        </Panel>
      </PanelGroup>
      {mobile && <Dialog.Root open={drawer !== null} onOpenChange={open => { if (!open) setDrawer(null) }}><Dialog.Portal keepMounted><Dialog.Backdrop className="chrome-dialog-backdrop" /><Dialog.Popup className={`game-hud person-editor chrome-mobile-panel chrome-mobile-${drawer ?? "navigation"}`}>
        <Dialog.Title className="sr-only">{drawer === "properties" ? "Properties" : "Navigation"}</Dialog.Title><Dialog.Close className="chrome-mobile-close chrome-icon-button" aria-label="Close panel"><X size={16} /></Dialog.Close>
        <div hidden={drawer === "properties"}>{nav}</div><div hidden={drawer !== "properties"}>{inspectorContent}</div>
      </Dialog.Popup></Dialog.Portal></Dialog.Root>}
    </section>
  </WorkspaceSlots.Provider>
}

/** A full-width workspace for forms, catalogues and reading, with the same toolbar and sections. */
export function AssetEditorContent({ toolbar, inspector, children }: { toolbar?: ReactNode; inspector?: ReactNode; children: ReactNode }) {
  const slots = useContext(WorkspaceSlots)
  return <div className="workspace-content">
    {inspector && slots?.inspector && createPortal(<div className="chrome-section-page"><div className="chrome-section-content">{inspector}</div></div>, slots.inspector)}
    {toolbar && slots?.toolbar && createPortal(toolbar, slots.toolbar)}
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

/** The character/building workspace layout, also used by simulation tools.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/BEA-0 — Character · properties
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/CCL-0 — Character · resized sidebars
 */
export function AssetEditorWorkspace({ title, controlsOpen, onControlsClose, controls, controlsHeading, controlsHeader, controlsFooter, toolbar, dock, children }: {
  title: string; controlsOpen: boolean; onControlsClose: () => void; controls: ReactNode;
  controlsHeading?: ReactNode; controlsHeader?: ReactNode; controlsFooter?: ReactNode;
  toolbar: ReactNode; dock: ReactNode; children: ReactNode
}) {
  const [canvasControls, setCanvasControls] = useState<HTMLDivElement | null>(null)
  const slots = useContext(WorkspaceSlots)
  const footerHelp: ReactNode[] = []
  const footer = sectionContent(controlsFooter, footerHelp)
  return <div className="person-workspace">
    {slots?.inspector && createPortal(<><div className="person-controls chrome-property-controls" aria-label={`${title} controls`}>
      {controlsHeader}<div className="person-controls-scroll"><AssetEditorPanels>{controls}</AssetEditorPanels></div>{footer}
    </div></>, slots.inspector)}
    {slots?.toolbar && createPortal(toolbar, slots.toolbar)}
    <div className="person-preview" aria-label={`${title} preview`}>
      <CanvasControlsContext.Provider value={canvasControls}>{children}</CanvasControlsContext.Provider>
      <div className="workspace-canvas-dock"><div ref={setCanvasControls} />{dock}</div>
    </div>
  </div>
}

/** Small help trigger, available by hover, keyboard focus, or tap. */
export function AssetEditorHelp({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <HudHelp className="workspace-tooltip" open={open} onOpenChange={setOpen} content={<div className="playground-help-content">{children}</div>}>
    <ChromeButton type="button" className="playground-help" aria-label={`Help: ${label}`} onClick={() => setOpen(value => !value)}><Info size={14} /></ChromeButton>
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

/** Property content and its contextual help, grouped by the shared disclosure list. */
export function AssetEditorSection({ title, children }: SectionProps) {
  const help: ReactNode[] = []
  const content = sectionContent(children, help)
  return <section className="playground-control-section" aria-label={title}>
    <div className="playground-section-heading"><h2>{title}</h2>{help.length > 0 && <AssetEditorHelp label={title}>{help}</AssetEditorHelp>}</div>
    <div className="person-file-actions">{content}</div>
  </section>
}

/** Merge related sections into shared disclosures, or page navigation for catalogues. */
export function AssetEditorPanels({ children, navigation = false, inspector = false, flat = false, disabled = false }: { children: ReactNode; navigation?: boolean; inspector?: boolean; flat?: boolean; disabled?: boolean }) {
  const [selected, setSelected] = useState("")
  const slots = useContext(WorkspaceSlots)
  const panels = new Map<string, ReactNode[]>()
  const persistent: ReactNode[] = []
  const collect = (nodes: ReactNode) => Children.forEach(nodes, node => {
    if (!isValidElement<SectionProps>(node)) { if (node) persistent.push(node); return }
    if (node.type === Fragment) collect(node.props.children)
    else if (node.type === AssetEditorSection) { const items = panels.get(node.props.title) ?? []; items.push(<Fragment key={items.length}>{node.props.children}</Fragment>); panels.set(node.props.title, items) }
    else persistent.push(node)
  })
  collect(children)
  const titles = [...panels.keys()].filter(title => title !== "Sounds")
  if (panels.has("Sounds")) titles.splice(titles.includes("Files") ? titles.indexOf("Files") : titles.length, 0, "Sounds")
  if (navigation) {
    const current = panels.has(selected) ? selected : titles[0]
    const content = <fieldset disabled={disabled} className="chrome-section-page"><AssetEditorSection title={current}>{panels.get(current)}</AssetEditorSection>{persistent}</fieldset>
    return <><EntitySelect autoSelect value={current} options={titles.map(title => ({ value: title, label: title }))} onChange={event => setSelected(event.target.value)} />{inspector ? slots?.inspector && createPortal(content, slots.inspector) : content}</>
  }
  if (flat) return <>{persistent}{titles.map(title => <AssetEditorSection key={title} title={title}>{panels.get(title)}</AssetEditorSection>)}</>
  return <>{persistent}<Accordion.Root className="chrome-property-sections" multiple defaultValue={titles.filter(title => title !== "Scenario").slice(0, 1)}>
    {titles.map(title => { const help: ReactNode[] = []; const content = sectionContent(panels.get(title), help); return <Accordion.Item key={title} value={title} className="chrome-property-section">
      <Accordion.Header className="chrome-section-heading"><Accordion.Trigger className="chrome-section-trigger">{title}<ChevronRight size={13} /></Accordion.Trigger>{help.length > 0 && <AssetEditorHelp label={title}>{help}</AssetEditorHelp>}</Accordion.Header>
      <Accordion.Panel keepMounted className="chrome-section-panel"><div className="chrome-section-content">{content}</div></Accordion.Panel>
    </Accordion.Item> })}
  </Accordion.Root></>
}
