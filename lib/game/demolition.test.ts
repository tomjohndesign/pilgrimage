import { describe, expect, it } from "vitest"
import { clearDemolishedBuildings } from "./demolition"
import { createSim } from "./sim"
import { generateMap } from "./map/generate-map"
import { generateTravelers } from "./travelers"
import { generateMonks } from "./monks"
import { emptyFoodStock } from "./storage"

describe("demolition cleanup", () => {
  it("releases residents and stored goods without advancing time or disturbing other travelers", () => {
    const map = generateMap({ seed: 31 })
    const travelers = generateTravelers(31, 3)
    const sim = createSim(travelers, map)
    const [worker, resident, unaffected] = [...sim.travelers.values()]
    const before = { ...unaffected }
    Object.assign(worker, { employer: "demolished", home: "surviving-home", activity: "posted" })
    Object.assign(resident, { home: "demolished", activity: "sleeping" })
    const monk = { ...generateMonks(31)[0], home: "demolished", bedSlot: 0 }
    sim.joinedMonks.set(monk.id, monk)
    sim.foodStores.set("demolished", emptyFoodStock())
    sim.foodStores.set("surviving-home", emptyFoodStock())
    sim.piles.set("pile", { id: "pile", campId: "demolished", wood: 10, slot: 0 })
    const time = sim.time
    clearDemolishedBuildings(sim, new Set(["demolished"]), map)
    expect(sim.time).toBe(time)
    expect(worker).toMatchObject({ employer: null, home: "surviving-home", activity: "idle", jobless: true })
    expect(resident).toMatchObject({ home: null, activity: "walking" })
    expect(sim.joinedMonks.get(monk.id)?.home).toBeUndefined()
    expect(sim.foodStores.has("demolished")).toBe(false)
    expect(sim.foodStores.has("surviving-home")).toBe(true)
    expect(sim.piles.size).toBe(0)
    expect(unaffected).toEqual(before)
  })
})
