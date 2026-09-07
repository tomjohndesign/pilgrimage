import { z } from "zod"

export const BUG_REPORT_REPOSITORY = "tomjohndesign/pilgrimage"
export const BUG_REPORT_MESSAGE_LIMIT = 4000
export const BUG_REPORT_BODY_LIMIT = 48_000
const number = z.number().finite().min(-1e12).max(1e12)
const count = z.number().int().min(0).max(1e12)
const numericFields = <T extends string>(keys: readonly T[]) =>
  z.object(Object.fromEntries(keys.map(key => [key, number])) as Record<T, typeof number>)

/** Explicit allowlist shared by the preview and server. Unknown keys are stripped
 * at every level; never serialize a store, browser object, URL or raw log. */
export const diagnosticsSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/).max(24),
  environment: z.enum(["development", "production"]),
  sessionMinutes: count,
  browser: z.enum(["Firefox", "Edge", "Chrome", "Safari", "Other"]),
  browserMajor: count.max(999).nullable(),
  platform: z.enum(["Android", "iOS", "Windows", "macOS", "Linux", "Other"]),
  viewport: z.enum(["small", "medium", "large"]),
  runtimeErrors: z.object({ errors: count, rejections: count, webglContextLosses: count }),
  seed: number.nullable(),
  settings: numericFields([
    "size", "coverage", "glades", "clearings", "darkForests", "relicDistance", "traffic",
    "walkSpeed", "characterFps", "stride", "paceVariation", "pathEase", "acceleration",
    "baseSize", "draftSize", "road", "roadOpacity", "roadShade", "roadEdgeLine", "roadEdgeWidth",
    "water", "rivers", "lakes", "ponds",
  ]).extend({
    walkSync: z.boolean(), characterModel: z.enum(["base", "callings"]),
    elevation: numericFields([
      "noiseSeed", "maxHeight", "scale", "detail", "power", "cliffLength", "cliffRoughness",
      "cliffDensity", "bridgeSag", "cliffHeight", "cliffThreshold", "slopeCost", "bankTaper",
      "bankSlope", "beachHeight", "beachSlope", "lakeTaper", "lakeCliffs", "lakeShelf",
      "erosionScale", "bankWidth", "riverCut", "cutFrequency", "riverDrop", "waterfallDrop",
      "waterfallSpacing", "waterDepth", "edgeWidth", "edgeStrength", "shimmerCoverage",
      "shimmerSize", "shimmerSpeed", "shimmerStrength", "waterfallTurbulence", "turbulenceReach",
      "turbulenceSpeed", "foam",
    ]),
  }),
  pixelation: z.object({ pixelated: z.boolean(), pixelsPerUnit: number, outputDpr: number }),
  camera: numericFields(["targetX", "targetZ", "viewIndex", "viewSize"]).extend({
    outlineMode: z.enum(["overlap", "silhouette", "off"]),
  }),
  simulation: z.object({ paused: z.boolean(), speed: number, time: number }),
  population: z.object({ travelers: count, monks: count, residents: count, relicTraffic: count }),
  settlement: numericFields(["gold", "wood", "visits", "shrineAdmission", "felledTrees", "woodPiles"]),
  buildings: z.array(numericFields(["x", "z", "w", "d", "rotation"]).extend({
    type: z.enum(["founding", "shelter", "monk-shelter", "workshop", "garden", "cross", "hall", "storehouse", "other"]),
    construction: numericFields(["work", "required"]).nullable(),
  })).max(100),
  omittedBuildings: count,
  cheats: z.object({ blasterPastor: z.boolean(), lastMarch: z.boolean() }),
})
export type BugReportDiagnostics = z.infer<typeof diagnosticsSchema>
export const bugReportSchema = z.object({
  message: z.string().trim().min(1).max(BUG_REPORT_MESSAGE_LIMIT),
  diagnostics: diagnosticsSchema,
})

/** Only the explicit message is free text. A longer fence keeps pasted Markdown
 * inside the message block; defang mentions to avoid notifying arbitrary users. */
export function formatBugReport(input: z.infer<typeof bugReportSchema>) {
  const report = bugReportSchema.parse(input)
  const message = report.message.replace(/@/g, "@\u200b")
  const fence = "`".repeat(Math.max(3, ...Array.from(message.matchAll(/`+/g), match => match[0].length + 1)))
  return {
    title: `Bug report — Pilgrimage ${report.diagnostics.version}`,
    body: `## Player message\n\n${fence}text\n${message}\n${fence}\n\n## Session diagnostics\n\n\`\`\`json\n${JSON.stringify(report.diagnostics, null, 2)}\n\`\`\`\n\nSubmitted through the in-game bug report form. No player identity is attached.`,
  }
}

/** Coarse compatibility information only. Never return the raw user-agent. */
export function browserDiagnostics(userAgent: string, width: number) {
  const match = /(?:Edg|EdgiOS|EdgA)\/(\d+)/.exec(userAgent)
    ?? /(?:Firefox|FxiOS)\/(\d+)/.exec(userAgent)
    ?? /(?:Chrome|CriOS)\/(\d+)/.exec(userAgent)
    ?? /Version\/(\d+).*Safari\//.exec(userAgent)
  const browser = !match ? "Other" : /Edg/.test(match[0]) ? "Edge"
    : /Firefox|FxiOS/.test(match[0]) ? "Firefox" : /Chrome|CriOS/.test(match[0]) ? "Chrome" : "Safari"
  const platform = /Android/.test(userAgent) ? "Android" : /iPhone|iPad|iPod/.test(userAgent) ? "iOS"
    : /Windows/.test(userAgent) ? "Windows" : /Macintosh|Mac OS X/.test(userAgent) ? "macOS"
      : /Linux/.test(userAgent) ? "Linux" : "Other"
  return { browser, browserMajor: match ? Math.min(999, Number(match[1])) : null, platform,
    viewport: width < 700 ? "small" : width < 1200 ? "medium" : "large" } as const
}
