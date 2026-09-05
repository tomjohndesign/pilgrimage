import type { Metadata } from "next"
import Link from "next/link"
import { BalanceEditor } from "@/components/tuning/balance-editor"

export const metadata: Metadata = {
  title: "Pilgrimage — Game Tuning",
  description: "Tune the shrine economy, building costs and renown while you play.",
}

export default function TuningPage() {
  return (
    <main className="min-h-screen bg-[#1a1208] px-4 py-8 sm:py-12">
      <article className="mx-auto max-w-6xl border border-rule bg-parchment px-5 pb-8 shadow-xl sm:px-8">
        <header className="py-8">
          <Link href="/" className="text-sm text-red hover:underline">
            ← Menu
          </Link>
          <h1 className="mt-5 font-display text-3xl tracking-[3px] text-ink">Game tuning</h1>
          <p className="mt-3 text-lg italic text-ink-light">Shape the pace of your pilgrimage.</p>
        </header>
        <BalanceEditor />
      </article>
    </main>
  )
}
