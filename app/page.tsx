import Link from "next/link"

import { CURRENT_VERSION } from "@/lib/changelog"
import { SITE_MENU } from "@/lib/site-menu"

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#1a1208] px-5 py-16">
      <header className="mb-14 text-center">
        <span className="mb-5 block text-xl tracking-[12px] text-gold">✦ ✦ ✦</span>
        <h1 className="font-display text-5xl font-bold leading-none tracking-[8px] text-parchment md:text-[64px]">
          PILGRIMAGE
        </h1>
        <p className="mt-5 font-display text-xs uppercase tracking-[4px] text-gold">
          A Medieval Settlement Builder
        </p>
      </header>

      <nav className="flex w-full max-w-xs flex-col gap-6">
        {SITE_MENU.map((item) => (
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

      <footer className="mt-14 text-center font-display text-[10px] uppercase tracking-[3px] text-gold/60">
        {CURRENT_VERSION}
      </footer>
    </main>
  )
}
