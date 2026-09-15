import { Vector3, type Camera, type Object3D } from "three"
import { SOUND_AUDITIONS } from "./sound-catalog"
import type { BodyType } from "./voice-lines"
import { useCameraStore } from "./camera-store"
import { useCharacterSoundStore } from "./character-sound-store"
import { emitCharacterAudio, moveActorAudio, stopActorAudio } from "./scene-audio"

interface Source {
  profile: string
  bodyType?: BodyType
  moving: boolean
  distance: number
  pan: number
  x: number
  z: number
}
type TrackedSource = Source & { seen: number; next: number; laughAt: number }
type Emit = (profile: string, event: "idle" | "walking", options: { actor: string; distance: number; pan: number; intensity?: number; bodyType?: BodyType }) => void

/** Wall-clock spacing avoids bursts at high simulation speeds and after pauses. */
export function irregularSoundDelay(seconds: number, random = Math.random): number {
  return Math.max(1, seconds) * (1 + random() * 1.5) * 1000
}

export class SceneSoundScheduler {
  sources = new Map<string, TrackedSource>()
  private accentAt = 0
  constructor(private random = Math.random, private stop = stopActorAudio, private move = moveActorAudio) {}

  update(actor: string, source: Source, now: number) {
    const previous = this.sources.get(actor)
    const cart = source.profile === "vehicle/cart", bird = source.profile === "animal/hawk" || source.profile === "animal/sparrow"
    this.sources.set(actor, { ...source, seen: now, next: previous?.next ?? now + (cart ? 0 : irregularSoundDelay(source.profile==="person"?1:bird?2:8, this.random)), laughAt: previous?.laughAt ?? now + irregularSoundDelay(15,this.random) })
    if (source.profile === "person") {
      this.move(`${actor}/conversation`,source.distance,source.pan)
      this.move(`${actor}/reaction`,source.distance,source.pan)
    }
    if (cart && !source.moving) {
      this.stop(actor)
      this.sources.get(actor)!.next = now
    }
    if (this.sources.size > 512) this.remove(this.sources.keys().next().value!)
  }

  remove(actor: string) { this.sources.delete(actor); this.stop(actor); this.stop(`${actor}/conversation`); this.stop(`${actor}/reaction`) }
  clear() { for (const actor of this.sources.keys()) this.remove(actor); this.accentAt = 0 }

  tick(now: number, emit: Emit, cooldown: (profile: string, event: "idle" | "walking") => number) {
    for (const [actor, source] of this.sources) {
      if (now - source.seen > 600) { this.remove(actor); continue }
      const animal = source.profile.startsWith("animal/"), cart = source.profile === "vehicle/cart"
      const bird=source.profile==="animal/hawk"||source.profile==="animal/sparrow"
      if ((!animal && !cart) || (!source.moving&&!bird) || now < source.next) continue
      const event = cart ? "walking" : "idle"
      source.next = now + irregularSoundDelay(cooldown(source.profile, event), this.random)
      emit(source.profile, event, { actor, distance: source.distance, pan: source.pan })
    }
    const people = [...this.sources.entries()].filter(([,s]) => s.profile === "person" && s.distance < 24).sort((a,b)=>a[1].distance-b[1].distance).slice(0,64)
    // Each speaker needs a nearby companion. There is no global conversation bed.
    const groups = people.filter(([,a]) => people.some(([,b]) => a !== b && Math.hypot(a.x-b.x, a.z-b.z) < 6))
    const speakers = groups.filter(([,source])=>now>=source.next)
    // Soft voices overlap naturally as more people enter view; each retains its own clock.
    for (const [actor,source] of speakers) {
      source.next = now + irregularSoundDelay(cooldown("scene/crowd","idle"),this.random)
      emit("scene/crowd","idle",{actor:`${actor}/conversation`,distance:source.distance,pan:source.pan,bodyType:source.bodyType})
    }
    const reactions = groups.filter(([,source])=>now>=source.laughAt)
    if (now>=this.accentAt && reactions.length) {
      const [actor,source] = reactions[Math.floor(this.random()*reactions.length)]
      source.laughAt = now + irregularSoundDelay(cooldown("scene/crowd-accents","idle"),this.random)
      this.accentAt = now + irregularSoundDelay(12,this.random)
      emit("scene/crowd-accents","idle",{actor:`${actor}/reaction`,distance:source.distance,pan:source.pan,bodyType:source.bodyType})
    }
  }
}

export const sceneSoundSources = new SceneSoundScheduler()
const point = new Vector3()

/** Called by existing renderers only for their visible, living figures. */
export function touchSceneSoundSource(actor: string, profile: string, position: { x: number; y: number; z: number }, camera: Camera, moving: boolean, bodyType?: BodyType) {
  const now = performance.now()
  if (now - (sceneSoundSources.sources.get(actor)?.seen ?? -Infinity) < 150) return
  point.copy(position).project(camera)
  if (Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || Math.abs(point.z) > 1) { sceneSoundSources.remove(actor); return }
  const focus = useCameraStore.getState(), distance = Math.hypot(position.x-focus.targetX, position.z-focus.targetZ)
  sceneSoundSources.update(actor, {profile, bodyType, moving, distance, pan: point.x, x: position.x, z: position.z}, now)
  moveActorAudio(actor, distance, point.x)
}

const world = new Vector3()
export function touchObjectSoundSource(object: Object3D, camera: Camera, profile: string, moving: boolean, actor = object.uuid) {
  if (performance.now() - (sceneSoundSources.sources.get(actor)?.seen ?? -Infinity) < 150) return
  object.getWorldPosition(world)
  touchSceneSoundSource(actor, profile, world, camera, moving, object.userData.audioBodyType)
}

export function tickSceneSoundSources() {
  sceneSoundSources.tick(performance.now(), (profile, event, {bodyType,...options}) => {
    const assigned=useCharacterSoundStore.getState().document.profiles[profile]?.[event].clips
    const bank=bodyType?assigned?.filter(id=>{const clip=SOUND_AUDITIONS.find(s=>s.id===id);return !clip?.bodyType||clip.bodyType===bodyType}):undefined
    void emitCharacterAudio(profile, event, {...options,bank:bank?.length?bank:undefined})
  },
    (profile, event) => useCharacterSoundStore.getState().document.profiles[profile]?.[event].cooldown ?? 18)
}
