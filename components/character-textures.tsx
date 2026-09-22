import { JOB_POPULATION } from "@/lib/game/jobs/assets"
import { SETTLEMENT_JOBS, type SettlementJob } from "@/lib/game/jobs/design"
import type { PopulationPack } from "@/lib/game/base-person/population"
import Link from "next/link"
import { AssetEditorHelp } from "./asset-editor-frame"
import { DEFAULT_POPULATION } from "@/lib/game/base-person/population-assets"
import { POPULATION_PROFILES } from "@/lib/game/base-person/population"
import { TRAVELER_TYPES } from "@/lib/game/travelers"

export function CharacterTextures() {
  return <section id="characters" className="w-full">
    <div className="mb-8" aria-label="Current road character sprites">
      <h3 className="mb-3 font-display text-lg text-parchment">On the road</h3>
      <AssetEditorHelp label="Character sprites">Six body profiles per calling at a shared map scale. Nuns wear a veiled habit in every profile.</AssetEditorHelp>
      <OutfitCards types={Object.values(TRAVELER_TYPES).filter(type => type.id !== "squire")} pack={DEFAULT_POPULATION} />
    </div>
    <div className="mb-8" aria-label="Settlement job sprites">
      <h3 className="mb-3 font-display text-lg text-parchment">In the enclave</h3>
      <AssetEditorHelp label="Character sprites">Residents change into their work clothes when they take a job. Every job has three male and three female profiles.</AssetEditorHelp>
      <OutfitCards types={(Object.keys(SETTLEMENT_JOBS) as SettlementJob[]).map(id => ({ id, ...SETTLEMENT_JOBS[id] }))} pack={JOB_POPULATION} />
    </div>
    <article className="workspace-catalogue-item">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h3 className="font-display text-lg">Base person · shared template</h3><AssetEditorHelp label="Character sprites">Storybook ~35px figures · 64px padded cells · custom colour palette · eight directions</AssetEditorHelp>
          <AssetEditorHelp label="Character sprites">The new foundation for character outfits. One body and walk cycle keep proportions and accessory attachment points consistent.</AssetEditorHelp>
          <div className="mt-4 flex flex-wrap gap-4 text-xs underline underline-offset-4"><Link href="/assets?asset=characters">Inspect the base →</Link><a href="/textures/characters/base/base-person-v25-walk.png" download>Walk sheet</a><a href="/textures/characters/base/base-person-v25-idle.png" download>Idle sheet</a><a href="/textures/characters/base/base-person-v25.json" download>Attachment data</a><a href="/textures/characters/base/base-person-v25-shadow-walk.png" download>Shadow sheet</a></div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/textures/characters/base/base-person-v25-walk.png" width={1280} height={512} alt="Shared base person, 160 walk poses at native resolution" className="max-w-full bg-[#62724d]" style={{ imageRendering: "pixelated" }} />
      </div>
    </article>
  </section>
}

function OutfitCards<Calling extends string>({ types, pack }: { types: { id: Calling; label: string; color: string }[]; pack: PopulationPack<Calling> }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{types.map(type => {
        const atlas = pack.callings[type.id]
        return <article key={type.id} className="workspace-catalogue-item">
          <h4 className="font-display text-sm"><span className="mr-2 inline-block h-2 w-2" style={{ background: type.color }} />{type.label}</h4>
          <div className="my-3 grid grid-cols-3 justify-items-center bg-[#62724d]">{POPULATION_PROFILES.map((profile, i) => <span key={profile.id} role="img" aria-label={`${type.label}, ${atlas.designs[i].bodyType.toLowerCase()} profile ${i + 1}`} style={{ width: 64, height: 64, imageRendering: "pixelated", backgroundImage: `url(${atlas.walk})`, backgroundSize: `${(pack.frameCounts?.walk ?? 8) * 64}px ${pack.rows * 64}px`, backgroundPosition: `0px ${-i * 8 * 64}px` }} />)}</div>
          <div className="flex gap-4 text-xs underline underline-offset-4"><a href={atlas.walk} download>Walk sheet</a><a href={atlas.idle} download>Idle sheet</a></div>
        </article>
      })}</div>
}
