import type { Metadata } from "next"
import Link from "next/link"
import { BUILD_CATALOG, DEFAULT_BALANCE, RULE_FIELDS, RULE_GROUPS } from "@/lib/game/balance"

export const metadata: Metadata = {
  title: "Pilgrimage — Game Specifications",
  description:
    "Implemented rules and default values for construction, resources and shrine renown.",
}
const r = DEFAULT_BALANCE.rules
const heading = "mb-3 mt-10 font-display text-xl text-ink"
const table =
  "w-full text-left text-sm [&_th]:border-b [&_th]:border-rule [&_th]:p-2 [&_td]:border-b [&_td]:border-rule/40 [&_td]:p-2"

export default function GameSpecsPage() {
  return (
    <main className="min-h-screen bg-[#1a1208] px-4 py-10">
      <article className="mx-auto max-w-5xl border border-rule bg-parchment p-6 text-base leading-relaxed text-ink-light shadow-xl sm:p-10">
        <nav className="flex flex-wrap gap-5 text-sm text-red">
          <Link href="/docs">← Design document</Link>
          <Link href="/tuning">Game tuning →</Link>
          <Link href="/play" target="_blank" rel="noopener noreferrer">
            Play ↗
          </Link>
        </nav>
        <h1 className="mt-8 font-display text-3xl tracking-[2px] text-ink">Game specifications</h1>
        <p className="mt-3 text-lg italic">
          The implemented build, buy and shrine progression rules.
        </p>
        <p className="mt-3">
          Values on this page are the shipped defaults, generated from the same definitions the game
          uses.{" "}
          <Link href="/tuning" className="text-red underline">
            Game tuning
          </Link>{" "}
          shows your applied browser settings and lets you change them.
        </p>

        <h2 className={heading}>Gold & wood</h2>
        <p>
          A new settlement starts with {r.startingGold} gold and {r.startingWood} wood in a shared
          treasury. Traveler wallets are separate. Purchases require both currencies and spend them
          only when a complete placement succeeds. A rejected or cancelled placement spends nothing.
        </p>
        <p className="mt-3">
          Every {r.incomeSeconds} seconds in a visible game tab, each resident adds {r.residentGold}{" "}
          gold and {r.residentWood} wood. Each placed building adds its configured income to that
          payment. The four founding brothers therefore provide {r.residentGold * 4} gold and{" "}
          {r.residentWood * 4} wood per payment before construction. Background tabs skip payments;
          there is no offline catch-up.
        </p>
        <p className="mt-3">
          Income currently models offerings and timber as automatic production. It does not debit
          travelers, require staffed jobs, or fell map trees. There are no wages, upkeep, refunds or
          demolition yet.
        </p>

        <h2 className={heading}>Construction</h2>
        <p>
          Choose a catalogue item, then click the map. Its origin is the hovered tile; the footprint
          extends along the map’s positive X and Z axes. Camera rotation changes your view, not the
          footprint orientation. Green previews can be placed; red previews explain a blocked site,
          insufficient supplies or an unmet unlock.
        </p>
        <ul className="my-3 list-disc space-y-1 pl-6">
          <li>
            Every footprint tile must fit on the map and within {r.buildRadius} tiles of the
            founding hovel’s centre.
          </li>
          <li>
            Flat buildable terrain is allowed: grass, dirt and dry sand. Hills, forest-floor
            clearings, woods, water, roads, tracks and bridges are blocked.
          </li>
          <li>Existing structures, the hovel door and the shrine approach must stay clear.</li>
          <li>
            Each successful click places one copy and ends placement mode. Escape or Cancel spends
            nothing. Dragging pans the camera without building.
          </li>
        </ul>
        <div className="overflow-x-auto">
          <table className={table}>
            <caption className="mb-2 text-left italic">
              Default catalogue; income is per {r.incomeSeconds}-second payment.
            </caption>
            <thead>
              <tr>
                {["Structure", "Footprint", "Gold", "Wood", "Renown", "Unlock", "Income"].map(
                  (label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {BUILD_CATALOG.map((def) => (
                <tr key={def.id}>
                  <th scope="row">
                    {def.label}
                    <span className="block font-normal">
                      {def.category === "scenery" ? "Scenery" : "Building"}
                    </span>
                  </th>
                  <td>
                    {def.w} × {def.d}
                  </td>
                  <td>{def.cost.gold}</td>
                  <td>{def.cost.wood}</td>
                  <td>+{def.renown}</td>
                  <td>{def.requiredRenown || "None"}</td>
                  <td>
                    {def.income.gold} gold / {def.income.wood} wood
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className={heading}>Shrine renown</h2>
        <p>
          Renown is a derived total for the entire establishment. It is not spendable and is not
          stored on the relic. Every placed copy contributes, with no diversity bonus or diminishing
          return. Passing travelers are not residents and do not contribute.
        </p>
        <dl className="my-4 space-y-3">
          <div>
            <dt className="font-semibold text-ink">Buildings</dt>
            <dd>
              The founding hovel contributes {r.hovelRenown}; all purchased buildings contribute
              their catalogue renown.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Individuals</dt>
            <dd>
              Sum over the residents: max(minimum, round(piety ÷ piety divisor) + skill count ×
              renown per skill). With defaults: max({r.individualMinimum}, round(piety ÷{" "}
              {r.pietyDivisor}) + skill count × {r.skillRenown}). Currently these residents are the
              founding monks.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Scenery</dt>
            <dd>
              Sum of the gardens and carved crosses placed through the catalogue. Natural landscape
              and unbuilt forest do not add renown.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Relics</dt>
            <dd>
              Sum over the relics: max(minimum, round((sanctity × sanctity weight + spectacle ×
              spectacle weight − doubt × doubt weight) ÷ relic divisor)). Defaults: max(
              {r.relicMinimum}, round((sanctity × {r.sanctityWeight} + spectacle ×{" "}
              {r.spectacleWeight} − doubt × {r.doubtWeight}) ÷ {r.relicDivisor})). The current game
              starts with one relic; the model accepts several.
            </dd>
          </div>
        </dl>
        <p>
          Titles progress from Humble shrine at 0, to Sanctuary at {r.sanctuaryRenown}, Pilgrimage
          site at {r.pilgrimageRenown}, and Renowned establishment at {r.renownedRenown}. These are
          display milestones. Each building’s unlock is configured independently; the hall requires{" "}
          {DEFAULT_BALANCE.buildings.hall.requiredRenown} renown by default. Raising a threshold
          never removes an existing building.
        </p>

        <h2 className={heading}>Traveler attraction</h2>
        <p>
          For a traveler with piety fraction p = piety ÷ 100, the relic’s appeal is sanctity × p² +
          spectacle × (1 − p) × 0.8 − status × (doubt ÷ 100) × 0.4. Multiply that appeal by base
          draw + (clamp(shrine renown, 0, draw cap) ÷ draw cap) × draw bonus.
        </p>
        <p className="mt-3">
          Defaults range from ×{r.drawBase} at zero renown to ×{r.drawBase + r.drawBonus} at{" "}
          {r.drawCap} renown. Scores at or above {r.turnAsideDraw} count in the “Turn aside”
          forecast and shrine-track wear. This forecast currently does not route simulated travelers
          down the shrine branch. Higher renown does not yet increase the road’s traveler count or
          spawn new archetypes.
        </p>

        <h2 className={heading}>Tuning while playing</h2>
        <ol className="list-decimal space-y-2 pl-6">
          <li>
            Use <strong>Tune ↗</strong> in the Shrine panel to open a second tab and keep your
            settlement running.
          </li>
          <li>
            Edit values, then choose <strong>Apply tuning</strong>. The whole preset is validated
            before any rule changes.
          </li>
          <li>
            Costs, unlocks, build radius, income and renown update in existing game tabs. Current
            supplies and placed structures are retained; price changes do not refund previous
            purchases. Starting gold and wood apply to the next new settlement.
          </li>
          <li>
            Applied settings persist in browser storage and synchronize across tabs at the same
            origin (including the same port). They survive reloads; the settlement itself is still
            session-only.
          </li>
          <li>
            Export a JSON preset to keep or share your edits. Import loads a draft; Apply activates
            it. Restore defaults immediately saves and applies the shipped balance.
          </li>
        </ol>
        <p className="mt-3">
          Invalid numbers, missing preset fields, unsupported preset versions and non-increasing
          progression thresholds are rejected. A corrupt saved preset falls back to defaults on a
          fresh page; invalid external updates retain the current settings. The tuning page reports
          storage failures.
        </p>

        <h2 className={heading}>Tunable rule reference</h2>
        {RULE_GROUPS.map((group) => (
          <section key={group} className="mt-6">
            <h3 className="mb-2 font-display text-base text-ink">{group}</h3>
            <div className="overflow-x-auto">
              <table className={table}>
                <thead>
                  <tr>
                    <th scope="col">Rule</th>
                    <th scope="col">Default</th>
                    <th scope="col">Allowed</th>
                    <th scope="col">Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {RULE_FIELDS.filter((field) => field.group === group).map((field) => (
                    <tr key={field.key}>
                      <th scope="row">{field.label}</th>
                      <td>{field.default}</td>
                      <td className="whitespace-nowrap">
                        {field.min}–{field.max}
                        <br />
                        Step {field.step}
                      </td>
                      <td>{field.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </article>
    </main>
  )
}
