import type { Metadata } from "next"
import Link from "next/link"

import { CharacterGallery } from "@/components/character-gallery"
import { CharacterLab } from "@/components/character-lab"

export const metadata: Metadata = {
  title: "Pilgrimage — Characters",
  description: "Every calling that walks the road, as it appears in game.",
}

export default function CharactersPage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-[#1a1208] px-5 py-14">
      <header className="mb-10 text-center">
        <Link
          href="/assets/characters"
          className="mb-6 block font-display text-[10px] uppercase tracking-[3px] text-gold hover:text-gold-light"
        >
          ← Base person
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-[6px] text-parchment md:text-4xl">
          CHARACTERS
        </h1>
        <p className="mt-3 font-display text-[10px] uppercase tracking-[3px] text-gold">
          Earlier character drafts · Outfits will be rebuilt from the base
        </p>
      </header>

      <CharacterLab />
      <h2 className="mt-20 mb-8 font-display text-2xl tracking-[4px] text-parchment">THE CALLINGS</h2>
      <CharacterGallery />
    </main>
  )
}
