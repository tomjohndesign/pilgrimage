import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { DEFAULT_RECIPE } from "../../../../lib/game/building-art/style"
vi.mock("@/lib/game/building-art/style", async () => import("../../../../lib/game/building-art/style"))
import { GET, POST } from "./route"

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
function request(recipe: unknown = DEFAULT_RECIPE, origin = "http://localhost:3100", includeGuide = true) {
  const body = new FormData(); body.set("recipe", JSON.stringify(recipe)); if (includeGuide) body.set("guide", new File(["png"], "guide.png", { type: "image/png" }))
  return new NextRequest("http://localhost:3100/api/buildings/generate", { method: "POST", body, headers: { origin, "content-length": "2000" } })
}
function configured() { vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("OPENAI_API_KEY", "test-key") }

describe("local building generation", () => {
  it("refuses paid requests in production even with a configured key", async () => {
    configured(); vi.stubEnv("NODE_ENV", "production")
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch)
    expect((await POST(request())).status).toBe(403)
    expect((await (await GET(request())).json()).available).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
  it("refuses foreign origins, absent credentials and invalid recipes without contacting OpenAI", async () => {
    configured(); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch)
    expect((await POST(request(DEFAULT_RECIPE,"https://example.com"))).status).toBe(403)
    expect((await POST(request({ ...DEFAULT_RECIPE, width: 1000 }))).status).toBe(400)
    expect((await POST(request(DEFAULT_RECIPE, "http://localhost:3100", false))).status).toBe(400)
    vi.stubEnv("OPENAI_API_KEY", "")
    expect((await POST(request())).status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })
  it("uses Image Gen 2 with the server-built prompt and returns its PNG", async () => {
    configured()
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: [{ b64_json: "test-png" }] })); vi.stubGlobal("fetch", fetch)
    const response = await POST(request({ ...DEFAULT_RECIPE, output: "sprite" }))
    expect(response.status).toBe(200)
    expect((await response.json()).image).toBe("data:image/png;base64,test-png")
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe("https://api.openai.com/v1/images/edits")
    expect(Object.fromEntries(options.body)).toMatchObject({ model:"gpt-image-2", n:"1", size:"2048x2048", background:"transparent" })
    expect(options.body.getAll("image[]")).toHaveLength(1)
    expect(options.body.get("image[]").name).toBe("guide.png")
    expect(options.body.get("prompt")).toContain("top-left 0 southeast")
  })
  it("releases the generation lock after an upstream failure", async () => {
    configured(); vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")))
    expect((await POST(request())).status).toBe(502)
    expect((await POST(request())).status).toBe(502)
  })
  it("accepts a textured map guide larger than the old vector limit with a style reference", async () => {
    configured()
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: [{ b64_json: "test-png" }] }))
    vi.stubGlobal("fetch", fetch)
    const body = new FormData()
    body.set("recipe", JSON.stringify(DEFAULT_RECIPE))
    body.set("guide", new File([new Uint8Array(3 * 1024 * 1024)], "map-guide.png", { type: "image/png" }))
    body.set("reference", new File(["png"], "study.png", { type: "image/png" }))
    const response = await POST(new NextRequest("http://localhost:3100/api/buildings/generate", {
      method: "POST", body, headers: { origin: "http://localhost:3100", "content-length": String(3 * 1024 * 1024 + 2000) },
    }))
    expect(response.status).toBe(200)
    expect(fetch.mock.calls[0][1].body.getAll("image[]").map((file: File) => file.name)).toEqual(["map-guide.png", "study.png"])
    expect(fetch.mock.calls[0][1].body.get("prompt")).toContain("actual procedural building on game terrain")
  })
})
