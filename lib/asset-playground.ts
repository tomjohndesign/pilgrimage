/** One navigation registry for asset editing and visual simulation checks. */
export const PLAYGROUND_TOOLS = [
  { id: "characters", label: "Characters", help: "Drag to turn, Shift-drag to pan, and scroll to zoom. Show rig exposes pose keys and timing. Apply to road saves appearance changes for the game." },
  { id: "animals", label: "Animals", help: "Choose a species, then use Show rig to edit its pose and timing. Drag to turn and scroll to zoom." },
  { id: "buildings", label: "Buildings", help: "Choose a building form and edit its shape or layout. Click a building to inspect its interior. Scene contains placement examples." },
  { id: "ents", label: "Ents", help: "Choose a tree species and inspect its shared walking rig. Drag to turn and scroll to zoom." },
  { id: "maps", label: "Maps", help: "Apply a seed to regenerate the map. Show connections reveals clearing access. The same seed restores the same terrain." },
  { id: "paths", label: "Paths", help: "Choose a scenario and layout. Play advances journeys; stepping pauses the simulation. Use the map to inspect wear or place a building." },
  { id: "town", label: "Village journeys", help: "Follow a resident or close a workplace to see how journeys affect paths. Drag to pan and scroll to zoom." },
  { id: "placement", label: "Building placement", help: "Choose terrain and a structure, then click the map to place it. Green pads are valid; red pads show why placement is refused." },
  { id: "rendering", label: "Rendering", help: "Compare rendering methods with synchronized settings. Pause or scrub the walk to inspect a frame. Focus enlarges one comparison." },
] as const

export type PlaygroundTool = typeof PLAYGROUND_TOOLS[number]["id"]

export function playgroundTool(asset: string | null): PlaygroundTool {
  if (asset === "donkey" || asset === "horse") return "animals"
  return PLAYGROUND_TOOLS.find(tool => tool.id === asset)?.id ?? "characters"
}

export function playgroundHref(tool: PlaygroundTool, params = new URLSearchParams()): string {
  const query = new URLSearchParams(params)
  query.set("asset", tool)
  return `/assets?${query}`
}

/** Preserve shared settings when opening an old tool bookmark. */
export function legacyPlaygroundHref(query: Record<string, string | string[] | undefined>, tool?: PlaygroundTool): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item)
  }
  return tool ? playgroundHref(tool, params) : `/assets${params.size ? `?${params}` : ""}`
}
