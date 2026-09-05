import type { Metadata } from "next"
import Link from "next/link"

import { SITE_MENU } from "@/lib/site-menu"

export const metadata: Metadata = {
  title: "Pilgrimage — Assets",
  description: "Textures and characters, as they appear in the game.",
}

const ASSETS = SITE_MENU.find((item) => item.href === "/assets")?.children ?? []

export default function AssetsPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#1a1208] px-5 py-16">
      <header className="mb-14 text-center">
        <Link
          href="/"
          className="mb-6 block font-display text-[10px] uppercase tracking-[3px] text-gold hover:text-gold-light"
        >
          ← Menu
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-[6px] text-parchment md:text-4xl">
          ASSETS
        </h1>
        <p className="mt-3 font-display text-[10px] uppercase tracking-[3px] text-gold">
          Everything the game is drawn with
        </p>
      </header>

      <nav className="flex w-full max-w-xs flex-col gap-6">
        {ASSETS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group border border-rule bg-parchment px-6 py-4 text-center shadow-[0_0_0_3px_var(--parchment-dark),0_0_0_4px_var(--rule),4px_4px_24px_rgba(0,0,0,0.6)] transition-colors hover:bg-parchment-dark"
          >
            <span className="font-display text-lg font-semibold uppercase tracking-[4px] text-ink group-hover:text-red">
              {item.label}
            </span>
            <span className="mt-0.5 block text-[13px] italic text-ink-light">
              {item.description}
            </span>
          </Link>
        ))}
      </nav>
    </main>
  )
}
