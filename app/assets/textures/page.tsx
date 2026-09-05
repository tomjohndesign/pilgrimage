import type { Metadata } from "next"
import Link from "next/link"

import { TextureGallery } from "@/components/texture-gallery"
import { TreeLab } from "@/components/tree-lab/tree-lab"
import { EnvironmentGallery } from "@/components/environment-lab/environment-gallery"

export const metadata: Metadata = {
  title: "Pilgrimage — Textures",
  description:
    "Every texture in the game, next to the item it dresses — with parametric trees and environment details.",
}

export default function TexturesPage() {
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
          TEXTURES
        </h1>
        <p className="mt-3 font-display text-[10px] uppercase tracking-[3px] text-gold">
          Every texture, beside the item it dresses
        </p>
      </header>

      <TextureGallery />

      <section id="environment" className="mt-20 w-full max-w-6xl">
        <header className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold tracking-[6px] text-parchment md:text-4xl">ENVIRONMENT</h2>
          <p className="mt-3 font-display text-[10px] uppercase tracking-[3px] text-gold">Meadow grass, wildflowers, shrubs, and weathered stone</p>
        </header>
        <EnvironmentGallery />
      </section>

      <section id="trees" className="mt-20 w-full max-w-6xl">
        <header className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold tracking-[6px] text-parchment md:text-4xl">
            TREES
          </h2>
          <p className="mt-3 font-display text-[10px] uppercase tracking-[3px] text-gold">
            Parametric species of medieval Britain
          </p>
        </header>
        <TreeLab />
      </section>
    </main>
  )
}
