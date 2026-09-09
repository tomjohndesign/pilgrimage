import type { Animal } from "./assets"

export interface Coat { id: string; label: string; coat: string; light: string; dark: string; belly: string; muzzle: string; points: string; stripe?: boolean }
/** Natural coat/point combinations, independent of the animal's build and gait.
 * References: AMNH Coat Colors; Donkey & Mule Society NZ conformation standard.
 * Names describe coats, not a claim that the generic rig reproduces a breed.
 */
export const COATS: Record<Animal, readonly Coat[]> = {
  ox: [
    { id: "brown", label: "Brown", coat: "#76563c", light: "#99764f", dark: "#40342a", belly: "#947458", muzzle: "#5b5143", points: "#524434" },
    { id: "dun", label: "Dun", coat: "#a68c62", light: "#bca67c", dark: "#514435", belly: "#b5a080", muzzle: "#655b4c", points: "#6d5d43" },
  ],
  horse: [
    { id: "bay", label: "Bay", coat: "#754831", light: "#966345", dark: "#29251f", belly: "#865b40", muzzle: "#51483c", points: "#332b23" },
    { id: "chestnut", label: "Chestnut · flaxen mane", coat: "#975b37", light: "#b57c50", dark: "#c2a276", belly: "#a86e43", muzzle: "#6f5343", points: "#975b37" },
    { id: "black", label: "Black", coat: "#363532", light: "#514e47", dark: "#232321", belly: "#44423c", muzzle: "#4d4b43", points: "#292927" },
    { id: "grey", label: "Grey · dark skin", coat: "#aaa99f", light: "#c5c3b8", dark: "#6d6c66", belly: "#b6b4a8", muzzle: "#53544e", points: "#83837d" },
    { id: "dun", label: "Dun · dorsal stripe", coat: "#aa9066", light: "#c1a779", dark: "#40382b", belly: "#b7a07a", muzzle: "#635a48", points: "#514534", stripe: true },
  ],
  donkey: [
    { id: "grey", label: "Grey dun · dark cross", coat: "#817e72", light: "#9c998a", dark: "#444238", belly: "#b6b09b", muzzle: "#c6bfaa", points: "#817e72", stripe: true },
    { id: "brown", label: "Brown · pale muzzle", coat: "#6c5140", light: "#8b6c51", dark: "#393027", belly: "#b1a18a", muzzle: "#c0b29b", points: "#6c5140", stripe: true },
    { id: "black", label: "Black · pale points", coat: "#373831", light: "#515249", dark: "#262821", belly: "#aba793", muzzle: "#c0bca8", points: "#373831" },
    { id: "sorrel", label: "Sorrel", coat: "#a07150", light: "#b58c67", dark: "#714b34", belly: "#c1ab88", muzzle: "#cfbb99", points: "#a07150", stripe: true },
  ],
}
export function animalCoat(kind: Animal, id?: string) { return COATS[kind].find(coat => coat.id === id) ?? COATS[kind][0] }
