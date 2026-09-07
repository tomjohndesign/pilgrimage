import { describe, expect, it } from "vitest"
import fixture from "./__fixtures__/bug-report.json"
import { browserDiagnostics, bugReportSchema, diagnosticsSchema, formatBugReport } from "./bug-report"

describe("bug report privacy", () => {
  it("keeps pertinent diagnostics but strips unknown fields recursively", () => {
    const input = structuredClone(fixture)
    const dirty = {
      ...input, email: "player@example.com", url: "https://game.test/?secret=token",
      userAgent: "private-device-identifier", logs: ["private file path"],
      camera: { ...input.camera, selection: { id: "private-name" } },
      settings: { ...input.settings, email: "private-name", elevation: { ...input.settings.elevation, token: "secret" } },
      buildings: [{ ...input.buildings[0], label: "private-name", id: "private-name",
        construction: { ...input.buildings[0].construction, contact: "private-name" } }],
    }
    expect(diagnosticsSchema.parse(dirty)).toEqual(input)
    const issue = formatBugReport({ message: "The traveler is stuck.", diagnostics: dirty } as never)
    expect(issue.body).toContain('"seed": 1234')
    for (const secret of ["private-name", "player@example.com", "private-device", "secret", "private file path"]) {
      expect(JSON.stringify(issue)).not.toContain(secret)
    }
  })

  it("rejects identifying strings smuggled into allowed diagnostic fields", () => {
    for (const patch of [{ version: "tom/branch" }, { browser: "player@example.com" }, { seed: "user-123" }, { platform: "Tom's MacBook" }]) {
      expect(diagnosticsSchema.safeParse({ ...fixture, ...patch }).success).toBe(false)
    }
    expect(diagnosticsSchema.safeParse({ ...fixture, seed: Infinity }).success).toBe(false)
  })

  it("requires a bounded message and bounds building attachments", () => {
    for (const message of ["   ", "x".repeat(4001)]) {
      expect(bugReportSchema.safeParse({ message, diagnostics: fixture }).success).toBe(false)
    }
    expect(diagnosticsSchema.safeParse({ ...fixture, buildings: Array(101).fill(fixture.buildings[0]) }).success).toBe(false)
  })

  it("preserves prose while fencing pasted Markdown and defanging mentions", () => {
    const issue = formatBugReport(bugReportSchema.parse({ message: "```\n@someone\n# Look here\n```", diagnostics: fixture }))
    expect(issue.body).toContain("````text\n```\n@\u200bsomeone\n# Look here\n```\n````")
    expect(issue.title).toBe("Bug report — Pilgrimage 0.0.97")
  })

  it("reduces user agents to coarse compatibility fields", () => {
    expect(browserDiagnostics("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0.123.45 Safari/537.36 secret-user", 1440))
      .toEqual({ browser: "Chrome", browserMajor: 140, platform: "macOS", viewport: "large" })
    expect(browserDiagnostics("Mozilla/5.0 Chrome/140.0 Safari/537.36 Edg/140.0", 800).browser).toBe("Edge")
    expect(browserDiagnostics("Mozilla/5.0 (iPhone) Version/18.2 Mobile Safari/604.1", 390))
      .toEqual({ browser: "Safari", browserMajor: 18, platform: "iOS", viewport: "small" })
    expect(browserDiagnostics("unrecognized private browser", 800).browser).toBe("Other")
  })
})
