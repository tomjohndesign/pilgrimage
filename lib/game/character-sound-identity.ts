import type { TravelerTypeId } from "./travelers"

/** Presets describe appearance; resolve their calling explicitly instead of falling back to peasant. */
export const PRESET_SOUND_IDENTITIES: Record<string, { profile: TravelerTypeId; variant: number }> = {
  Storybook: {profile:"peasant",variant:0}, Female: {profile:"peasant",variant:0},
  Monk: {profile:"friar",variant:0}, Nun: {profile:"nun",variant:0},
  Minstrel: {profile:"minstrel",variant:0}, Beggar: {profile:"beggar",variant:0},
  Traveler: {profile:"pilgrim",variant:0}, Stout: {profile:"peasant",variant:1}, Lanky: {profile:"peasant",variant:2},
}
export function characterSoundIdentity(character:string,subject="person") {
  if(subject==='knight')return {profile:'knight',variant:0}
  if(character.startsWith('preset/'))return PRESET_SOUND_IDENTITIES[character.slice(7)]??{profile:'peasant',variant:0}
  const parts=character.split('/')
  const body=parts.at(-1)??''
  return {profile:character.startsWith('job/')?parts.slice(0,2).join('/'):parts[0],variant:body.endsWith('tall')?1:body.endsWith('broad')?2:0}
}
