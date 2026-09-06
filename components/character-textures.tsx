import Link from "next/link"
import { DEFAULT_POPULATION } from "@/lib/game/base-person/population-assets"
import { POPULATION_PROFILES } from "@/lib/game/base-person/population"
import { CHARACTER_ASSETS } from "@/lib/game/character-assets"
import { TRAVELER_TYPES } from "@/lib/game/travelers"

export function CharacterTextures() {
  return <section id="characters" className="mt-20 w-full max-w-6xl scroll-mt-8">
    <header className="mb-8 text-center"><h2 className="font-display text-2xl tracking-[5px] text-parchment">CHARACTER SPRITES</h2>
      <p className="mt-3 text-sm text-[#b9ad92]">Seven callings · mixed bodies · eight directions and {DEFAULT_POPULATION.frameCounts?.walk ?? 8} walking frames.</p>
      <Link href="/assets/characters" className="mt-4 inline-block font-display text-xs text-gold underline underline-offset-4">Open the sprite playground →</Link>
    </header>
    <div className="mb-8" aria-label="Current road character sprites">
      <h3 className="mb-3 font-display text-lg text-parchment">On the road</h3>
      <p className="mb-5 text-sm text-[#b9ad92]">Three male and three female profiles per calling, with individual size variation on the map.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Object.values(TRAVELER_TYPES).map(type => {
        const atlas = DEFAULT_POPULATION.callings[type.id]
        return <article key={type.id} className="border border-rule bg-parchment p-4 text-ink">
          <h4 className="font-display text-sm"><span className="mr-2 inline-block h-2 w-2" style={{ background: type.color }} />{type.label}</h4>
          <div className="my-3 grid grid-cols-3 justify-items-center bg-[#62724d]">{POPULATION_PROFILES.map((profile, i) => <span key={profile.id} role="img" aria-label={`${type.label}, ${profile.id}`} style={{ width: 64, height: 64, imageRendering: "pixelated", backgroundImage: `url(${atlas.walk})`, backgroundSize: `${(DEFAULT_POPULATION.frameCounts?.walk ?? 8) * 64}px ${DEFAULT_POPULATION.rows * 64}px`, backgroundPosition: `0px ${-i * 8 * 64}px` }} />)}</div>
          <div className="flex gap-4 text-xs underline underline-offset-4"><a href={atlas.walk} download>Walk sheet</a><a href={atlas.idle} download>Idle sheet</a></div>
        </article>
      })}</div>
    </div>
    <article className="mb-8 border border-rule bg-parchment p-5 text-ink">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h3 className="font-display text-lg">Base person · shared template</h3><p className="mt-2 text-sm text-ink-light">Storybook ~35px figures · 64px padded cells · custom colour palette · eight directions</p>
          <p className="mt-2 max-w-lg text-xs leading-relaxed text-ink-light">The new foundation for character outfits. One body and walk cycle keep proportions and accessory attachment points consistent.</p>
          <div className="mt-4 flex flex-wrap gap-4 text-xs underline underline-offset-4"><Link href="/assets/characters">Inspect the base →</Link><a href="/textures/characters/base/base-person-v14-walk.png" download>Walk sheet</a><a href="/textures/characters/base/base-person-v14-idle.png" download>Idle sheet</a><a href="/textures/characters/base/base-person-v14.json" download>Attachment data</a><a href="/textures/characters/base/base-person-v14-shadow-walk.png" download>Shadow sheet</a></div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/textures/characters/base/base-person-v14-walk.png" width={1280} height={512} alt="Shared base person, 160 walk poses at native resolution" className="max-w-full bg-[#62724d]" style={{ imageRendering: "pixelated" }} />
      </div>
    </article>
    <p className="mb-5 text-center text-sm text-[#b9ad92]">Earlier image-generated drafts · retained for comparison</p>
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{Object.values(TRAVELER_TYPES).map((type) => {
      const asset = CHARACTER_ASSETS[type.id]
      return <article key={type.id} className="border border-rule bg-parchment p-4 text-ink">
        <h3 className="font-display text-base">{type.label}</h3>
        <p className="mt-1 text-xs text-ink-light">256 × 512 · 32 frames · PNG + alpha</p>
        <Link href={`/assets/characters/callings?character=${type.id}`} className="mt-4 block border border-rule bg-[#485443]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.sheet} alt={`${type.label}: eight rows of directions, four walk poses per row`} width={256} height={512} className="h-auto w-full" style={{ imageRendering: "pixelated" }} />
        </Link>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs underline underline-offset-4">
          <a href={asset.sheet} download>Sheet</a><a href={asset.sheet.replace(".png", ".json")} download>Frame data</a>
          <a href={`/textures/characters/sources/${type.id}-v1.png`} download>Source art</a><a href={asset.sound} download>Sound</a>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-light">Generated with imagegen. Registered into small frames with a 32-color palette.</p>
      </article>
    })}</div>
  </section>
}
