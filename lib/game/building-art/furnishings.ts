import { makeRng } from "../rng"
import { layoutHand } from "../building-layout"
import { sheepPenLayout } from "../workshop-layout"
import type { BuildingPart, Vec3 } from "./geometry"
import { EARLY_MATERIALS as palette } from "./materials"
import { sharedChimneyParts, type SharedChimney } from "./shared-chimney"

/** Local attachment points shared by the stone chimney and its reusable effects. */
export function shelterHearth(width: number, depth: number, height: number, rise: number, layoutSeed = 0, hearthZ?: number) {
  const scale = Math.min(1, width / 1.5, depth / 1.5)
  // Along-wall coordinates are tile centres, including even-depth shells whose
  // geometric centre lies between two tiles. Adopted flues use the same grid.
  const slot=Math.floor(layoutSeed/9)%3, first=-(depth-1)/2
  const choices=[0,Math.max(0,Math.floor(depth/2)-1),Math.floor(depth/2)]
  const tile=Math.max(0,Math.min(depth-1,Math.round(hearthZ === undefined ? choices[slot] : hearthZ-first)))
  const z=first+tile
  return { x: width / 2 - .36 * scale, z,
    chimneyTop: Math.max(.78, height + rise + .32), scale }
}

/** Chimneys identify domestic hearths and the tavern’s cooking fire. */
export function hasDomesticHearth(variant: string | undefined, layoutSeed = 0, fireplace?: boolean): boolean {
  if (!["shelter","monk-shelter","house","tavern","sheep-pen"].includes(variant ?? "")) return false
  return fireplace ?? (variant !== "house" || Math.floor(layoutSeed/27)%4 !== 3)
}

/** Resolve the actual local fireplace, including huts inside a larger open plot. */
export function buildingHearth(variant: string | undefined, width: number, depth: number, height: number, rise: number, layoutSeed = 0, hearthZ?: number) {
  const hut=variant === "sheep-pen" ? sheepPenLayout(width) : {coreWidth:width,coreX:0}
  const hearth=shelterHearth(hut.coreWidth,depth,height,rise,layoutSeed,hearthZ)
  return {...hearth,x:(hearth.x+hut.coreX)*layoutHand(variant,layoutSeed),z:hearth.z}
}

/** One fireplace kit for homes and shelters, with a compact footprint in small huts. */
export function hearthParts(width: number, depth: number, height: number, rise: number, shared?: SharedChimney, layoutSeed = 0, hearthZ?: number, variationSeed = 17): BuildingPart[] {
  const parts: BuildingPart[] = []
  const { x, z, chimneyTop, scale } = shelterHearth(width,depth,height,rise,layoutSeed,hearthZ)
  const random = makeRng(variationSeed), stone = ["#a09b87", "#858a7d", "#999788", "#777d72"]
  const stoneColor = () => stone[Math.floor(random() * stone.length)]
  const shaftWidth = .28 + random() * .045
  const alongWall = z > -depth/2+.36*scale+.01
  // Remove the chimney as one wall, including its differently shaped rim stones.
  const chimneySide: [number, number] = Math.abs(x) > Math.abs(z) ? [Math.sign(x),0] : [0,Math.sign(z)]
  const box = (name: string, position: Vec3, size: Vec3, color: string, rotation?: Vec3, layer: BuildingPart["layer"] = "interior") =>
    parts.push({ name, position: [x + (position[0]-x)*scale, position[1], z + (position[2]-z)*scale],
      size: [size[0]*scale,size[1],size[2]*scale], color, rotation, layer,
      cutawaySide: layer === "wall" ? chimneySide : undefined, outline: false })
  box("hearth-slab", [x,.035,z], [.57,.07,.57], palette.stone)
  box("hearth-back", [x,.29,z-.22], [.55,.51,.12], stoneColor())
  box("hearth-side", [x+.22,.24,z], [.12,.41,.46], stoneColor())
  // A corner supplies one enclosure wall; a fireplace farther along the wall
  // needs its own second stone cheek around the room-facing opening.
  if (alongWall) box("hearth-other-side", [x-.22,.24,z], [.12,.41,.46], stoneColor())
  box("hearth-soot", [x,.22,z-.151], [.31,.28,.015], "#3d3b32")
  for(const sign of [-1,1]) box(`hearth-log-${sign}`, [x,.105,z], [.32,.07,.07], palette.darkWood, [0,sign*.5,0])
  box("hearth-embers", [x,.13,z], [.21,.035,.18], "#dc773b")
  if (alongWall) for (const part of parts) {
    const dx=part.position[0]-x,dz=part.position[2]-z
    part.position=[x-dz,part.position[1],z+dx]
    part.rotation=[0,(part.rotation?.[1] ?? 0)-Math.PI/2,0]
  }
  box("chimney-hood", [x,.58,z], [.49,.18,.44], stoneColor(),undefined,"wall")
  if (shared) return [...parts, ...sharedChimneyParts(shared, { x, z }, variationSeed)]
  const courses=Math.ceil((chimneyTop-.67)/(.10+random()*.065))
  for(let i=0;i<courses;i++) {
    const y=.67+(i+.5)*(chimneyTop-.67)/courses
    box(`chimney-course-${i}`, [x,y,z], [shaftWidth+(i%2?.01:0),(chimneyTop-.67)/courses-.006,shaftWidth], stoneColor(),undefined,"wall")
  }
  // Some masons corbel a broad cap; others finish with a plain narrow shaft.
  // The mouth and smoke anchor retain the same height in either treatment.
  if (variationSeed % 3 !== 0) box("chimney-cap-course", [x,chimneyTop-.11,z],
    [variationSeed % 3 === 1 ? .43 : .37,.075,variationSeed % 3 === 1 ? .43 : .37],stoneColor(),undefined,"wall")
  // Open rim, so the smoke actually leaves a dark chimney mouth.
  for(const sign of [-1,1]) {
    box(`chimney-rim-x-${sign}`, [x+sign*.16,chimneyTop,z], [.07,.08,.39], stoneColor(),undefined,"wall")
    box(`chimney-rim-z-${sign}`, [x,chimneyTop,z+sign*.16], [.25,.08,.07], stoneColor(),undefined,"wall")
  }
  box("chimney-mouth", [x,chimneyTop-.04,z], [.25,.015,.25], "#393b35",undefined,"wall")
  return parts
}

/** Work and domestic props use the same faceted timber palette as the shell. */
export function furnishingParts(kind: "workshop" | "shelter", width: number, depth: number, height: number, rise: number, layoutSeed = 0, hearthZ?: number, variationSeed = 17): BuildingPart[] {
  const parts: BuildingPart[] = []
  const box = (name: string, position: Vec3, size: Vec3, color: string = palette.wood, rotation?: Vec3, layer: BuildingPart["layer"] = "interior") =>
    parts.push({ name, position, size, color, rotation, layer, outline: false })
  const leg = (name: string, x: number, z: number, h: number) => box(name, [x,h/2,z], [.045,h,.045])
  const metal = "#777e78"
  if (kind === "workshop") {
    // Split planks, long saw and chisels at the back of the workbench.
    for (let i=0;i<5;i++) box(`lumber-plank-${i}`, [width*.32,.045+i*.046,-depth*.08], [.12,.04,depth*.59], i%2 ? palette.paleWood : palette.wood, [0,.035*(i%2),0])
    box("long-saw-blade", [0,.62,-depth*.36], [width*.52,.09,.022], metal)
    for(let i=0;i<16;i++) box(`saw-tooth-${i}`, [(i-7.5)*width*.03,.565,-depth*.36], [.027,.035,.024], metal, [0,0,Math.PI/4])
    for(const end of [-1,1]) box(`long-saw-grip-${end}`, [end*width*.28,.62,-depth*.36], [.065,.22,.055], palette.darkWood)
    for(let i=0;i<3;i++) {
      box(`chisel-handle-${i}`, [-.28+i*.13,.433,-depth*.26], [.045,.04,.09], palette.paleWood)
      box(`chisel-steel-${i}`, [-.28+i*.13,.424,-depth*.26+.1], [.028,.022,.12], metal)
    }
    // A chopping stump with a second axe, and a hand-cranked grindstone.
    box("chopping-stump", [width*.37,.14,depth*.36], [.29,.28,.28], palette.wood)
    box("stump-end-grain", [width*.37,.285,depth*.36], [.26,.012,.25], palette.paleWood)
    box("splitting-axe-head", [width*.37,.34,depth*.36], [.13,.13,.035], metal)
    box("splitting-axe-handle", [width*.37-.13,.47,depth*.36], [.36,.035,.035], palette.darkWood, [0,0,-.65])
    const gx=width*.12, gz=-depth*.1
    for(const side of [-1,1]) leg(`grindstone-leg-${side}`,gx+side*.14,gz,.28)
    box("grindstone-axle", [gx,.3,gz], [.4,.035,.035], metal)
    const vertices: number[]=[]
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6,b=(i+1)*Math.PI/6
      const p=(x:number,t:number)=>[x,.3+Math.cos(t)*.17,gz+Math.sin(t)*.17]
      for(const side of [-1,1]) vertices.push(gx+side*.055,.3,gz,...p(gx+side*.055,a),...p(gx+side*.055,b))
      vertices.push(...p(gx-.055,a),...p(gx+.055,a),...p(gx+.055,b),...p(gx-.055,a),...p(gx+.055,b),...p(gx-.055,b))
    }
    parts.push({name:"sharpening-stone",layer:"interior",position:[0,0,0],vertices,color:"#92978c",outline:false})
    box("grindstone-crank", [gx+.22,.25,gz], [.035,.13,.035], metal)
    box("grindstone-handle", [gx+.26,.19,gz], [.11,.04,.04], palette.paleWood)
    for(let i=0;i<55;i++) box(`sawdust-${i}`, [width*.15+Math.sin(i*7.13)*width*.21,.008,depth*.04+Math.cos(i*4.71)*depth*.3], [.025+(i%3)*.012,.012,.025], i%3 ? "#bca273" : palette.paleWood, [0,i*.7,0])
    for(let i=0;i<7;i++) box(`wood-offcut-${i}`, [width*.31+Math.sin(i*4)*.18,.025,depth*.3+Math.cos(i*7)*.19], [.07,.035,.13], palette.paleWood, [0,i,0])
  } else {
    parts.push(...hearthParts(width,depth,height,rise,undefined,layoutSeed,hearthZ,variationSeed))
    const tx=width*.13, tz=depth*.24
    for(const a of [-1,1]) for(const b of [-1,1]) leg(`home-table-leg-${a}-${b}`,tx+a*.24,tz+b*.15,.35)
    box("home-table-top", [tx,.37,tz], [.64,.055,.43], palette.paleWood)
    box("bread-loaf", [tx-.12,.43,tz], [.18,.07,.12], "#ad8956")
    for(let i=0;i<2;i++) {
      box(`table-cup-${i}`, [tx+.12,.45,tz+(i-.5)*.22], [.07,.11,.07], "#977056")
      box(`cup-opening-${i}`, [tx+.12,.508,tz+(i-.5)*.22], [.045,.008,.045], "#493d31")
    }
    box("travel-chest", [-width*.33,.14,depth*.33], [.32,.28,.24], palette.wood)
    for(const sign of [-1,1]) box(`chest-strap-${sign}`, [-width*.33+sign*.09,.285,depth*.33], [.027,.025,.25], palette.darkWood)
    box("clothesline", [-width*.13,height*.88,-depth*.3], [width*.58,.018,.018], palette.darkWood)
    for(let i=0;i<3;i++) {
      const cx=-width*.32+i*width*.18, cy=height*.88-.16
      box(`hanging-clothes-${i}`, [cx,cy,-depth*.3], [.19,.3,.032], ["#a8997b","#7c8270","#927760"][i])
      if(i!==1) for(const sign of [-1,1]) box(`clothes-sleeve-${i}-${sign}`, [cx+sign*.12,cy+.08,-depth*.3], [.085,.13,.032], i?"#927760":"#a8997b", [0,0,sign*.3])
      box(`clothes-peg-${i}`, [cx,height*.88,-depth*.3], [.025,.06,.04], palette.paleWood)
    }
  }
  return parts
}
