"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { AssetEditorContent, WorkspaceFrame } from "./asset-editor-frame"

/** Reading uses the same workspace chrome, with navigation to document sections. */
export function WorkspaceDocument({ page, title, children, version }: { page: string; title: string; children: ReactNode; version?: string }) {
  const content = useRef<HTMLDivElement>(null)
  const [sections, setSections] = useState<{ id: string; title: string }[]>([])
  const [selected, setSelected] = useState("")
  useEffect(() => {
    const headings = Array.from(content.current?.querySelectorAll("h2") ?? [])
    const entries = headings.map((heading, index) => {
      if (!heading.id) heading.id = `section-${index + 1}`
      return { id: heading.id, title: heading.textContent?.trim() ?? "Section" }
    })
    setSections(entries)
    const target = entries.find(item => `#${item.id}` === window.location.hash)
    setSelected(target?.id ?? entries[0]?.id ?? "")
    if (target) document.getElementById(target.id)?.scrollIntoView()
  }, [page])
  return <WorkspaceFrame selection={page} title="Reference" label={title} status={title} detail={version}>
    <AssetEditorContent toolbar={sections.length > 1 && <label className="person-choice">Section<select aria-label="Document section" value={selected} onChange={event => {
      setSelected(event.target.value)
      document.getElementById(event.target.value)?.scrollIntoView({ block: "start" })
      window.history.replaceState(null, "", `#${event.target.value}`)
    }}>{sections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label>}>
      <div ref={content} className="workspace-document"><h1>{title}</h1>{children}</div>
    </AssetEditorContent>
  </WorkspaceFrame>
}
