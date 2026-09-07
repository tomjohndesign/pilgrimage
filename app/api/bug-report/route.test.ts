import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fixture from "../../../lib/__fixtures__/bug-report.json"
import { BUG_REPORT_BODY_LIMIT } from "../../../lib/bug-report"

let POST: typeof import("./route").POST
const payload = () => ({ message: "A traveler is stuck.", diagnostics: structuredClone(fixture) })
const request = (body: unknown = payload(), headers: Record<string, string> = {}) => new Request("https://game.test/api/bug-report", {
  method: "POST", headers: { origin: "https://game.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body),
})
let github: ReturnType<typeof vi.fn>
beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv("BUG_REPORT_GITHUB_TOKEN", "test-server-token")
  github = vi.fn().mockImplementation(async () => Response.json({ number: 42 }))
  vi.stubGlobal("fetch", github)
  POST = (await import("./route")).POST
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe("anonymous GitHub issue endpoint", () => {
  it("creates an issue as the server account without forwarding identifying fields or headers", async () => {
    const report = payload()
    Object.assign(report.diagnostics, { email: "player@example.com", url: "private-url" })
    const response = await POST(request(report, { cookie: "session=secret", "x-forwarded-for": "192.0.2.1" }))
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ url: "https://github.com/tomjohndesign/pilgrimage/issues/42" })
    const [url, init] = github.mock.calls[0]
    expect(url).toBe("https://api.github.com/repos/tomjohndesign/pilgrimage/issues")
    expect(init.headers.Authorization).toBe("Bearer test-server-token")
    expect(JSON.stringify(init)).not.toMatch(/player@example|private-url|session=secret|192\.0\.2\.1/)
    expect(JSON.parse(init.body).body).toContain('"seed": 1234')
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it("fails clearly without a configured credential", async () => {
    vi.stubEnv("BUG_REPORT_GITHUB_TOKEN", "")
    expect((await POST(request())).status).toBe(503)
    expect(github).not.toHaveBeenCalled()
  })

  it("rejects foreign origins, wrong content types and malformed reports before GitHub", async () => {
    expect((await POST(request(payload(), { origin: "https://foreign.test" }))).status).toBe(403)
    expect((await POST(request(payload(), { "content-type": "text/plain" }))).status).toBe(415)
    expect((await POST(request({ message: "", diagnostics: fixture }))).status).toBe(400)
    const malformed = new Request("https://game.test/api/bug-report", { method: "POST", headers: { origin: "https://game.test", "content-type": "application/json" }, body: "{" })
    expect((await POST(malformed)).status).toBe(400)
    expect(github).not.toHaveBeenCalled()
  })

  it("bounds bytes even without a content-length header", async () => {
    expect((await POST(request({ ...payload(), unexpected: "x".repeat(BUG_REPORT_BODY_LIMIT) }))).status).toBe(413)
    expect(github).not.toHaveBeenCalled()
  })

  it("does not expose GitHub error bodies or secrets", async () => {
    github.mockResolvedValue(new Response("test-server-token private upstream error", { status: 401 }))
    const response = await POST(request())
    expect(response.status).toBe(502)
    expect(await response.text()).not.toMatch(/test-server-token|private upstream/)
  })

  it("explains uncertain delivery without automatically retrying", async () => {
    github.mockRejectedValue(new Error("private network details"))
    const response = await POST(request())
    expect(response.status).toBe(502)
    expect((await response.json()).error).toContain("may have arrived")
    expect(github).toHaveBeenCalledTimes(1)
  })

  it("limits issue creation attempts per instance without retaining player identifiers", async () => {
    for (let i = 0; i < 10; i++) expect((await POST(request())).status).toBe(201)
    expect((await POST(request())).status).toBe(429)
    expect(github).toHaveBeenCalledTimes(10)
  })
})
