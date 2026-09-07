import type { WildlifeWorld } from "./simulation"
/** Live state for the shared map inspector; owned by the mounted wildlife scene. */
export const wildlifeRegistry: { current: WildlifeWorld | null } = { current: null }
