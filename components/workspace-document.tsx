"use client"

import { EntitySelect } from "./workspace-navigation"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { AssetEditorContent, WorkspaceFrame } from "./asset-editor-frame"

/** Reading uses the same workspace chrome, with navigation to document sections.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/A65-0 — Design document
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/A8V-0 — Game specifications
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/ABB-0 — Changelog
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/C6L-0 — Reference · section navigation
 */
export function WorkspaceDocument({ page, title, children, version }: { page: string; title: string; children: ReactNode; version?: string }) {
  const content = useRef<HTMLDivElement>(null)
  const [sections, setSections] = useState<{ id: string; title: string }[]>([])
  const [selected, setSelected] = useState("")
  useEffect(() => {
    const headings = Array.from(content.current?.querySelectorAll("h2") ?? [])
    const used = new Set<string>()
    const entries = headings.map((heading, index) => {
      if (!heading.id) {
        const slug = heading.textContent?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `section-${index + 1}`
        heading.id = used.has(slug) ? `${slug}-${index + 1}` : slug
      }
      used.add(heading.id)
      return { id: heading.id, title: heading.textContent?.trim() ?? "Section" }
    })
    setSections(entries)
    const scroller = content.current?.closest(".workspace-content-scroll") as HTMLElement | null
    if (!scroller) return
    const scrollToHash = () => {
      const hash = window.location.hash
      const legacyIndex = /^#section-(\d+)$/.exec(hash)?.[1]
      const heading = headings.find(item => `#${item.id}` === hash) ?? (legacyIndex ? headings[Number(legacyIndex) - 1] : undefined)
      if (!hash) scroller.scrollTo({ top: 0, behavior: "instant" })
      if (heading) scroller.scrollTo({ top: heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 20, behavior: "instant" })
    }
    let request = 0
    const update = () => {
      cancelAnimationFrame(request)
      request = requestAnimationFrame(() => {
        const top = scroller.getBoundingClientRect().top + 48
        let current: HTMLHeadingElement | undefined = headings[0]
        for (const heading of headings) { if (heading.getBoundingClientRect().top <= top) current = heading; else break }
        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) current = headings.at(-1)
        if (current) setSelected(current.id)
      })
    }
    scrollToHash(); update()
    scroller.addEventListener("scroll", update, { passive: true }); window.addEventListener("hashchange", scrollToHash)
    return () => { cancelAnimationFrame(request); scroller.removeEventListener("scroll", update); window.removeEventListener("hashchange", scrollToHash) }
  }, [page])
  return <WorkspaceFrame selection={page} title="Reference" label={title} status={title} detail={version}>
    <AssetEditorContent toolbar={sections.length > 1 && <label className="person-choice">Section<EntitySelect anchors autoSelect aria-label="Document section" value={selected} onChange={event => {
      const heading = document.getElementById(event.target.value), scroller = content.current?.closest(".workspace-content-scroll")
      if (heading && scroller) scroller.scrollTo({ top: heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 20,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })
      window.history.pushState(null, "", `#${event.target.value}`)
    }}>{sections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}</EntitySelect></label>}>
      <div ref={content} className="workspace-document"><h1>{title}</h1>{children}</div>
    </AssetEditorContent>
  </WorkspaceFrame>
}
