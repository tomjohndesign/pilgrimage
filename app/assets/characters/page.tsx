import type { Metadata } from "next"
import Link from "next/link"

import { BasePersonLab } from "@/components/base-person-lab"

export const metadata: Metadata = {
  title: "Pilgrimage — Characters",
  description: "A tiny, consistent base person for every calling on the road.",
}

export default function CharactersPage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-[#1a1208] px-5 py-14">
      <header className="mb-10 text-center">
        <Link
          href="/assets"
          className="mb-6 block font-display text-[10px] uppercase tracking-[3px] text-gold hover:text-gold-light"
        >
          ← Assets
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-[6px] text-parchment md:text-4xl">
          CHARACTERS
        </h1>
        <p className="mt-3 font-display text-[10px] uppercase tracking-[3px] text-gold">
          Base person · The shared sprite template
        </p>
      </header>

      <BasePersonLab />
    </main>
  )
}
