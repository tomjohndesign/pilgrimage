import Link from "next/link"
import type { Metadata } from "next"

import { DocumentHeader } from "@/components/document-header"
import { Section } from "@/components/section"
import { PhaseGrid } from "@/components/phase-grid"
import { CoreLoop } from "@/components/core-loop"
import { TwoColumnGrid } from "@/components/two-column-grid"
import { Divider } from "@/components/divider"
import { DocumentFooter } from "@/components/document-footer"

export const metadata: Metadata = {
  title: "Pilgrimage — Design Document",
  description: "Game design document for Pilgrimage, a medieval settlement builder.",
}

export default function DesignDocumentPage() {
  return (
    <main className="min-h-screen bg-[#1a1208] px-5 py-10 md:px-5 md:py-10">
      <article className="relative mx-auto max-w-[780px] bg-parchment p-7 md:p-[60px_70px] shadow-[0_0_0_1px_var(--rule),0_0_0_4px_var(--parchment-dark),0_0_0_5px_var(--rule),8px_8px_40px_rgba(0,0,0,0.7)] page-border parchment-texture">
        
        <DocumentHeader />
        <p className="my-6 border-l-2 border-gold bg-parchment-dark p-4 text-base text-ink-light">
          This document describes the wider game design. For the current prototype’s economy,
          construction and renown rules, read the <Link href="/docs/game-specs" className="text-red underline">game specifications</Link>.
          {" "}<Link href="/tuning" className="text-red underline">Game tuning</Link> lets you adjust those values while playing.
        </p>

        {/* I. Concept */}
        <Section number="I" title="Concept">
          <p className="text-lg md:text-xl leading-relaxed md:leading-loose text-ink italic mb-0">
            You begin with a holy relic and a plot of land. Your goal is to grow a medieval pilgrimage site from a humble waypoint into a renowned destination that draws travelers from across the known world.
          </p>
          <p className="text-base md:text-lg leading-relaxed text-ink-light mt-3">
            The game is a real-time isometric settlement builder set in medieval Europe — Black Forest Germany, English countryside, Italian hill country, and similar environments. Players manage infrastructure, economy, and NPC needs as pilgrims travel a pre-existing path through the map.
          </p>
        </Section>

        {/* II. Core Loop */}
        <Section number="II" title="Core Loop">
          <CoreLoop />
          <div className="bg-parchment-dark border-l-[3px] border-gold px-5 py-4 my-5 italic text-base text-ink leading-relaxed">
            &ldquo;Start with a relic and gold, build toward the path, attract pilgrims, reinvest.&rdquo;
          </div>
        </Section>

        {/* III. Progression Arc */}
        <Section number="III" title="Progression Arc">
          <PhaseGrid />
          <p className="text-base md:text-lg leading-relaxed text-ink-light mt-5">
            Progression is gated by <strong className="text-ink">Renown</strong> — a single visible meter that grows with your site. Renown thresholds unlock new building tiers, attract new pilgrim archetypes, and increase the trickle of incoming travelers.
          </p>
        </Section>

        <Divider />

        {/* IV. Economy */}
        <Section number="IV" title="Economy">
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-4">
            You are the landlord. The relic generates direct patronage income. Everything else generates tax revenue.
          </p>
          <TwoColumnGrid
            leftTitle="Revenue Streams"
            leftItems={[
              "Pilgrim patronage of the relic",
              "Tax on merchant stalls",
              "Tax on lodging (inns, hostels)",
              "Tax on entertainment",
              "Tax on monastery operations",
            ]}
            rightTitle="Expenses"
            rightItems={[
              "Construction costs",
              "Guard wages and patrols",
              "Infrastructure upkeep",
              "Imported goods (later game)",
              "Resident wages and housing",
            ]}
          />
          <p className="text-base md:text-lg leading-relaxed text-ink-light mt-4">
            Tenants (merchants, monks, entertainers) have a demand meter. If pilgrim foot traffic falls below their threshold, they close up and leave — taking their draw with them. Attrition can cascade if left unchecked.
          </p>
        </Section>

        {/* V. NPCs */}
        <Section number="V" title="NPCs">
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-3">
            Two tiers of visitor: <strong className="text-ink">common pilgrims</strong> (the majority, flexible needs) and <strong className="text-ink">archetype characters</strong> (merchants, monks, entertainers, nobles) with specific motivations and higher value.
          </p>
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-3">
            Archetype characters are unlocked by your buildings — monks don&apos;t appear until you have a monastery; merchants arrive once you have a marketplace. Buildings summon their population.
          </p>
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-3">
            All NPCs arrive with a budget. They spend based on available amenities and personal disposition (more pious vs. more mercantile). Your job is to capture as much of that budget as possible during their stay.
          </p>
          <p className="text-base md:text-lg leading-relaxed text-ink-light">
            Some pilgrims may choose to <strong className="text-ink">settle permanently</strong> as residents if job slots are open and conditions are favorable. Residents need housing, food, and wages — they become your labor force.
          </p>
        </Section>

        {/* VI. Infrastructure & Territory */}
        <Section number="VI" title="Infrastructure & Territory">
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-3">
            The paths leading to your site pass through wilderness — forests with bandits, wild animals, and other hazards. Pilgrims who encounter danger turn back and may never come. Your reach is only as good as your roads are safe.
          </p>
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-5">
            You deploy <strong className="text-ink">guards on patrol routes</strong> along the paths. Guards are visible on the map, walking assigned routes. Different guard types cover different threats. More coverage means more pilgrims successfully arriving. This is your primary early-game lever for increasing traffic.
          </p>

          <h3 className="font-display text-[13px] font-semibold tracking-[1px] text-ink mb-2 mt-5">Road Tiers</h3>
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-4">
            Road quality determines who can use the path and in what numbers. The path must always remain connected end to end — breaking continuity during construction cuts off traffic. Build alternative routes before demolishing existing ones.
          </p>
          <TwoColumnGrid
            leftItems={[
              "Dirt track — individuals and small groups only",
              "Gravel road — small caravans, carts with goods",
            ]}
            rightItems={[
              "Cobblestone — large caravans, noble retinues",
              "Maintained highway — maximum throughput, all types",
            ]}
          />

          <h3 className="font-display text-[13px] font-semibold tracking-[1px] text-ink mb-2 mt-5">Terrain Types</h3>
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-4">
            Three terrain types shape routing decisions on each map. Terrain is a routing puzzle, not an ongoing management system.
          </p>
          <TwoColumnGrid
            leftItems={[
              "Clear land — build freely, standard cost",
              "Forest — must clear before building, costs gold and time",
            ]}
            rightItems={[
              "Hills — buildable but adds elevation cost; slows movement permanently regardless of road tier",
            ]}
          />

          <h3 className="font-display text-[13px] font-semibold tracking-[1px] text-ink mb-2 mt-5">Rivers</h3>
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-4">
            Rivers are static obstacles solved once with a single infrastructure decision — no ongoing management, no river-specific threats. Each crossing type has different cost and throughput implications.
          </p>
          <TwoColumnGrid
            leftItems={[
              "Ford — cheap, low throughput, passable by foot traffic only",
              "Bridge — mid-cost, full road tier, all traffic types",
            ]}
            rightItems={[
              "Dock — opens water route, brings maritime pilgrim types not available overland",
            ]}
          />

          <h3 className="font-display text-[13px] font-semibold tracking-[1px] text-ink mb-2 mt-5">Sphere of Influence</h3>
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-4">
            Your road network defines your territory. Everything operates within it — guards patrol within it, bandits are cleared within it, buildings are placed within it. It expands organically as you build outward. No explicit territory declaration needed: you build, and the world responds.
          </p>
          <div className="bg-parchment-dark border-l-[3px] border-gold px-5 py-4 my-5 italic text-base text-ink leading-relaxed">
            Early game: a small bubble around the relic. Late game: the sphere covers the full map. The road is the most visible record of everything you&apos;ve built.
          </div>
        </Section>

        {/* VII. Building Types */}
        <Section number="VII" title="Building Types (Draft)">
          <TwoColumnGrid
            leftTitle="Infrastructure"
            leftItems={[
              "Inn / Hostel (lodging)",
              "Tavern (food & drink)",
              "Road (path extension)",
              "Guard Post (patrol anchor)",
              "Marketplace (merchant draw)",
            ]}
            rightTitle="Prestige"
            rightItems={[
              "Chapel / Monastery (pious draw)",
              "Fairground (entertainment)",
              "Castle / Hall (government, tax tier)",
              "Shrine expansion (relic upgrades)",
              "Housing (resident capacity)",
            ]}
          />
        </Section>

        {/* VIII. Caravan Events */}
        <Section number="VIII" title="Caravan Events">
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-3">
            Beyond the steady trickle of individual pilgrims, the game features periodic <strong className="text-ink">caravan arrivals</strong> — a mass of NPCs traveling together, visually striking and economically significant. Inspired by the merchant caravans of Louis L&apos;Amour&apos;s <em>The Walking Drum</em>, these events capture the feeling of medieval travel as a communal, culturally rich undertaking.
          </p>
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-4">
            Caravans are triggered by <strong className="text-ink">Renown milestones</strong> — a reward for growth, not a random event. Watching a column of travelers, wagons, and varied characters crest the hill and move down your road toward the relic is the game&apos;s signature visual moment.
          </p>
          <div className="bg-parchment-dark border-l-[3px] border-gold px-5 py-4 my-5 italic text-base text-ink leading-relaxed">
            &ldquo;There was always the sound of the walking drum... so deeply is it embedded in the fibers of my being.&rdquo; — Louis L&apos;Amour
          </div>
          <TwoColumnGrid
            leftTitle="Caravan Mechanics"
            leftItems={[
              "Triggered by renown thresholds, not random timers",
              "Creates sudden spike in demand — tests infrastructure",
              "Composition reflects renown level (modest early, noble-led late)",
              "Must survive the road — guard patrols critical for arrival",
              "Delivers large patronage payment to the relic",
            ]}
            rightTitle="Caravan Composition"
            rightItems={[
              "Early: small merchant band, common pilgrims",
              "Mid: merchants, entertainers, scholars, clergy",
              "Late: nobles, foreign dignitaries, large retinues",
              "Acrobats, traders, guards, animals — visible variety",
              "Each arrival feels like an event, not background noise",
            ]}
          />
          <p className="text-base md:text-lg leading-relaxed text-ink-light mt-4">
            A possible late-game building: a <strong className="text-ink">Caravanserai</strong> — a waystation outside the city proper that signals to distant travelers you can receive large groups, unlocking larger and more frequent caravan events.
          </p>
        </Section>

        {/* IX. Tone & Aesthetic */}
        <Section number="IX" title="Tone & Aesthetic">
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-3">
            Isometric perspective. Medieval European settings — Germanic forest, English countryside, French hills, Italian countryside. Seasonal visuals (aesthetic, not necessarily gameplay-affecting). The feel is closer to RollerCoaster Tycoon than Age of Empires — management and observation, not combat and conquest.
          </p>
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-3">
            No RTS combat. Military elements (guards, walls) are defensive and logistical, not tactical.
          </p>
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-4">
            Art style: hand-drawn isometric assets with painterly warmth. Strong readable silhouettes over fine surface detail — assets must remain legible with many NPCs on screen simultaneously. Visual reference: Thronebreaker&apos;s color palette and atmosphere, RCT2&apos;s asset clarity and caricature-level readability.
          </p>
          <div className="bg-parchment-dark border-l-[3px] border-gold px-5 py-4 my-5 italic text-base text-ink leading-relaxed">
            Tonal reference: <em>The Walking Drum</em> by Louis L&apos;Amour — romanticized 12th century adventure. Warm, cosmopolitan, alive with cultural texture. Not grimdark. Not sanitized. The road itself is a character.
          </div>
        </Section>

        {/* X. Open Questions */}
        <Section number="X" title="Open Questions">
          <ul className="list-none p-0 m-0">
            {[
              "How granular is guard patrol configuration?",
              "Does renown decay if pilgrims have bad experiences?",
              "What triggers the \"anchor NPC arrival\" events (first merchant, first monk)?",
              "How does imported goods logistics work at scale?",
              "Seasonal variation: visual only, or does it affect pilgrim volume?",
              "Multi-path maps — do different paths bring different pilgrim types?",
              "Campaign scenarios vs. sandbox mode structure",
              "Engine / platform (Godot 4 primary, Phaser for early prototyping)",
              "Caravanserai as a late-game building — how does it modify caravan frequency and size?",
              "Does caravan composition change based on map setting (Germanic vs. Italian)?",
              "How is road connectivity enforced — hard block on demolition, or player warning?",
              "Does dock open a separate water path or merge into the main route?",
              "How is sphere of influence visualized — a visible boundary, a fog of war, or implied by building placement?",
            ].map((item, index) => (
              <li
                key={index}
                className="text-base leading-relaxed text-ink-light py-1 pl-4 relative before:content-['✦'] before:absolute before:left-0 before:text-[8px] before:text-gold before:top-[7px]"
              >
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <DocumentFooter />
      </article>
    </main>
  )
}
