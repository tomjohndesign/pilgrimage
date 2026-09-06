import { NextRequest, NextResponse } from "next/server"
import { buildingPrompt, recipeSchema } from "@/lib/game/building-art/style"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const MAX_REFERENCE = 8 * 1024 * 1024
// Four rendered terrain views contain more detail than a flat vector guide.
const MAX_GUIDE = 8 * 1024 * 1024
let generating = false

/** Development-only: the public gallery must never expose a paid generation endpoint. */
function localRequest(request: NextRequest, requireOrigin = false): boolean {
  const hosts = ["localhost", "127.0.0.1", "[::1]"]
  if (process.env.NODE_ENV !== "development" || !hosts.includes(request.nextUrl.hostname)) return false
  const origin = request.headers.get("origin")
  if (!origin) return !requireOrigin
  try { return new URL(origin).origin === request.nextUrl.origin } catch { return false }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ available: localRequest(request) && Boolean(process.env.OPENAI_API_KEY), localOnly: true }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  if (!localRequest(request, true)) return NextResponse.json({ error: "Generation is available only from the local development workshop." }, { status: 403 })
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Set OPENAI_API_KEY in .env.local and restart the dev server. You can also copy the prompt into Image Gen 2." }, { status: 503 })
  if (generating) return NextResponse.json({ error: "A building is already being generated. Try again when it finishes." }, { status: 429 })
  const length = Number(request.headers.get("content-length"))
  if (!Number.isFinite(length) || length <= 0 || length > MAX_REFERENCE + MAX_GUIDE + 32_768) return NextResponse.json({ error: "Use a reference image smaller than 8 MB." }, { status: 413 })
  generating = true
  try {
    const form = await request.formData()
    const recipe = recipeSchema.safeParse(JSON.parse(String(form.get("recipe"))))
    if (!recipe.success) return NextResponse.json({ error: "The building recipe is invalid." }, { status: 400 })
    const guide = form.get("guide")
    if (!(guide instanceof File) || guide.type !== "image/png" || guide.size > MAX_GUIDE || !guide.size) return NextResponse.json({ error: "A four-view isometric registration guide is required." }, { status: 400 })
    const reference = form.get("reference")
    if (reference && (!(reference instanceof File) || reference.size > MAX_REFERENCE || !["image/png", "image/jpeg", "image/webp"].includes(reference.type))) return NextResponse.json({ error: "Use a PNG, JPEG or WebP reference smaller than 8 MB." }, { status: 400 })
    const settings = { model: "gpt-image-2", prompt: buildingPrompt(recipe.data), size: "2048x2048", quality: "medium", output_format: "png", background: recipe.data.output === "sprite" ? "transparent" : "opaque", n: 1 }
    const body = new FormData()
    for (const [key, value] of Object.entries(settings)) body.set(key, String(value))
    body.append("image[]", guide)
    if (reference instanceof File) body.append("image[]", reference)
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body, signal: AbortSignal.timeout(240_000),
    })
    if (!response.ok) {
      const message = response.status === 401 ? "The local API key was not accepted." : response.status === 429 ? "Image Gen 2 is rate limited or the account has reached its quota." : "Image Gen 2 could not complete this request. Try again, or use an ivory concept if transparent output is unavailable for your account."
      return NextResponse.json({ error: message }, { status: 502 })
    }
    const result = await response.json()
    const png = result.data?.[0]?.b64_json
    if (typeof png !== "string" || !png.length) return NextResponse.json({ error: "Image Gen 2 returned no image." }, { status: 502 })
    return NextResponse.json({ image: `data:image/png;base64,${png}`, model: settings.model, prompt: settings.prompt, views: 4, layout: "2x2" }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "The building recipe is invalid." }, { status: 400 })
    return NextResponse.json({ error: "Generation was interrupted or timed out. Your recipe is still here; try again." }, { status: 502 })
  } finally { generating = false }
}
