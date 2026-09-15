"use client"
import { useContext, useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Search } from "lucide-react"
import { ChromeButton, selectOptions, type ChromeSelectProps, type SelectOption } from "./ui/chrome-controls"
import { WorkspaceSlots } from "./workspace-context"

/** Entity selection belongs to the left sidebar; properties remain on the right.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/BA2-0
 */
export function EntitySelect({ children, options: supplied, value, onChange, renderIcon, renderPreview, autoSelect = false }: ChromeSelectProps & { autoSelect?: boolean; renderPreview?: (option: SelectOption) => ReactNode; renderIcon?: (option: SelectOption, active: boolean) => ReactNode }) {
  const slots = useContext(WorkspaceSlots)
  const [query, setQuery] = useState("")
  const [hovered, setHovered] = useState<string | null>(null)
  const options = supplied ?? selectOptions(children)
  const selected = options.find(item => item.value === String(value))
  const setHasEntities = slots?.setHasEntities, setTitle = slots?.setEntityTitle
  useEffect(() => { setHasEntities?.(true); return () => setHasEntities?.(false) }, [setHasEntities])
  useEffect(() => { setTitle?.(selected?.label ?? ""); }, [selected?.label, setTitle])
  const selectEntity = slots?.setEntitySelected
  useEffect(() => { if (autoSelect) selectEntity?.(true) }, [autoSelect, selectEntity])
  const activate = (item: SelectOption) => { onChange?.({ target: { value: item.value }, currentTarget: { value: item.value } }); slots?.setEntitySelected(true); slots?.onEntityActivate() }
  const filtered = options.filter(item => item.label.toLowerCase().includes(query.toLowerCase()))
  return <><span data-navigation-marker hidden />{slots?.navigation && createPortal(<div className="chrome-entity-browser">
    {options.length > 5 && <label className="chrome-nav-search"><Search size={14} /><input aria-label="Search entities" placeholder="Search…" value={query} onChange={event => setQuery(event.target.value)} /></label>}
    <nav aria-label="Entities" className="chrome-entity-list">{filtered.map((item, index) => <div key={item.value}>
      {item.group && item.group !== filtered[index - 1]?.group && <h3>{item.group}</h3>}
      <ChromeButton className="chrome-nav-row" aria-current={slots.entitySelected && String(value) === item.value ? "page" : undefined} disabled={item.disabled}
        onPointerEnter={() => setHovered(item.value)} onPointerLeave={() => setHovered(null)} onFocus={() => setHovered(item.value)} onBlur={() => setHovered(null)}
        onClick={() => activate(item)}>
        {renderIcon && <span className="chrome-nav-sprite">{renderIcon(item, hovered === item.value)}</span>}<span>{item.label}</span>
      </ChromeButton>
    </div>)}</nav>{!filtered.length && <p className="chrome-nav-empty">No matches</p>}
  </div>, slots.navigation)}
    {renderPreview && slots?.overview && !slots.entitySelected && createPortal(<div className="chrome-entity-grid" aria-label="All entities">{filtered.map(item => <ChromeButton key={item.value} className="chrome-entity-tile" aria-label={`Open ${item.label}`} disabled={item.disabled} onClick={() => activate(item)}><span className="chrome-entity-art">{renderPreview(item)}</span><span>{item.label}</span></ChromeButton>)}</div>, slots.overview)}
  </>
}
