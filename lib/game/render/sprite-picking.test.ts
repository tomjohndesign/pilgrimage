import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { registerCharacterBatchEntry } from "./character-batch"
import { spriteTexelOpaque, spriteTexelRaycast } from "./sprite-picking"

/** A 4 × 2 atlas of two 2 × 2 frames: frame 0 is opaque only at its top-left
 * texel, frame 1 only at its bottom-right one. Row 0 is the top of the image. */
function atlas(): THREE.Texture {
  const data = new Uint8ClampedArray(4 * 2 * 4)
  data[(0 * 4 + 0) * 4 + 3] = 255
  data[(1 * 4 + 3) * 4 + 3] = 255
  data[(1 * 4 + 1) * 4 + 3] = 100
  const texture = new THREE.Texture({ width: 4, height: 2, data } as unknown as HTMLImageElement)
  texture.repeat.set(.5, 1)
  return texture
}

function figure(map: THREE.Texture): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, alphaTest: .5 }))
  sprite.scale.set(2, 2, 1)
  sprite.updateMatrixWorld(true)
  return sprite
}

describe("figure sprite picking", () => {
  it("reads the current atlas frame through the texture's repeat and offset", () => {
    const map = atlas(), sprite = figure(map)
    expect(spriteTexelOpaque(sprite, { x: .25, y: .75 })).toBe(true)
    expect(spriteTexelOpaque(sprite, { x: .75, y: .25 })).toBe(false)
    map.offset.set(.5, 0)
    expect(spriteTexelOpaque(sprite, { x: .25, y: .75 })).toBe(false)
    expect(spriteTexelOpaque(sprite, { x: .75, y: .25 })).toBe(true)
  })

  it("honours the material's alpha test", () => {
    const sprite = figure(atlas())
    expect(spriteTexelOpaque(sprite, { x: .75, y: .25 })).toBe(false)
    sprite.material.alphaTest = 0
    expect(spriteTexelOpaque(sprite, { x: .75, y: .25 })).toBe(true)
  })

  it("uses a batched figure's published frame over its own texture view", () => {
    const shared = atlas(), sprite = figure(atlas())
    registerCharacterBatchEntry({ sprite, ids: new THREE.Sprite(), color: shared, uv: new THREE.Vector4(.5, 1, .5, 0),
      ground: { value: new THREE.Vector4() }, depth: { map: { value: null }, enabled: { value: true } }, id: new THREE.Vector3() })
    expect(spriteTexelOpaque(sprite, { x: .25, y: .75 })).toBe(false)
    expect(spriteTexelOpaque(sprite, { x: .75, y: .25 })).toBe(true)
  })

  it("keeps sprites without a readable image fully clickable", () => {
    const sprite = figure(new THREE.Texture())
    expect(spriteTexelOpaque(sprite, { x: .9, y: .9 })).toBe(true)
  })

  it("drops quad hits on transparent texels during raycasting", () => {
    const sprite = figure(atlas())
    sprite.raycast = spriteTexelRaycast
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 20)
    camera.position.z = 10
    camera.updateMatrixWorld(true)
    const raycaster = new THREE.Raycaster()
    const hitsAt = (x: number, y: number) => { raycaster.setFromCamera(new THREE.Vector2(x, y), camera); return raycaster.intersectObject(sprite) }
    // Quad uv (.25, .75) sits at world (-.5, .5): the opaque top-left texel.
    expect(hitsAt(-.25, .25)).toHaveLength(1)
    expect(hitsAt(.25, -.25)).toHaveLength(0)
    expect(hitsAt(.75, .75)).toHaveLength(0)
  })
})
