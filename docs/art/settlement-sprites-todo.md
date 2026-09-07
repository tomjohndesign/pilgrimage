# Sprites still needed for the settlement loop

The house, tavern, market stall and sheep pen now drive real behaviour (see
`lib/game/sim.ts` and `lib/game/tavern.ts`), but several of those states borrow
an existing pose or quietly drop a prop. Each entry below is a piece of artwork
that would replace a stand-in. Nothing here blocks the simulation; it is the
list of what is currently being faked.

Everything follows the shared rules: the same pixel size as the character at
play zoom (see `CLAUDE.md`), the shared leg rig and ground contacts for anything
that walks ([assets/WALKING.md](../../assets/WALKING.md)), an editable rig with
**Show rig** in the asset playground, and late Dark Ages to early Middle Ages
materials and silhouettes.

## Characters

| Need | Currently | Notes |
| --- | --- | --- |
| **Sitting at a table** — a seated eating/drinking pose, ideally with a cup | reuses the existing `sitting` idle clip | The tavern benches carry a `sitting` contact (`support.clips`), so the pose is placed on the artwork already; it just is not a *dining* pose. A cup or bowl attachment would carry the whole tavern scene. |
| **Paying at a counter** — a short standing exchange | reuses the plain `idle` clip during the `buying` activity | Two seconds long; a coin-and-cup handover would read at play zoom. |
| **Serving behind a counter** — the tavern's two posted staff | reuses `idle` | Pouring, carrying a jug, wiping the board. Two staff stand either side of the counter (`WORK_POSTS.tavern`). |
| **Tending a fold** — the sheep pen's two posted herders | reuses `idle` | Leaning on a crook, forking hay into the trough. Posts are inside the fold (`WORK_POSTS["sheep-pen"]`). |
| **Keeping a stall** — the settled market vendor | reuses `idle` | Distinct from the roadside `vending` pose, which belongs to a parked cart. |
| **Sleeping in a bed** at home | reuses the monks' `sleeping` clip on the house's straw beds | Works, but the monk pose reads as a bedroll. |

## Animals and objects

| Need | Currently | Notes |
| --- | --- | --- |
| **Sheep** — standing, grazing, walking, and a lamb | nothing; the fold is empty | The whole point of the pen. Needs the shared animal rig and **Show rig** in the playground, like the existing birds. |
| **A settled vendor's cart** — where the wagon and draught animal go once a vendor takes over a market stall | the cart and animal simply disappear (`s.convoy` is cleared) | Options: park the wagon beside the stall as scenery, or stable the animal in a nearby pen. Until then a stall keeper is drawn on foot with no trace of the journey that brought them. |
| **Stall wares** — food and goods on the market counter that reflect what is actually sold | three static sacks | The stall now sells food and drink for coin, so its counter should show it. |
| **Tavern table dressing** — bowls, trenchers, a jug on the counter | four cups on two tables | The tables fill up with customers now; the settings should vary. |

## Not yet modelled at all

- **Traders drawn by a kept market stall.** The design calls for a staffed
  stall to raise the settlement's draw for trade over time. Nothing in the
  renown or traveler-generation code does this yet, and no trader-specific
  artwork exists.
- **A wagon or convoy visiting the market.** Wagons and horses stay on the road
  when their owner is drawn to a counter (`needsParking` is excluded from the
  counter trip), because there is no parking layout for the settlement's
  interior buildings the way there is for the shrine.
