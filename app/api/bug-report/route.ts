import { BUG_REPORT_BODY_LIMIT, BUG_REPORT_REPOSITORY, bugReportSchema, formatBugReport } from "../../../lib/bug-report"

export const runtime = "nodejs"

// A bounded per-instance circuit breaker, without retaining IPs or identifiers.
// Production also needs a shared edge rate limit; see docs/bug-reports.md.
let windowStart = 0
let attempts = 0
const reply = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } })

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply("This request must come from the game.", 403)
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return reply("Expected a JSON report.", 415)
  const token = process.env.BUG_REPORT_GITHUB_TOKEN
  if (!token) return reply("Bug reporting is not configured yet. Please try again later.", 503)

  // Enforce the actual byte count, including chunked requests with no declared size.
  if (Number(request.headers.get("content-length")) > BUG_REPORT_BODY_LIMIT) return reply("The report is too large.", 413)
  const reader = request.body?.getReader()
  if (!reader) return reply("The report is empty.", 400)
  let body = ""
  let bytes = 0
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > BUG_REPORT_BODY_LIMIT) {
        await reader.cancel()
        return reply("The report is too large.", 413)
      }
      body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()
  } catch {
    return reply("The report could not be read.", 400)
  } finally {
    reader.releaseLock()
  }
  let parsed
  try { parsed = bugReportSchema.safeParse(JSON.parse(body)) }
  catch { return reply("The report is invalid.", 400) }
  if (!parsed.success) return reply("Please include a message and valid session diagnostics.", 400)

  const now = Date.now()
  if (now - windowStart >= 60 * 60 * 1000) { windowStart = now; attempts = 0 }
  if (attempts >= 10) return reply("Too many reports. Please try again in an hour.", 429)
  attempts++

  try {
    const response = await fetch(`https://api.github.com/repos/${BUG_REPORT_REPOSITORY}/issues`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(formatBugReport(parsed.data)),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    })
    if (!response.ok) return reply("GitHub could not accept the report. Your message is still here; please try again later.", 502)
    const issue = await response.json()
    if (!Number.isSafeInteger(issue.number) || issue.number <= 0) throw new Error("Invalid issue response")
    return Response.json({ url: `https://github.com/${BUG_REPORT_REPOSITORY}/issues/${issue.number}` },
      { status: 201, headers: { "Cache-Control": "no-store" } })
  } catch {
    // Never forward GitHub errors, request headers or credentials to the player.
    return reply("Delivery could not be confirmed. Your report may have arrived; please check the repository before retrying.", 502)
  }
}
