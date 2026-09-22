import { populationVisual } from "./base-person/population-assets"
import { BASE_CHARACTER_SCALE } from "./base-person/gait"
import { animalUrl, cartUrl, ANIMAL_COLUMNS, TRANSPORT, CART, DRIVER_SEAT, RIG_TO_WORLD } from "./transport/assets"
import { animalCoat } from "./transport/coats"
import { EXPERIMENT_TRANSPORT, type ExperimentActor, type ExperimentSprite } from "./overlap-experiments"
import type { TravelerTypeId } from "./travelers"
import { handlerVisual } from "./transport/handler-assets"
import transport from "../../public/textures/transport/v26/manifest.json"
import { bodySortAnchor } from "./render/body-sort-anchor"

/** Snapshot the same shipped atlases, frame ranges, anchors and scale as the game. */
export function experimentSprite(kind: ExperimentActor["kind"], variant: number, clip: ExperimentActor["clip"]): ExperimentSprite {
  if (kind === "packHandler") {
    const visual = handlerVisual("peasant", variant), motion = clip === "idle" ? visual.idle : clip === "wearyWalk" ? visual.actions.wearyWalk! : visual.walk
    return { url: motion.url, depth: motion.depth!, columns: motion.columns, rows: motion.rows,
      directions: 8, rowOffset: visual.rowOffset, start: 0, frames: motion.columns, center: visual.center,
      worldSize: visual.scale * BASE_CHARACTER_SCALE }
  }
  if ((EXPERIMENT_TRANSPORT as readonly string[]).includes(kind)) {
    const driver = kind === "cartDriver", cart = ["cart", "horseCart", "donkeyCart"].includes(kind), cartFrame = cart || driver
    const cell = cartFrame ? CART.cellSize : TRANSPORT.cellSize, anchor = cartFrame ? CART.anchor : TRANSPORT.anchor
    const animal = kind.toLowerCase().includes("donkey") ? "donkey" : kind.toLowerCase().includes("ox") ? "ox" : "horse"
    const pack = kind.startsWith("pack"), hitched = kind.startsWith("hitched")
    const url = driver ? `/textures/transport/${TRANSPORT.version}/cart-produce-driver.png` : cart ? cartUrl("produce", kind === "cart" ? "hand" : kind === "horseCart" ? "horse" : "donkey") : animalUrl(animal, animalCoat(animal).id, hitched, pack)
    const motion = clip === "idle" ? transport.animalClips.idle : transport.animalClips.walk
    return { url, depth: url.replace(/([^/]+)$/, "depth-$1"), columns: driver ? transport.driverClip.variants : cart ? TRANSPORT.wheelFrames : ANIMAL_COLUMNS,
      rows: cartFrame ? CART.directions : animal === "horse" && !pack ? transport.animalRows.horse : 8,
      directions: cartFrame ? 16 : 8, rowOffset: 0, start: driver ? variant % transport.driverClip.variants : cart ? 0 : motion.start,
      frames: driver ? 1 : cart ? clip === "idle" ? 1 : TRANSPORT.wheelFrames : motion.frames,
      center: [anchor[0] / cell, 1 - anchor[1] / cell], worldSize: cell * TRANSPORT.scale / TRANSPORT.cellSize * BASE_CHARACTER_SCALE,
      railPart: driver ? 3 : cart ? 1 : 2,
      ...(driver ? { railSeat: bodySortAnchor(RIG_TO_WORLD * BASE_CHARACTER_SCALE, DRIVER_SEAT) } : {}) }
  }
  const visual = populationVisual(kind as TravelerTypeId, variant, null)
  const motion = clip === "idle" ? visual.idle : clip === "walk" ? visual.walk : visual.actions[clip] ?? visual.walk
  if (!motion.depth) throw new Error(`Missing depth atlas for ${kind}/${clip}`)
  return { url: motion.url, depth: motion.depth, columns: motion.columns, rows: motion.rows,
    directions: 8, rowOffset: visual.rowOffset, start: 0, frames: motion.columns, center: visual.center,
    worldSize: visual.scale * BASE_CHARACTER_SCALE }
}
