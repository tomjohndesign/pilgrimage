import { validatePoseEdits, type PoseEdits } from "./pose-edits"
import recipe from "../../../assets/recipes/base-person.json"

export const DESIGN_CONTROLS = {
  head: { label: "Head size", min: 0.85, max: 1.2, step: 0.05 },
  build: { label: "Body width", min: 0.8, max: 1.25, step: 0.05 },
  torsoHeight: { label: "Torso height", min: 0.8, max: 1.25, step: 0.05 },
  shoulderHeight: { label: "Shoulder height", min: 0.8, max: 1.15, step: 0.05 },
  neckHeight: { label: "Neck height", min: 0.5, max: 1.5, step: 0.05 },
  legs: { label: "Leg length", min: 0.85, max: 1.15, step: 0.05 },
  feet: { label: "Foot length", min: 0.75, max: 1.5, step: 0.05 },
  footWidth: { label: "Foot width", min: 0.7, max: 1.5, step: 0.05 },
  footHeight: { label: "Foot height", min: 0.7, max: 1.5, step: 0.05 },
  tunicLength: { label: "Tunic length", min: 0.75, max: 1.4, step: 0.05 },
  hem: { label: "Tunic flare", min: 0.85, max: 1.25, step: 0.05 },
  armSpacing: { label: "Arm spacing", min: 0.85, max: 1.2, step: 0.05 },
  upperArm: { label: "Upper arm length", min: 0.8, max: 1.25, step: 0.05 },
  forearm: { label: "Forearm length", min: 0.8, max: 1.25, step: 0.05 },
  armAngle: { label: "Arm angle", min: 0, max: 20, step: 1 },
  elbowBend: { label: "Elbow bend", min: 0, max: 40, step: 1 },
  armSwing: { label: "Arm swing", min: 0, max: 1.5, step: 0.05 },
  hands: { label: "Hand size", min: 0.75, max: 1.4, step: 0.05 },
  sleeves: { label: "Sleeve fullness", min: 0.8, max: 1.5, step: 0.05 },
  stride: { label: "Step reach", min: 0.75, max: 1.1, step: 0.05 },
  shadow: { label: "Cast shadow", min: 0, max: 0.3, step: 0.02 },
  ink: { label: "Edge ink", min: 0, max: 1, step: 0.1 },
} as const
export type DesignKey = keyof typeof DESIGN_CONTROLS
export const HAIR_STYLES = ["Bald", "Cropped", "Bob", "Long", "Tonsure", "Wavy", "Ponytail", "Braids", "Bun"] as const
export const HAT_STYLES = ["None", "Coif", "Wool cap", "Cloth cap"] as const
export const HAND_TOOLS = ["None", "Shepherd crook", "Carried axe"] as const
export const TUNIC_STYLES = ["Plain", "Particolour", "Ragged"] as const
export type PersonDesign = Record<DesignKey, number> & {
  poseEdits?: PoseEdits
  handTool: typeof HAND_TOOLS[number]
  hat: typeof HAT_STYLES[number]
  tunicStyle: typeof TUNIC_STYLES[number]
  satchel: boolean; walkingStick: boolean; lute: boolean
  accentColor: string
  bodyType: "Male" | "Female"
  garment: "Everyday" | "Robe"
  footwear: "Sandals" | "Boots"
  beltStyle: "Leather" | "Rope"
  walkStyle: "Natural" | "Devotional"
  tunicColor: string; skinColor: string; hairColor: string
  shirtColor: string; trouserColor: string; coveringColor: string
  hairStyle: typeof HAIR_STYLES[number]; beard: boolean
}
export const DEFAULT_DESIGN: PersonDesign = {
  handTool: "None", hat: "None", tunicStyle: "Plain", satchel: false, walkingStick: false, lute: false, accentColor: "#d6b57b",
  bodyType: "Male", garment: "Everyday", footwear: "Boots", beltStyle: "Leather", walkStyle: "Natural", head: 1.2, build: 1, torsoHeight: 1, shoulderHeight: 1, neckHeight: 0.65, tunicLength: 1,
  legs: 0.9, feet: 1, footWidth: 0.95, footHeight: 0.7, hem: 1, sleeves: 1, stride: 0.8, ink: 0.6,
  armSpacing: 1, upperArm: 1, forearm: 1, armAngle: 3, elbowBend: 10, armSwing: 0.75, hands: 1,
  shirtColor: "#c7b59b", trouserColor: "#514638", coveringColor: "#d6cab1",
  shadow: 0.16, tunicColor: "#507186", skinColor: "#c99a72", hairColor: "#4a3221", hairStyle: "Bald", beard: false,
}
export const PERSON_PRESETS: Record<string, PersonDesign> = {
  Storybook: DEFAULT_DESIGN,
  Female: { ...DEFAULT_DESIGN, bodyType: "Female", hat: "Coif", hem: 1.15, hairStyle: "Long", beard: false },
  Monk: { ...DEFAULT_DESIGN, garment: "Robe", beltStyle: "Rope", tunicLength: 1.4, tunicColor: "#6b4932",
    trouserColor: "#6b4932", hairStyle: "Tonsure", sleeves: 1.15, hem: 1.1,
    feet: 0.75, footWidth: 0.7, stride: 0.75, armSwing: 0, walkStyle: "Devotional" },
  Minstrel: { ...DEFAULT_DESIGN, tunicColor: "#7b4969", accentColor: "#d6b57b", tunicStyle: "Plain", hat: "Cloth cap", lute: true, hairStyle: "Wavy", hem: 1.15, tunicLength: 1.15 },
  Beggar: { ...DEFAULT_DESIGN, tunicStyle: "Ragged", tunicColor: "#786c58", accentColor: "#a49476", shirtColor: "#958a74", trouserColor: "#635a4b", beltStyle: "Rope", footwear: "Sandals", hairStyle: "Wavy", beard: true },
  Traveler: { ...DEFAULT_DESIGN, hat: "Wool cap", satchel: true, walkingStick: true, hairStyle: "Ponytail" },
  Stout: { ...DEFAULT_DESIGN, build: 1.2, tunicColor: "#866044", hairStyle: "Cropped", beard: true },
  Lanky: { ...DEFAULT_DESIGN, build: 0.85, legs: 1.15, head: 1, feet: 1.1, tunicColor: "#657b50", hairStyle: "Bob" },
}
const legacyDefaults: Partial<Record<DesignKey, number>> = { armSpacing: 1, upperArm: 1, forearm: 1, armAngle: 3, elbowBend: 10, armSwing: 0.75, hands: 1, sleeves: 1, torsoHeight: 1, footWidth: 1, footHeight: 1, tunicLength: 1, shoulderHeight: 1, neckHeight: 1, shadow: 0.16 }
export function validatePersonDesign(input: unknown): PersonDesign {
  if (!input || typeof input !== "object") throw new Error("Expected person parameters.")
  // Old editor downloads and saved road designs keep their equipment selections.
  const saved = input as Record<string, unknown>
  const normalized = { ...saved,
    ...(saved.hat === "Travel hat" ? { hat: "Wool cap" } : saved.hat === "Minstrel hat" ? { hat: "Cloth cap" } : {}),
    ...(!("lute" in saved) && "guitar" in saved ? { lute: saved.guitar } : {}),
  }
  return validateCurrentPersonDesign(normalized)
}
function validateCurrentPersonDesign(input: Record<string, unknown>): PersonDesign {
  const result = { ...DEFAULT_DESIGN }
  if ("bodyType" in input) {
    if (input.bodyType !== "Male" && input.bodyType !== "Female") throw new Error("Invalid body type.")
    result.bodyType = input.bodyType
  }
  for (const [key, choices] of [["handTool", HAND_TOOLS], ["hat", HAT_STYLES], ["tunicStyle", TUNIC_STYLES], ["footwear", ["Sandals", "Boots"]], ["garment", ["Everyday", "Robe"]], ["beltStyle", ["Leather", "Rope"]], ["walkStyle", ["Natural", "Devotional"]]] as const) {
    if (key in input) {
      const value = (input as PersonDesign)[key]
      if (!(choices as readonly string[]).includes(value)) throw new Error(`Invalid ${key}.`)
      Object.assign(result, { [key]: value })
    }
  }
  for (const key of Object.keys(DESIGN_CONTROLS) as DesignKey[]) {
    const value = !(key in input) ? legacyDefaults[key] : (input as PersonDesign)[key]
    const range = DESIGN_CONTROLS[key]
    if (typeof value !== "number" || !Number.isFinite(value) || value < range.min || value > range.max) throw new Error(`Invalid ${range.label.toLowerCase()}.`)
    result[key] = value
  }
  for (const key of ["accentColor", "tunicColor", "skinColor", "hairColor", "shirtColor", "trouserColor", "coveringColor"] as const) {
    const value = key in input ? (input as PersonDesign)[key] : DEFAULT_DESIGN[key]
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Invalid ${key}.`)
    result[key] = value.toLowerCase()
  }
  if ("hairStyle" in input) {
    if (!HAIR_STYLES.includes((input as PersonDesign).hairStyle)) throw new Error("Invalid hair style.")
    result.hairStyle = (input as PersonDesign).hairStyle
  }
  for (const key of ["satchel", "walkingStick", "lute"] as const) {
    if (key in input) {
      if (typeof (input as PersonDesign)[key] !== "boolean") throw new Error(`Invalid ${key} option.`)
      result[key] = (input as PersonDesign)[key]
    }
  }
  if (!("hat" in input) && result.bodyType === "Female" && result.garment !== "Robe") result.hat = "Coif"
  if ("beard" in input) {
    if (typeof (input as PersonDesign).beard !== "boolean") throw new Error("Invalid beard option.")
    result.beard = (input as PersonDesign).beard
  }
  if (result.bodyType === "Female") {
    result.beard = false
    if (!("hairStyle" in input)) result.hairStyle = "Long"
  }
  if (result.handTool === "Shepherd crook") result.walkingStick = true
  if (result.handTool === "Carried axe") result.walkingStick = false
  if ("poseEdits" in input) result.poseEdits = validatePoseEdits((input as PersonDesign).poseEdits)
  return result
}
export function withBodyType(design: PersonDesign, bodyType: PersonDesign["bodyType"]): PersonDesign {
  return validatePersonDesign({ ...design, bodyType,
    ...(bodyType === "Female" ? { hairStyle: "Long", beard: false, hat: design.hat === "None" ? "Coif" : design.hat } : {}),
  })
}
export function shade(hex: string, factor: number) {
  return "#" + [1, 3, 5].map(i => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * factor)).toString(16).padStart(2, "0")).join("")
}
/** The lit steps every baked skin and hair pixel snaps to; a recolour must use the same ones. */
export const SKIN_SHADES = [0.5, 0.7, 0.9, 1.1, 1.3] as const
export const HAIR_SHADES = [0.65, 1, 1.4] as const
/** Wood and leather carry their own ramp so props never borrow a body colour. */
export const TIMBER_SHADES = [0.55, 0.8, 1, 1.25] as const
/**
 * Which body colour owns a palette entry. Skin and hair steps are reserved: the
 * bake only lets skin pixels reach skin steps and hair pixels reach hair steps,
 * so a staff, a robe or a boot can never be repainted along with a complexion.
 * Shared entries — ink, timber, cloth, metal — stay open to every part.
 */
export const PALETTE_TONES = { shared: 0, skin: 1, hair: 2 } as const
export type PaletteTone = typeof PALETTE_TONES[keyof typeof PALETTE_TONES]
export function personRecipe(input: PersonDesign = DEFAULT_DESIGN) {
  const design = validatePersonDesign(input)
  const result = structuredClone(recipe), b = result.body, original = recipe.body
  result.palette.tunic = design.tunicColor; result.palette.skin = design.skinColor
  if (design.beltStyle === "Rope") result.palette.belt = "#c9ac78"
  const clothColors = design.bodyType === "Female" ? [design.shirtColor, design.coveringColor] : [design.trouserColor]
  const entries: Array<[string, PaletteTone]> = []
  const add = (tone: PaletteTone, colors: readonly string[]) => {
    for (const color of colors) if (!entries.some(entry => entry[0] === color && entry[1] === tone)) entries.push([color, tone])
  }
  add(PALETTE_TONES.shared, ["#30251e", "#503b2b", ...TIMBER_SHADES.map(f => shade("#785637", f)), "#d6b57b", "#657b50", "#bac8cf", "#ecf4f4"])
  add(PALETTE_TONES.skin, SKIN_SHADES.map(f => shade(design.skinColor, f)))
  add(PALETTE_TONES.shared, [0.55, 0.8, 1, 1.3].map(f => shade(design.tunicColor, f)))
  add(PALETTE_TONES.hair, HAIR_SHADES.map(f => shade(design.hairColor, f)))
  add(PALETTE_TONES.shared, clothColors.flatMap(color => [0.55, 0.8, 1, 1.25].map(f => shade(color, f))))
  for (const color of [design.accentColor, design.coveringColor]) add(PALETTE_TONES.shared, [0.55, 0.8, 1, 1.3].map(f => shade(color, f)))
  if (design.beltStyle === "Rope") add(PALETTE_TONES.shared, [0.65, 1, 1.25].map(f => shade(result.palette.belt, f)))
  result.renderPalette = entries.map(entry => entry[0])
  const paletteTones = entries.map(entry => entry[1])
  b.headWidth *= design.head; b.headHeight *= design.head; b.headDepth *= design.head
  for (const key of ["torsoTop", "torsoBottom", "shoulderOffset", "legOffset", "thighWidth", "shinWidth"] as const) b[key] *= design.build
  const female = design.bodyType === "Female"
  b.torsoTop *= female ? 0.96 : 1.1
  b.shoulderOffset *= female ? 0.94 : 1.1
  b.torsoBottom *= female ? 1.18 : 0.96
  b.legOffset *= female ? 1.08 : 1
  b.shoulderOffset *= design.armSpacing * 0.92
  b.upperArmLength *= design.upperArm
  b.forearmLength *= design.forearm
  const waistRadius = original.torsoBottom * design.build * (female ? 0.94 : 0.82)
  const bustDepth = female ? 0.065 * design.build : 0
  b.thighLength *= design.legs; b.shinLength *= design.legs
  b.hipHeight = b.ankleHeight + (original.hipHeight - original.ankleHeight) * design.legs
  const rise = b.hipHeight - original.hipHeight
  b.shoulderHeight += rise; b.torsoCenter += rise; b.headCenter += rise
  // The torso's shoulder line is an authored landmark. The shoulder control
  // moves only the arm roots relative to it; head/neck/chest stay independent.
  const torsoRise = (original.shoulderHeight - original.hipHeight) * (design.torsoHeight - 1)
  b.shoulderHeight += torsoRise
  const torsoShoulderHeight = b.shoulderHeight
  const shoulderRise = (original.shoulderHeight - original.hipHeight) * (design.shoulderHeight - 1)
  b.shoulderHeight += shoulderRise
  const neckSpan = original.headCenter - original.headHeight - (original.shoulderHeight + 0.01)
  b.headCenter += torsoRise + neckSpan * (design.neckHeight - 1)
  const waist = original.torsoCenter - 0.16
  const chestFraction = (original.torsoCenter + 0.05 - waist) / (original.shoulderHeight - 0.06 - waist)
  const chestHeight = b.torsoCenter + 0.05 + torsoRise * chestFraction
  // Shirts stay at the hips; dresses and robes reach the ankles. The length dial
  // adjusts each garment within its own range without moving the waist.
  const tunicHem = female || design.garment === "Robe" ? 0.13 + (1.4 - design.tunicLength) * 0.09
    : b.hipHeight - 0.03 - (design.tunicLength - 0.75) * 0.22
  const tunicHemUpper = tunicHem + 0.04
  b.footLength *= design.feet; b.footWidth *= design.footWidth; b.footHeight *= design.footHeight
  // Leave a little knee bend at the longest planted reach; never stretch bones.
  const reach = Math.sqrt(Math.max(0, (b.thighLength + b.shinLength) ** 2 - (b.hipHeight - b.ankleHeight) ** 2)) * 0.95
  b.stride = Math.min(original.stride * design.stride, reach)
  return { ...result, paletteTones, body: { ...b, waistRadius, bustDepth, torsoShoulderHeight, chestHeight, tunicHem, tunicHemUpper }, design }
}
export type PersonRecipe = ReturnType<typeof personRecipe>
