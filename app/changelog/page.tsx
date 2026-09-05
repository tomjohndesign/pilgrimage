import type { Metadata } from "next"
import Link from "next/link"

import { CHANGELOG, CURRENT_VERSION } from "@/lib/changelog"

export const metadata: Metadata = {
  title: "Pilgrimage — Changelog",
  description: "Release history for Pilgrimage, a medieval settlement builder.",
}

export default function ChangelogPage() {
  return (
    <main className="min-h-screen bg-[#1a1208] px-5 py-10 md:px-5 md:py-10">
      <article className="relative mx-auto max-w-[780px] bg-parchment p-7 md:p-[60px_70px] shadow-[0_0_0_1px_var(--rule),0_0_0_4px_var(--parchment-dark),0_0_0_5px_var(--rule),8px_8px_40px_rgba(0,0,0,0.7)] page-border parchment-texture">
        <header className="mb-10 border-b-2 border-rule pb-8 text-center">
          <span className="mb-4 block text-base tracking-[10px] text-gold">✦ ✦ ✦</span>
          <h1 className="font-display text-4xl font-bold tracking-[6px] text-ink md:text-5xl">
            CHANGELOG
          </h1>
          <p className="mt-3 font-display text-xs uppercase tracking-[4px] text-ink-light">
            {CURRENT_VERSION}
          </p>
        </header>

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

        <footer className="mt-12 border-t-2 border-rule pt-6 text-center">
          <Link
            href="/"
            className="font-display text-xs uppercase tracking-[3px] text-ink hover:text-red"
          >
            ← Return to the main menu
          </Link>
        </footer>
      </article>
    </main>
  )
}
