import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { CHARACTER_COLOR_LAYER, CHARACTER_ID_LAYER, tagPixelCharacters, withoutPixelCharacters } from "./pixel-characters"
import { OUTLINE_ID_LAYER, SELECTED_CHARACTER_LAYER } from "./outline"

describe("separate character rendering", () => {
  it("includes sprites, carried geometry, and lights without changing picking or ID identity", () => {
    const scene = new THREE.Scene(), root = new THREE.Group()
    const sprite = new THREE.Sprite(), cart = new THREE.Mesh(), id = new THREE.Mesh(), world = new THREE.Mesh(), light = new THREE.AmbientLight()
    sprite.layers.enable(SELECTED_CHARACTER_LAYER)
    id.layers.set(OUTLINE_ID_LAYER)
    root.add(sprite, cart, id); scene.add(root, world, light)
    tagPixelCharacters([root], scene)
    for (const object of [sprite, cart, light]) {
      expect(object.layers.isEnabled(0)).toBe(true)
      expect(object.layers.isEnabled(CHARACTER_COLOR_LAYER)).toBe(true)
    }
    expect(sprite.layers.isEnabled(SELECTED_CHARACTER_LAYER)).toBe(true)
    expect(id.layers.isEnabled(CHARACTER_ID_LAYER)).toBe(true)
    expect(id.layers.isEnabled(CHARACTER_COLOR_LAYER)).toBe(false)
    expect(world.layers.isEnabled(CHARACTER_COLOR_LAYER)).toBe(false)
  })

  it("picks up newly mounted equipment and restores visibility even if rendering fails", () => {
    const scene = new THREE.Scene(), root = new THREE.Group(), hiddenRoot = new THREE.Group(), awning = new THREE.Group()
    hiddenRoot.visible = awning.visible = false
    root.add(awning); scene.add(root, hiddenRoot)
    tagPixelCharacters([root], scene)
    const gear = new THREE.Mesh(); root.add(gear)
    tagPixelCharacters([root], scene)
    expect(gear.layers.isEnabled(CHARACTER_COLOR_LAYER)).toBe(true)
    expect(() => withoutPixelCharacters([root, hiddenRoot], () => {
      expect(root.visible).toBe(false)
      expect(hiddenRoot.visible).toBe(false)
      throw new Error("render failed")
    })).toThrow("render failed")
    expect(root.visible).toBe(true)
    expect(hiddenRoot.visible).toBe(false)
    expect(awning.visible).toBe(false)
  })
})
