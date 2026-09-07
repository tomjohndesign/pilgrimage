import manifest from "../../../../public/textures/trees/foliage/v5/manifest.json"
import { FOLIAGE_FRAME, type FoliageAtlas } from "./design"

/** Published defaults load directly; only authoring edits need the browser baker. */
export const DEFAULT_FOLIAGE_ATLAS: FoliageAtlas = { ...manifest, frame: FOLIAGE_FRAME }
