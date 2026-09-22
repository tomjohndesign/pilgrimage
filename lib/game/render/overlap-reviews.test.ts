import { expect, it } from "vitest"
import sharp from "sharp"
import * as THREE from "three"
import reviews from "./__fixtures__/overlap-reviews.json"
import { parseExperiments, experimentCamera, experimentEngineOrder, experimentSortAnchor } from "../overlap-experiments"
import { spriteRow } from "../character-assets"
import { yawForView } from "./iso"
import { TILE_HEIGHT } from "../map/terrain"
import { characterOverlapBounds } from "./character-overlap"
import { overlapBiases, overlapOrder } from "./overlap-order"

/** User corrections from 21 September. Keep the original baseline and exact
 * sprite frames: list moves between non-overlapping figures are not visual constraints. */
it("satisfies every edited overlapping pair and tracks the one conflicting older review", async () => {
  const suite = parseExperiments(JSON.stringify(reviews)), frames = new Map<string, THREE.DataTexture>()
  let corrected = 0, confirmed = 0
  const conflicts: string[] = []
  try {
    for (const scene of suite.tests) {
      const camera = experimentCamera(scene.view), materials: THREE.SpriteMaterial[] = []
      const participants = []
      for (const [index, actor] of scene.actors.entries()) {
        const asset = actor.sprite, row = asset.rowOffset + spriteRow(actor.heading * Math.PI / 180, yawForView(scene.view), asset.directions)
        const key = `${asset.depth}:${row}:${asset.start + actor.frame}`
        let depth = frames.get(key)
        if (!depth) {
          const file = `public${asset.depth}`, metadata = await sharp(file).metadata()
          const width = metadata.width! / asset.columns, height = metadata.height! / asset.rows
          const data = await sharp(file).extract({ left: (asset.start + actor.frame) * width, top: row * height, width, height }).ensureAlpha().raw().toBuffer()
          depth = new THREE.DataTexture(new Uint8Array(data), width, height); depth.flipY = true
          frames.set(key, depth)
        }
        const material = new THREE.SpriteMaterial(), sprite = new THREE.Sprite(material), anchor = new THREE.Group()
        materials.push(material); anchor.add(sprite)
        anchor.position.set(actor.x, TILE_HEIGHT + actor.elevation, actor.z); anchor.userData.heading = actor.heading * Math.PI / 180
        sprite.center.set(...asset.center); sprite.scale.setScalar(asset.worldSize * actor.scale); sprite.updateWorldMatrix(true, false)
        participants.push(characterOverlapBounds({ sprite, ids: sprite, overlapAnchor: anchor,
          ground: { value: new THREE.Vector4() }, depth: { map: { value: depth }, enabled: { value: true } },
          id: new THREE.Vector3((actor.sortId ?? index + 1) / 255, 0, 0), railPart: asset.railPart, railSeat: experimentSortAnchor(actor),
        }, camera))
      }
      const order = overlapOrder(participants).map(i => scene.actors[i].id), biases = overlapBiases(participants)
      expect(order).toEqual(experimentEngineOrder(scene))
      for (let i = 0; i < scene.actors.length; i++) for (let j = i + 1; j < scene.actors.length; j++) {
        const a = participants[i], b = participants[j], aid = scene.actors[i].id, bid = scene.actors[j].id
        if (a.left >= b.right || b.left >= a.right || a.bottom >= b.top || b.bottom >= a.top) continue
        const expected = scene.manualOrder.indexOf(aid) > scene.manualOrder.indexOf(bid)
        const original = scene.engineOrder.indexOf(aid) > scene.engineOrder.indexOf(bid)
        const actual = order.indexOf(aid) > order.indexOf(bid)
        if (expected !== original) {
          corrected++
          expect(actual, `${scene.id}: ${aid} / ${bid}`).toBe(expected)
          const front = expected ? i : j, back = expected ? j : i
          expect(participants[front].far - biases[front]).toBeLessThan(participants[back].near - biases[back])
        } else if (scene.reviewed) {
          confirmed++
          if (actual !== expected) conflicts.push(`${scene.id}:${aid}:${bid}`)
        }
      }
      materials.forEach(material => material.dispose())
    }
    expect(corrected).toBe(37)
    expect(confirmed).toBeGreaterThan(40)
    // This earlier untouched pair conflicts with the explicit driver-in-front
    // correction in round-3-path-3-view-1. Prefer that newer review, without an ID/view exception.
    expect(conflicts).toEqual(["opposingCarts-20260933:actor-5:actor-6"])
  } finally { frames.forEach(texture => texture.dispose()) }
}, 30000)
