import { makeRng } from "../rng"
import { reflectBuildingParts } from "../building-layout"
import { BUILDING_DOOR_HEIGHT } from "./dimensions"
import type { BuildingPart, Vec3 } from "./geometry"

/** Furniture against the building edge of the reserved path tile; the middle stays wide enough to walk through. */
export function entranceParts(type: string, wallHeight = .78, seed = 17): BuildingPart[] {
  const random = makeRng(seed), hand = random() < .5 ? -1 : 1, furnishing = (Math.floor(random()*3)+2)%3
  const wood = ["#806b4c", "#947b55", "#71634c"][Math.floor(random()*3)]
  const parts:BuildingPart[]=[]
  const box=(name:string,position:Vec3,size:Vec3,color:string,rotation?:Vec3)=>parts.push({name:`entry-${name}`,layer:"interior",position,size,color: color === "#806b4c" ? wood : color,rotation,outline:false})
  const x=-.37-random()*.005,z=-.382-random()*.006
  if(["tavern","shelter","house","monk-shelter","hall","shrine"].includes(type)) {
    if (furnishing === 0) {
      box("supply-chest",[x,.13,z],[.23,.26,.21],wood)
      for(const side of [-1,1]) box(`chest-band-${side}`,[x+side*.065,.266,z],[.018,.02,.22],"#594d3a")
    } else if (furnishing === 1) {
      box("water-tub",[x,.10,z],[.22,.20,.22],wood)
      box("tub-water",[x,.205,z],[.17,.01,.17],"#64756c")
      box("tub-hoop",[x,.045,z],[.22,.025,.22],"#5b523f")
    } else if (type !== "tavern") {
    for(const a of [-1,1]) for(const b of [-1,1]) box(`chair-leg-${a}-${b}`,[x+a*.08,.12,z+b*.08],[.026,.24,.026],"#806b4c")
    box("chair-seat",[x,.25,z],[.22,.035,.22],"#9f875e")
    parts[parts.length-1].support = { clips: ["sitting", "seatedMeal", "seatedDrink"], heading: 0 }
    for(const side of [-1,1]) box(`chair-back-post-${side}`,[x+side*.085,.36,z-.085],[.028,.27,.028],"#806b4c")
    box("chair-back",[x,.45,z-.085],[.20,.08,.025],"#968058")
    }
  } else if(type==="market" || type==="storehouse") {
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
  if(type === "tavern") {
    const head=Math.max(BUILDING_DOOR_HEIGHT,wallHeight*.9),arm=head+.45,boardZ=-.44,boardY=head+.23
    // A squared bracket projects from the wall above the door, under the brow thatch; the board hangs at right angles so either front view sees a face.
    box("sign-wall-plate",[0,arm-.05,-.612],[.15,.22,.04],"#5c4632")
    box("sign-arm",[0,arm,-.45],[.045,.045,.36],"#5c4632")
    box("sign-brace",[0,arm-.09,-.46],[.032,.35,.032],"#5c4632",[1.0,0,0])
    for(const z of [-.57,-.31]) box(`sign-hanger-${z}`,[0,arm-.045,z],[.022,.09,.022],"#4a4036")
    box("sign-frame",[0,boardY,boardZ],[.05,.36,.34],"#4e3c2b")
    // Limewashed board and a muted red ale cup keep the sign legible at play zoom.
    for(const side of [-1,1]) {
      const x=side*.03
      box(`sign-board-${side}`,[x,boardY,boardZ],[.014,.30,.28],"#e6d7a8")
      box(`sign-cup-${side}`,[x+side*.004,boardY-.015,boardZ-.02],[.008,.16,.13],"#8a4b3c")
      box(`sign-cup-rim-${side}`,[x+side*.004,boardY+.08,boardZ-.02],[.008,.025,.16],"#8a4b3c")
      box(`sign-cup-handle-${side}`,[x+side*.004,boardY-.005,boardZ+.075],[.008,.11,.06],"#8a4b3c")
      box(`sign-cup-handle-hole-${side}`,[x+side*.008,boardY-.005,boardZ+.075],[.006,.06,.028],"#e6d7a8")
    }
    return hand === -1 ? reflectBuildingParts(parts) : parts
  }
  const sx=.39,sz=-.47
  box("sign-post",[sx,.32,sz],[.035,.64,.035],"#725c40")
  box("sign-board",[sx,.57,sz],[.19,.19,.03],"#a48961")
  if(["shrine","hall","monk-shelter","enclosure"].includes(type)) {
    box("sign-cross-upright",[sx,.57,sz+.018],[.02,.14,.008],"#5d513c")
    box("sign-cross-arm",[sx,.595,sz+.018],[.105,.018,.008],"#5d513c")
  } else if(type==="sheep-pen") {
    box("sign-fleece",[sx,.57,sz+.018],[.11,.085,.008],"#7f7358")
    box("sign-fleece-head",[sx+.055,.545,sz+.018],[.04,.04,.008],"#5d513c")
  } else if(type==="workshop" || type==="wood-shelter") {
    box("sign-axe-haft",[sx,.57,sz+.018],[.018,.13,.008],"#66523b")
    box("sign-axe-head",[sx+.025,.60,sz+.018],[.065,.045,.008],"#66523b")
  } else {
    box("sign-symbol",[sx,.56,sz+.018],[.12,.045,.008],type==="market" ? "#986657" : "#746844")
    box("sign-symbol-end",[sx-.045,.59,sz+.018],[.03,.03,.008],"#746844")
  }
  return hand === -1 ? reflectBuildingParts(parts) : parts
}
