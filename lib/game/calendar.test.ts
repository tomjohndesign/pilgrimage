import { describe, expect, it } from "vitest"
import { formatGameTime, gameDate } from "./calendar"

describe("game calendar", () => {
  it("starts March 1, 825 AD and changes only at day boundaries", () => {
    expect(formatGameTime(0)).toBe("March 1, 825 AD")
    expect(formatGameTime(.99999)).toBe("March 1, 825 AD")
    expect(formatGameTime(1)).toBe("March 2, 825 AD")
    expect(formatGameTime(31)).toBe("April 1, 825 AD")
    expect(formatGameTime(306)).toBe("January 1, 826 AD")
    expect(formatGameTime(365)).toBe("March 1, 826 AD")
  })
  it("handles leap days and four-year blocks", () => {
    expect(formatGameTime(365 * 3 - 1)).toBe("February 28, 828 AD")
    expect(formatGameTime(365 * 3)).toBe("February 29, 828 AD")
    expect(formatGameTime(365 * 3 + 1)).toBe("March 1, 828 AD")
    expect(gameDate(1461)).toEqual({ day: 1, month: 3, year: 829 })
  })
})
