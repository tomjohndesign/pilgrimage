import { makeRng } from "../rng"
import { reflectBuildingParts } from "../building-layout"
import { marketLayout } from "../market-layout"
import { buildingDoorOffset } from "../building-rotation"
import { tavernExteriorBenches } from "./furnishings"
import { BUILDING_DOOR_HEIGHT } from "./dimensions"
import type { BuildingPart, Vec3 } from "./geometry"

/** Furniture against the building edge of the reserved path tile; the middle stays wide enough to walk through.
 * A market's produce basket belongs to its keeper and is left out of an unkept stall. */
export function entranceParts(type: string, wallHeight = .78, seed = 17, stocked = true, layout = { width: type === "tavern" || type === "market" ? 3 : 2, depth: 2, seed: 0 }): BuildingPart[] {
  if (type === "well" || type === "watering-hole") return []
  const random = makeRng(seed), randomHand = random() < .5 ? -1 : 1, furnishing = (Math.floor(random()*3)+2)%3
  const hand = type === "tavern" ? Math.sign(tavernExteriorBenches(layout.width, layout.depth, layout.seed)[1].x - buildingDoorOffset(layout.width, type, layout.seed)) || 1 : randomHand
  const wood = ["#806b4c", "#947b55", "#71634c"][Math.floor(random()*3)]
  const parts:BuildingPart[]=[]
  const box=(name:string,position:Vec3,size:Vec3,color:string,rotation?:Vec3)=>parts.push({name:`entry-${name}`,layer:"interior",position,size,color: color === "#806b4c" ? wood : color,rotation,outline:false,maxSceneryDetail:1})
  const x=-.37-random()*.005,z=-.382-random()*.006
  // Grass creeps into the two protected edges of the existing approach tile.
  for (const side of [-1,1]) {
    box(`moss-edge-${side}`,[side*.425,.014,-.385],[.14,.018,.19],"#435c36")
    box(`embedded-stone-${side}`,[side*.445,.018,-.397],[.065,.035,.09],side===1 ? "#8c9283" : "#626d63")
    for(let i=0;i<3;i++) box(`grass-edge-${side}-${i}`,[side*(.405+i*.025),.035+i*.015,-.32],[.02,.065+i*.02,.035],i%2 ? "#64834f" : "#365e3a")
  }
  if(type === "tavern" || type === "inn") {
    // A readable ale cask, tucked beside the door in the reserved approach.
    box("cask-body",[x,.17,z],[.19,.30,.19],"#977448")
    box("cask-belly",[x,.17,z],[.23,.19,.22],"#785331")
    box("cask-lid",[x,.327,z],[.20,.025,.20],"#ba9963")
    for(const y of [.065,.26]) box(`cask-hoop-${y}`,[x,y,z],[.23,.035,.22],"#38392f")
    if(type === "inn") box("cask-blue-linen",[x,.255,z+.115],[.11,.14,.008],"#5b7787")
    box("cask-stave",[x,.17,z+.113],[.016,.16,.005],"#b3935c")
  } else if(["tavern","shelter","house","monk-shelter","hall","shrine"].includes(type)) {
    if (furnishing === 0) {
      box("supply-chest",[x,.13,z],[.23,.26,.21],"#574734")
      box("chest-lid",[x,.269,z],[.235,.025,.22],"#aa8b5a")
      box("folded-blue-cloth",[x-.015,.293,z],[.105,.024,.17],"#526d80")
      for(const side of [-1,1]) box(`chest-band-${side}`,[x+side*.065,.266,z],[.018,.02,.22],"#594d3a")
    } else if (furnishing === 1) {
      box("water-tub",[x,.10,z],[.22,.20,.22],wood)
      box("tub-water",[x,.205,z],[.17,.01,.17],"#425b65")
      box("tub-hoop",[x,.045,z],[.22,.025,.22],"#5b523f")
    } else if (type !== "tavern") {
    for(const a of [-1,1]) for(const b of [-1,1]) box(`chair-leg-${a}-${b}`,[x+a*.08,.12,z+b*.08],[.026,.24,.026],"#806b4c")
    box("chair-seat",[x,.25,z],[.22,.035,.22],"#9f875e")
    parts[parts.length-1].support = { clips: ["sitting", "sittingChair", "seatedMeal", "seatedDrink"], heading: 0 }
    for(const side of [-1,1]) box(`chair-back-post-${side}`,[x+side*.085,.36,z-.085],[.028,.27,.028],"#806b4c")
    box("chair-back",[x,.45,z-.085],[.20,.08,.025],"#968058")
    }
  } else if((type==="market" && stocked) || type==="storehouse") {
    box("basket",[x,.10,z],[.20,.20,.22],"#967e58")
    for(let i=0;i<3;i++) box(`produce-${i}`,[x+(i-1)*.05,.215,z],[.055,.055,.09],type==="market" ? ["#98634f","#899157","#ac8657"][i] : "#b29a6e")
  } else if(type==="sheep-pen") {
    box("feed-basket",[x,.11,z],[.22,.22,.22],"#8c7250")
    box("feed-hay",[x,.225,z],[.2,.05,.2],"#b7a367")
    box("crook-staff",[x+.05,.36,z],[.026,.62,.026],"#7d6644")
  } else if(type==="workshop" || type==="wood-shelter") {
    box("wood-block",[x,.115,z],[.21,.23,.21],"#92744e")
    box("block-top",[x,.233,z],[.19,.012,.19],"#ad9165")
    box("axe-haft",[x,.36,z],[.024,.28,.026],"#70593d")
    box("axe-head",[x+.04,.29,z],[.09,.075,.03],"#7c8177")
  }
  if (["tavern", "inn", "market"].includes(type)) {
    const props = hand === -1 ? reflectBuildingParts(parts) : parts
    const market = marketLayout(layout.width, layout.depth, layout.seed)
    const sx = type === "market" ? market.stallX + market.hand * (market.stallWidth / 2 - .13)
      - buildingDoorOffset(layout.width, type, layout.seed) : 0
    const head = type === "tavern" ? Math.max(BUILDING_DOOR_HEIGHT, wallHeight * .9) : BUILDING_DOOR_HEIGHT
    return [...props, ...hangingSignParts(type, sx, type === "market" ? wallHeight + .65 : head + .56)]
  }
  return hand === -1 ? reflectBuildingParts(parts) : parts
}

/** Matching two-sided boards hang clear of the wall from a projecting timber arm.
 * Coordinates are relative to the reserved approach tile, facing local +Z. */
export function hangingSignParts(type: string, sx: number, arm: number): BuildingPart[] {
  const parts: BuildingPart[] = [], boardZ = -.22, boardY = arm - .21
  const box = (name: string, position: Vec3, size: Vec3, color: string, rotation?: Vec3) =>
    parts.push({ name: `entry-sign-${name}`, layer: "interior", position, size, color, rotation,
      outline: false, maxSceneryDetail: 2, ...(name.startsWith("paint-") ? { playerAccent: true } : {}) })
  box("wall-plate", [sx, arm-.08, -.612], [.09,.22,.04], "#5c4632")
  box("arm", [sx, arm, -.325], [.045,.045,.61], "#5c4632")
  box("brace", [sx, arm-.10, -.50], [.032,.28,.032], "#5c4632", [.85,0,0])
  for (const z of [-.35,-.09]) box(`hanger-${z}`, [sx, arm-.02, z], [.022,.04,.022], "#4a4036")
  box("frame", [sx,boardY,boardZ], [.05,.36,.34], "#4e3c2b")
  for (const side of [-1,1]) {
    const x = sx+side*.03, ink="#705a46", face="#cabb98"
    box(`board-${side}`, [x,boardY,boardZ], [.014,.30,.28], face)
    box(`paint-${side}`, [x+side*.01,boardY-.132,boardZ], [.008,.018,.16], "#84725a")
    if (type === "tavern") {
      box(`cup-${side}`, [x+side*.01,boardY-.015,boardZ-.02], [.008,.16,.13], ink)
      box(`cup-rim-${side}`, [x+side*.01,boardY+.08,boardZ-.02], [.008,.025,.16], ink)
      box(`cup-handle-${side}`, [x+side*.01,boardY-.005,boardZ+.075], [.008,.11,.06], ink)
      box(`cup-handle-hole-${side}`, [x+side*.015,boardY-.005,boardZ+.075], [.006,.06,.028], face)
    } else if (type === "inn") {
      for (const end of [-1,1]) box(`bed-leg-${side}-${end}`, [x+side*.01,boardY-.015,boardZ+end*.09], [.008,.15,.025], ink)
      box(`bed-mattress-${side}`, [x+side*.01,boardY,boardZ], [.008,.045,.20], ink)
      box(`bed-pillow-${side}`, [x+side*.01,boardY+.035,boardZ-.055], [.008,.03,.06], ink)
    } else {
      box(`basket-${side}`, [x+side*.01,boardY-.04,boardZ], [.008,.10,.19], ink)
      for (const end of [-1,1]) box(`produce-${side}-${end}`, [x+side*.01,boardY+.035,boardZ+end*.045], [.008,.07,.07], "#657849")
      box(`basket-rim-${side}`, [x+side*.01,boardY+.005,boardZ], [.008,.025,.22], ink)
    }
  }
  return parts
}
