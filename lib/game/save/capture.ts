import { useCameraStore } from "../camera-store"
import type { Settlement } from "../settlement"
import type { SimState } from "../sim"
import { useSimulationStore } from "../simulation-store"
import { SAVE_VERSION, worldIdentity, type GameSave } from "./schema"
import { captureSettlement } from "./settlement"
import { captureSimulation } from "./simulation"
import type { DisplaySettings, WorldSettings } from "./settings"

/** Assemble the save document from the pieces of the running game. */
export function captureGame({ seed, settings, settlement, sim }: {
  seed: number
  settings: WorldSettings & Pick<DisplaySettings, "treeModel">
  settlement: Settlement
  sim: SimState
}): GameSave {
  const camera = useCameraStore.getState()
  const playback = useSimulationStore.getState()
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    world: worldIdentity(seed, settings),
    settlement: captureSettlement(settlement),
    simulation: captureSimulation(sim, settings.treeModel),
    camera: { targetX: camera.targetX, targetZ: camera.targetZ, viewIndex: camera.viewIndex, viewSize: camera.viewSize },
    playback: { paused: playback.paused, speed: playback.speed },
  }
}
