import { personBody, type PersonDesign } from "../base-person/design"
import { walkContact } from "../base-person/gait"

const rigs = new WeakMap<PersonDesign, ReturnType<typeof createSpriteGait>>()

/** Baked visual designs are immutable, like the atlas that owns them. Share
 * their body and authored support contacts across people; per-person distance,
 * scale, direction and world-space foot plants remain independent. Authoring
 * tools continue to resolve mutable drafts directly through personBody. */
export function spriteGait(design: PersonDesign) {
  let rig = rigs.get(design)
  if (!rig) { rig = createSpriteGait(design); rigs.set(design, rig) }
  return rig
}

function createSpriteGait(design: PersonDesign) {
  const body = personBody(design), contacts = new Map<number, ReturnType<typeof walkContact>[]>()
  return { body, contact(frame: number, columns: number, strides: number) {
    const perStride = columns / strides
    if (!Number.isInteger(perStride) || perStride <= 0) return walkContact(frame / perStride, columns, body, strides)
    let poses = contacts.get(perStride)
    if (!poses) {
      poses = Array.from({ length: perStride }, (_, frame) => walkContact(frame / perStride, columns, body, strides))
      contacts.set(perStride, poses)
    }
    return poses[frame % perStride]
  } }
}
