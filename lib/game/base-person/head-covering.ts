import type { PersonDesign } from "./design"
import type { BaseClip } from "./pose"

/** Men uncover their heads for both kneeling and seated prayer. */
export function uncoverHead(bodyType: PersonDesign["bodyType"], clip: BaseClip) {
  return bodyType === "Male" && (clip === "praying" || clip === "seatedPrayer")
}
