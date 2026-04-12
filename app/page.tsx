import { DocumentHeader } from "@/components/document-header"
import { Section } from "@/components/section"
import { PhaseGrid } from "@/components/phase-grid"
import { CoreLoop } from "@/components/core-loop"
import { TwoColumnGrid } from "@/components/two-column-grid"
import { Divider } from "@/components/divider"
import { DocumentFooter } from "@/components/document-footer"

export default function PilgrimagePage() {
  return (
    <main className="min-h-screen bg-[#1a1208] px-5 py-10 md:px-5 md:py-10">
      <article className="relative mx-auto max-w-[780px] bg-parchment p-7 md:p-[60px_70px] shadow-[0_0_0_1px_var(--rule),0_0_0_4px_var(--parchment-dark),0_0_0_5px_var(--rule),8px_8px_40px_rgba(0,0,0,0.7)] page-border parchment-texture">
        
        <DocumentHeader />

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

        {/* VI. Safety & Roads */}
        <Section number="VI" title="Safety & Roads">
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-3">
            The paths leading to your site pass through wilderness — forests with bandits, wild animals, and other hazards. Pilgrims who encounter danger turn back and may never come. Your reach is only as good as your roads are safe.
          </p>
          <p className="text-base md:text-lg leading-relaxed text-ink-light">
            You deploy <strong className="text-ink">guards on patrol routes</strong> along the paths. Guards are visible on the map, walking assigned routes. Different guard types cover different threats. More coverage means more pilgrims successfully arriving. This is your primary early-game lever for increasing traffic.
          </p>
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

        {/* VIII. Tone & Aesthetic */}
        <Section number="VIII" title="Tone & Aesthetic">
          <p className="text-base md:text-lg leading-relaxed text-ink-light mb-3">
            Isometric perspective. Medieval European settings — Germanic forest, English countryside, French hills, Italian countryside. Seasonal visuals (aesthetic, not necessarily gameplay-affecting). The feel is closer to RollerCoaster Tycoon than Age of Empires — management and observation, not combat and conquest.
          </p>
          <p className="text-base md:text-lg leading-relaxed text-ink-light">
            No RTS combat. Military elements (guards, walls) are defensive and logistical, not tactical.
          </p>
        </Section>

        {/* IX. Open Questions */}
        <Section number="IX" title="Open Questions">
          <ul className="list-none p-0 m-0">
            {[
              "How granular is guard patrol configuration?",
              "Does renown decay if pilgrims have bad experiences?",
              "What triggers the \"anchor NPC arrival\" events (first merchant, first monk)?",
              "How does imported goods logistics work at scale?",
              "Seasonal variation: visual only, or does it affect pilgrim volume?",
              "Multi-path maps — do different paths bring different pilgrim types?",
              "Campaign scenarios vs. sandbox mode structure",
              "Engine / platform (browser vs. Godot vs. Unity)",
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
