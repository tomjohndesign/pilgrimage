import type { SimTraveler } from "./sim"
import { SpatialPoints } from "./spatial-points"

type Point = { x: number; z: number }
type Kind = "spot" | "music" | "alms" | "stall" | "gather"
interface Reservation extends Point { owner: SimTraveler; source: Point; kind: Kind; radius: number }

/** One local occupancy index per simulation tick. Live source checks release
 * old reservations immediately; additions keep later actors from choosing the
 * same seat. Movement of the person does not move their reserved destination. */
export class RoadsideReservations {
  private points = new SpatialPoints<Reservation>([])
  private previous = new Map<number, { spot: Point | null; music?: Point; alms?: Point; stall?: readonly Point[]; gather?: Point }>()

  constructor(people: Iterable<SimTraveler>) { for (const person of people) this.update(person) }

  update(owner: SimTraveler) {
    const spot = owner.spot, music = owner.musicVisit?.spot, alms = owner.almsVisit?.spot, stall = owner.stallRoute?.obstacles
    const gather = owner.partyGathering?.spot
    if (!spot && !music && !alms && !stall?.length && !gather) return
    const before = this.previous.get(owner.id)
    if (before && before.spot === spot && before.music === music && before.alms === alms && before.stall === stall && before.gather === gather) return
    const add = (source: Point | undefined | null, kind: Kind, radius: number) => {
      if (source) this.points.add({ x: source.x, z: source.z, source, owner, kind, radius })
    }
    if (spot !== before?.spot) add(spot, "spot", .9)
    if (music !== before?.music) add(music, "music", .9)
    if (alms !== before?.alms) add(alms, "alms", .9)
    if (stall !== before?.stall) for (const point of stall ?? []) add(point, "stall", 2)
    if (gather !== before?.gather) add(gather, "gather", .9)
    this.previous.set(owner.id, { spot, music, alms, stall, gather })
  }

  occupied(point: Point, ownerId: number): boolean {
    return !!this.points.firstWithin(point.x, point.z, 2, reservation => {
      const { owner, source, kind, radius } = reservation
      if (owner.id === ownerId || (source.x - point.x) ** 2 + (source.z - point.z) ** 2 >= radius ** 2) return false
      return kind === "spot" ? owner.spot === source : kind === "music" ? owner.musicVisit?.spot === source :
        kind === "alms" ? owner.almsVisit?.spot === source : kind === "gather" ? owner.partyGathering?.spot === source
          : !!owner.stallRoute?.obstacles.some(obstacle => obstacle === source)
    })
  }
}
