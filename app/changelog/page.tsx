import { WorkspaceDocument } from "@/components/workspace-document"
import type { Metadata } from "next"

import { CHANGELOG, CURRENT_VERSION } from "@/lib/changelog"

export const metadata: Metadata = {
  title: "Pilgrimage — Changelog",
  description: "Release history for Pilgrimage, a medieval settlement builder.",
}

/** Release history in the shared reading workspace.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/ABB-0 — Changelog
 */
export default function ChangelogPage() {
  return (
    <WorkspaceDocument page="changelog" title="Changelog" version={CURRENT_VERSION}>
        <ol className="flex flex-col gap-8">
          {CHANGELOG.map((release) => (
            <li key={release.version} className="border-l-[3px] border-gold pl-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-display text-xl font-semibold uppercase tracking-[2px] text-ink">
                  {release.title}
                </h2>
                <span className="font-display text-[11px] uppercase tracking-[2px] text-red">
                  Alpha v{release.version}
                </span>
              </div>
              <p className="mt-2 text-base leading-relaxed text-ink-light">
                {release.summary}
              </p>
            </li>
          ))}
        </ol>


    </WorkspaceDocument>
  )
}
