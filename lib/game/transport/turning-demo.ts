import { BASE_CHARACTER_SCALE, personWalkStride } from "../base-person/gait"
import { type GameMap, type TilePos } from "../map/types"
import { cartOffset, merchantWalkSpeed, pullingDesign, type HorseVariant, type Puller } from "./assets"
import { roadCartPose } from "./bridge-guide"
import { convoyClear } from "./navigation"
import { advanceCartProgress, cartRoutePoint, DEFAULT_CART_TURN_RADIUS } from "./route"
import type { DemoStage, MerchantDemo, MerchantDemoFrame } from "./demo"

export const TURNING_SCENARIOS = [
  { id: "right", label: "Right at a T-junction", description: "An open corner with room for the rear wheels to cut inside." },
  { id: "left", label: "Left at a T-junction", description: "The mirrored turn checks left/right symmetry." },
  { id: "s_bend", label: "S-bend", description: "Two turns with enough space to straighten between them." },
  { id: "bridge", label: "Bridge bend", description: "A supported bridge corner with a curved inside deck." },
  { id: "compound_bridge", label: "Staggered bridge landings", description: "Closely spaced bends leading into a long span test overlapping corners and walkers in both lanes." },
  { id: "reverse", label: "Walk backward", description: "Retrace a straight approach while keeping the animal facing forward." },
  { id: "hairpin", label: "Tight hairpin", description: "Two right turns only one tile apart test the minimum turning space." },
  { id: "chicane", label: "Short chicane", description: "Opposite turns two tiles apart test the axle before it can straighten." },
  { id: "wooded_corner", label: "Cramped wooded corner", description: "Trees block the inside shortcut; watch the rear wheels and shafts." },
  { id: "short_bridge", label: "Short bridge corner", description: "One-tile bridge arms leave little room for a curved inside deck." },
  { id: "bridge_exit", label: "Turn after a bridge ramp", description: "A turn immediately after the descent tests the tail while it is still on the ramp." },
  { id: "reverse_bend", label: "Back around a bend", description: "Retrace a curved approach; the animal backs without spinning around." },
] as const
export type TurningScenario = typeof TURNING_SCENARIOS[number]["id"]

export function turningMap(scenario: TurningScenario): GameMap {
  const width = 17, depth = 13, road: TilePos[] = []
  const shapes: Partial<Record<TurningScenario, number[][]>> = {
    reverse: [[1,6],[15,6]], left: [[1,9],[11,9],[11,2]],
    s_bend: [[1,3],[6,3],[6,8],[15,8]],
    hairpin: [[1,4],[11,4],[11,5],[1,5]],
    chicane: [[1,4],[8,4],[8,6],[15,6]],
    bridge_exit: [[1,3],[10,3],[10,10]],
    compound_bridge: [[1,3],[4,3],[4,4],[5,4],[5,5],[6,5],[6,6],[12,6],[12,10]],
  }
  const knots = shapes[scenario] ?? [[1,3],[11,3],[11,10]]
  for (let i = 1; i < knots.length; i++) {
    const [ax,az] = knots[i-1], [bx,bz] = knots[i], n = Math.abs(bx-ax) + Math.abs(bz-az)
    for (let j = i === 1 ? 0 : 1; j <= n; j++) road.push({ x: ax+(bx-ax)*j/n, z: az+(bz-az)*j/n })
  }
  const map: GameMap = { width, depth, road, seed: 84, buildings: [], tiles: Array(width*depth).fill("grass") }
  if (scenario === "bridge" || scenario === "short_bridge") {
    const start = scenario === "bridge" ? 7 : 10, end = scenario === "bridge" ? 7 : 4
    for (let z = 2; z <= end; z++) for (let x = start; x <= 12; x++) map.tiles[z*width+x] = "water"
  }
  if (scenario === "compound_bridge") for (let z = 5; z <= 8; z++) for (let x = 7; x <= 13; x++) map.tiles[z*width+x] = "water"
  if (scenario === "bridge_exit") for (let z = 1; z <= 6; z++) for (let x = 5; x <= 8; x++) map.tiles[z*width+x] = "water"
  if (scenario === "wooded_corner") for (let z = 4; z <= 8; z++) for (let x = 6; x <= 10; x++) map.tiles[z*width+x] = "forest"
  for (const p of road) {
    const bridge = scenario === "bridge" && ((p.z === 3 && p.x >= 7 && p.x <= 10) || (p.x === 11 && p.z >= 4 && p.z <= 7)) ||
      scenario === "short_bridge" && ((p.z === 3 && p.x === 10) || (p.x === 11 && p.z === 4)) ||
      scenario === "compound_bridge" && ((p.x === 3 && p.z === 3) || (p.z === 6 && p.x >= 7 && p.x <= 11) || (p.x === 12 && p.z >= 7 && p.z <= 8)) ||
      scenario === "bridge_exit" && p.z === 3 && p.x >= 5 && p.x <= 8
    map.tiles[p.z*width+p.x] = bridge ? "bridge" : "path"
  }
  if (scenario === "right" || scenario === "left") for (let x = 12; x <= 15; x++) map.tiles[(scenario === "left" ? 9 : 3)*width+x] = "path"
  return map
}

/** The exact runtime route and axle solver, sampled by rig-derived travel
 * distance. Seeking backwards reuses poses, so it cannot destabilise the hitch. */
export function turningDemo(scenario:TurningScenario,puller:Puller,variant:HorseVariant="common",radius=DEFAULT_CART_TURN_RADIUS):MerchantDemo {
  const backing = scenario === "reverse" || scenario === "reverse_bend"
  const map=turningMap(scenario),step=1/30,wheelbase=-cartOffset(puller)*BASE_CHARACTER_SCALE
  const speed=merchantWalkSpeed(puller,BASE_CHARACTER_SCALE,personWalkStride(pullingDesign(0))*BASE_CHARACTER_SCALE,variant)
  const point=(p:number)=>cartRoutePoint(map,p,radius),frames:MerchantDemoFrame[]=[],starts:MerchantDemo["starts"]={}
  let progress=wheelbase+0.5,pose=roadCartPose(map,progress,1,wheelbase,BASE_CHARACTER_SCALE,undefined,radius),time=0
  const end=map.road!.length-1.5
  while(progress<=end){
    const p=point(progress),ahead=point(progress+0.005),behind=point(progress-0.005)
    const heading=Math.atan2(ahead.x-behind.x,ahead.z-behind.z)
    pose=roadCartPose(map,progress,1,wheelbase,BASE_CHARACTER_SCALE,pose,radius)
    const fraction=(progress-wheelbase-0.5)/(end-wheelbase-0.5)
    const stage:DemoStage=backing?"Approach":fraction<0.25?"Approach":fraction<0.75?"Turning":"Exit"
    starts[stage]??=time
    frames.push({time,stage,activity:"walking",merchant:{...p,heading,moving:true},customer:{x:0,z:0,heading:0,moving:false},
      keeperTime:0,cartPose:pose,shopProgress:0,sales:0,clearance:convoyClear(map,pose,puller,BASE_CHARACTER_SCALE,false,heading)})
    progress=advanceCartProgress(map,progress,speed*step,radius);time+=step
  }
  if(backing){
    starts.Backing=time
    for(const frame of [...frames].reverse()){frames.push({...frame,time,stage:"Backing",reversing:true});time+=step}
    delete starts.Turning;delete starts.Exit
  }
  return {map,frames,starts,duration:time,step,stages:backing?["Approach","Backing"]:["Approach","Turning","Exit"],turning:true}
}
