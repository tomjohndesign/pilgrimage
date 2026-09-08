import { describe, expect, it } from "vitest"
import { Group, Sprite } from "three"
import { isWorldVisible } from "./visibility"

describe("animated figure visibility", () => {
  it("follows hidden ancestors and resumes nested people and transport", () => {
    const world = new Group(), person = new Group(), driver = new Group(), sprite = new Sprite()
    world.add(person); person.add(driver); driver.add(sprite)
    expect(isWorldVisible(sprite)).toBe(true)
    person.visible = false
    expect(driver.visible).toBe(true)
    expect(isWorldVisible(sprite)).toBe(false)
    person.visible = true
    expect(isWorldVisible(sprite)).toBe(true)
    driver.visible = false
    expect(isWorldVisible(sprite)).toBe(false)
    expect(isWorldVisible(null)).toBe(false)
  })
})
