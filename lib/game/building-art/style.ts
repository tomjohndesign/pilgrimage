import { EARLY_MATERIALS } from "./materials"
import { z } from "zod"
import { HOVEL_WALL_HEIGHT, HOVEL_ROOF_RISE, buildingDimensions, singlePlaneRoofRise } from "./dimensions"
import { PERSON_HEIGHT, PERSON_WIDTH, HOVEL_DOOR_HEIGHT, HOVEL_DOOR_WIDTH } from "../world-scale"
import { BUILDING_VIEWS, projectionLayout, footprintPolygon } from "./projection"

/** One palette and camera contract for procedural structures and generated art. */
export const BUILDING_STYLE = {
  id: "pilgrimage-buildings-v5",
  name: "Timber & earth",
  palette: { ink: "#352b24", plaster: EARLY_MATERIALS.earth, timber: EARLY_MATERIALS.wood, thatch: EARLY_MATERIALS.straw, thatchShade: EARLY_MATERIALS.strawDark, stone: EARLY_MATERIALS.stone, moss: "#7e8860" },
  principles: [
    "Slightly irregular ink contours; broad, quiet colour washes.",
    "Early medieval rural construction: earthfast roundwood posts, wattle, muted earthen daub and lapped thatch.",
    "Small single-storey structures; no decorative half-timber grids, glazed windows or dressed-stone trim; rough stone chimneys belong on domestic hearths.",
    "Plain wooden crosses mark religious buildings: gatepost crosses on the relic enclosure and roof crosses on the monks’ shelter. Keep utility huts unadorned.",
    "A clear entrance and a useful silhouette before surface detail.",
    "Long straw bundles follow the roof pitch, overlapping in thick courses with visible seams and ragged cut ends. Horizontal round logs and pale plastered masonry distinguish enclosed buildings.",
    "One orthographic camera, consistent scale, light from the upper left.",
  ],
} as const

export const VARIANTS = [
  { id: "gable", name: "Straw sanctuary", description: "A steep gable, quiet plaster and exposed oak.", image: "/assets/buildings/hovel-gable-views-v4.png", manifest: "/assets/buildings/hovel-gable-views-v4.json" },
  { id: "hipped", name: "Low shelter", description: "A broad hipped roof and a more earthen, weathered body.", image: "/assets/buildings/hovel-hipped-views-v4.png", manifest: "/assets/buildings/hovel-hipped-views-v4.json" },
  { id: "porch", name: "Pilgrim’s porch", description: "A sheltered entrance recessed beneath the gable.", image: "/assets/buildings/hovel-porch-views-v4.png", manifest: "/assets/buildings/hovel-porch-views-v4.json" },
] as const

export const recipeSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  variant: z.enum(["enclosure", "monk-shelter", "shepherd-hut", "storehouse", "wood-shelter", "tavern", "gable", "hipped", "porch"]),
  width: z.number().int().min(1).max(5),
  depth: z.number().int().min(1).max(5),
  wallHeight: z.number().min(0.25).max(1.4),
  roofRise: z.number().min(0).max(1.5),
  seed: z.number().int().min(0).max(99999),
  view: z.number().int().min(0).max(3),
  output: z.enum(["concept", "sprite"]),
  notes: z.string().max(2000),
})
export type BuildingRecipe = z.infer<typeof recipeSchema>
export const LEGACY_RECIPE: BuildingRecipe = {
  subject: "Hovel of the Relic", variant: "gable", width: 5, depth: 5,
  wallHeight: HOVEL_WALL_HEIGHT, roofRise: HOVEL_ROOF_RISE, seed: 17, view: 0, output: "concept", notes: "A humble monks’ refuge. A tiny wooden cross over the entrance; a subdued golden glint within.",
}

/** Authored starting dimensions; choosing a type restores its intended proportions. */
export const EARLY_BUILDINGS = [
  { id: "enclosure", name: "Relic enclosure", description: "Four open timber gates with plain crosses, low paling walls and a glowing relic on a rough stone table under the sky.", width: 3, depth: 3, wallHeight: 0.42, roofRise: 0 },
  { id: "monk-shelter", name: "Monks’ shelter", description: "An open-front thatched sleeping shelter with a rear-sloping awning, plain crosses, a stone chimney and fireplace, horizontal log windbreaks and straw bedrolls.", width: 3, depth: 2, wallHeight: 0.62, roofRise: singlePlaneRoofRise(2) },
  { id: "shepherd-hut", name: "Shepherd’s hut", description: "A compact log-built hut with a low single-plane thatched roof, a deep arched brow over the low-eave doorway, and a stone chimney and fireplace.", width: 2, depth: 2, wallHeight: 0.70, roofRise: singlePlaneRoofRise(2) },
  { id: "tavern", name: "Tavern", description: "A broad timber-and-rubble alehouse with a back-to-back thatched roof, an arched entrance, stone hearth and chimney, wooden drinking tables, benches and an ale-cup sign.", width: 3, depth: 4, wallHeight: 0.78, roofRise: singlePlaneRoofRise(4) },
  { id: "storehouse", name: "Raised store", description: "An open-sided store on timber legs, with a plank entry ramp and sacks beneath a thatched roof held by two plain timber battens.", width: 1, depth: 1, wallHeight: 0.55, roofRise: singlePlaneRoofRise(1) },
  { id: "wood-shelter", name: "Wood shelter", description: "An open lean-to with a low thatched roof over split wood and spare poles.", width: 2, depth: 1, wallHeight: 0.62, roofRise: singlePlaneRoofRise(1) },
] as const
export type EarlyBuildingType = typeof EARLY_BUILDINGS[number]["id"]
export function earlyBuildingRecipe(variant: EarlyBuildingType): BuildingRecipe {
  const preset = EARLY_BUILDINGS.find(p => p.id === variant)!
  return { ...LEGACY_RECIPE, width: preset.width, depth: preset.depth, wallHeight: preset.wallHeight, roofRise: preset.roofRise, subject: preset.name, variant, notes: preset.description }
}
export const DEFAULT_RECIPE = earlyBuildingRecipe("enclosure")
export const isEarlyBuilding = (variant: BuildingRecipe["variant"]): variant is EarlyBuildingType => EARLY_BUILDINGS.some(p => p.id === variant)

export function buildingPrompt(recipe: BuildingRecipe): string {
  const layout = projectionLayout(recipe)
  const dimensions = buildingDimensions(recipe)
  const silhouettes: Record<BuildingRecipe["variant"], string> = {
    ...Object.fromEntries(EARLY_BUILDINGS.map(p => [p.id, p.description])) as Record<EarlyBuildingType, string>,
    gable: "A steep continuous gabled thatch roof with a thick softly fringed edge. Entrance in the south gable.",
    hipped: "A broad hipped thatch roof with four sloping faces and rounded weathered eaves. Earthen plaster with restrained exposed timber. Entrance in the south wall.",
    porch: "A continuous gabled thatch roof sheltering a recessed south entrance with two wooden porch posts. The porch stays inside the footprint.",
  }
  return [
    "Use case: stylized-concept",
    `Asset type: one 2048×2048 four-view ${recipe.output === "sprite" ? "sprite atlas" : "concept atlas"} for Pilgrimage. Four equal 1024×1024 cells in a 2×2 layout. This is ONE building rotated, not four variants.`,
    `Style contract: ${BUILDING_STYLE.id} — ${BUILDING_STYLE.name}.`,
    `Subject: ${recipe.subject}. Building footprint exactly ${dimensions.width} × ${dimensions.depth} ground tiles. The building fills its tile footprint, with only a small eave overhang above the walls. No reserved lawn, forecourt or surrounding border is included in its dimensions. One tile is one world unit. Walls ${recipe.wallHeight} units high; roof rises ${recipe.roofRise} units above the eaves.`,
    isEarlyBuilding(recipe.variant) ? "Human scale: match the current game character and the opening sizes in the supplied procedural guide. The roofless enclosure has low open gates without overhead lintels; preserve that open sky." : `Human scale: an adult game character is ${PERSON_HEIGHT} units tall and ${PERSON_WIDTH} units wide. The door opening is ${HOVEL_DOOR_HEIGHT} high × ${HOVEL_DOOR_WIDTH} wide, with only modest headroom. These dimensions are authoritative: no oversized doorway, no enlarged walls, no exaggerated roof. Match the reference person in the guide, then omit the person from the finished sprite.`,
    `Construction: ${silhouettes[recipe.variant]} Rough roundwood, woven willow and earthen daub; no decorative late-medieval timber framing. Follow the supplied model for openings and contents.`,
    `Art direction: ${BUILDING_STYLE.principles.join(" ")} Original medieval history-book illustration; flat restrained watercolour with confident dark brown pen lines.`,
    `Palette: ${Object.entries(BUILDING_STYLE.palette).map(([key, value]) => `${key} ${value}`).join(", ")}. Muted blue-grey shade.`,
    "Required view order: top-left 0 southeast; top-right 1 northeast; bottom-left 2 northwest; bottom-right 3 southwest.",
    (recipe.variant === "enclosure" ? "Four views of one roofless square enclosure: a centred open timber gate on EVERY side. Preserve the stone table, paving and scattered objects as the camera rotates." : "Required view order: top-left 0 southeast (south entrance + east wall); top-right 1 northeast (north rear + east wall); bottom-left 2 northwest (north rear + west wall); bottom-right 3 southwest (south entrance + west wall). The entrance always remains on the south side. Rear views must show a solid rear wall, not another door. Rotate the whole building in 90° steps; never mirror or invent new windows."),
    "Camera: match the supplied isometric registration guide exactly. Orthographic, elevation 35.26438968°, yaw 45° + view index × 90°. Ground axes rise at 30° to horizontal; verticals stay vertical. No perspective convergence. Footprint corners, ridge direction, width, depth and height must register across all four views.",
    `Registration in EVERY cell: ground-centre anchor at (50%,72%); scale ${layout.pixelsPerUnit.toFixed(6)} of cell width per world unit (${(layout.pixelsPerUnit*1024).toFixed(2)} px/unit at 1024). Use the supplied guide as the geometry and placement authority. The map guide shows the actual procedural building on game terrain; keep its camera, scale and ground position. Walls and roof stay inside the ${recipe.width}×${recipe.depth} tile reservation. Do not independently centre or scale individual views.`,
    "Composition: exactly four complete buildings, one per quadrant, with the same anchor, scale and geometry. No borders or gaps between cells. Erase guide grid, red registration dots and labels from the finished art. Terrain, roads, grid lines and scenery in the map guide are context only. Return the building alone, with no terrain islands or external shadows; the workshop will place it back on those tiles. Preserve large shapes at 128px per view.",
    recipe.output === "sprite" ? "Backdrop: genuine transparent alpha, no painted checkerboard, no background or ground plane. Keep clean antialiased ink edges." : "Backdrop: uniform warm ivory #f3eddf. This is a concept, not an alpha-ready sprite.",
    `Details: ${recipe.notes || "Keep ornament minimal."}`,
    "Avoid: text, labels, people, landscape, glossy 3D, photorealism, pixel art, excessive fine hatching, ornate fantasy architecture. Roof intact unless explicitly requested otherwise.",
    (isEarlyBuilding(recipe.variant) ? "Architecture consistency: preserve the exact openings, posts, roof and interior objects of the supplied procedural guide in all four views." : "Architecture consistency: the north rear wall has no door, cross or windows. Each east and west wall has one centred shuttered window. View0: doorway LEFT/window RIGHT; view1: window LEFT/plain rear RIGHT; view2: plain rear LEFT/window RIGHT; view3: window LEFT/doorway RIGHT. Preserve these details as the camera rotates."),
    "Input roles: image 1 is the mandatory four-view geometric registration guide; any further image is a material and line-style reference. Preserve guide geometry even if the style reference has looser perspective. All four views must describe the same building.",
  ].join("\n\n")
}

export function recipeManifest(recipe: BuildingRecipe) {
  const layout = projectionLayout(recipe)
  return {
    style: BUILDING_STYLE.id, recipe, prompt: buildingPrompt(recipe),
    generation: { model: "gpt-image-2", size: "2048x2048", quality: "medium", output_format: "png", background: recipe.output === "sprite" ? "transparent" : "opaque" },
    atlas: { columns: 2, rows: 2, targetCellSize: [1024,1024], order: BUILDING_VIEWS.map((view) => view.name) },
    placement: { plot: [recipe.width, recipe.depth], footprint: [buildingDimensions(recipe).width, buildingDimensions(recipe).depth], humanScale: { personHeight: PERSON_HEIGHT, doorHeight: HOVEL_DOOR_HEIGHT, doorWidth: HOVEL_DOOR_WIDTH }, origin: "centre of ground footprint", cameraPitch: layout.pitchDegrees,
      normalizedPixelsPerUnit: layout.pixelsPerUnit, normalizedAnchor: layout.anchor,
      views: BUILDING_VIEWS.map((view) => ({ ...view, normalizedCell: [view.column/2,view.row/2,0.5,0.5], footprintPolygon: footprintPolygon(recipe,view.id) })),
      status: "Four views required. Registration values are targets; compare generated pixels against the grid before game integration.",
    },
  }
}
