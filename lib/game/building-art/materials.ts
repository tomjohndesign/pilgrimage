/** Muted rural materials shared by the early-building models and style guide. */
export const EARLY_MATERIALS = {
  wood: "#756044", darkWood: "#544630", paleWood: "#98805b", earth: "#928064",
  wattle: "#9a8862", straw: "#aa9567", strawLight: "#b7a276", strawDark: "#918057", stone: "#969486",
} as const

/** Natural roof coverings for the northern European village kit. These are
 * split timber and dried stalks, not slate, ceramic tile, or sheet metal.
 * See assets/BUILDING_READABILITY.md for evidence and reconstruction limits. */
export const EARLY_ROOF_MATERIALS = {
  straw: "#af925e", weatheredStraw: "#9a805d", paleStraw: "#b6a078",
  reed: "#aa966f", dryReed: "#b5a079", weatheredReed: "#958364",
  goldenThatch: "#a08a59", splitOak: "#ac895a", weatheredOak: "#91816b",
  workyardOak: "#88765b", darkOak: "#716553",
} as const
