import type { Point, CrossSection } from "../transport/geometry"
import type { WildlifeKind } from "./species"

export type MammalKind = Exclude<WildlifeKind, "hawk" | "sparrow">
export type BodyRegion = "pelvis" | "loin" | "ribs" | "shoulder" | "neck" | "skull" | "muzzle" | "forelimb" | "hindlimb" | "feet" | "tail"
export const REGION_COLORS: Record<BodyRegion, string> = { pelvis: "#a77dba", loin: "#b59d73", ribs: "#73a4ae", shoulder: "#73a58d", neck: "#cba26a", skull: "#c08074", muzzle: "#dabd92", forelimb: "#88b4aa", hindlimb: "#ab91bd", feet: "#68777c", tail: "#b4a082" }
export type BodySection = CrossSection & { region: BodyRegion }
export interface LimbAnatomy {
  points: [Point, Point, Point, Point]
  /** Skin radii at the attachment, elbow/stifle, wrist/hock and toe. */
  radii: [number, number, number, number]
  foot: Point
}
export interface MammalAnatomy {
  height: number
  body: BodySection[]
  neck: { base: Point; poll: Point; width: number; rootWidth: number }
  skull: { length: number; width: number; height: number; drop: number; noseWidth: number; pitch: number }
  front: LimbAnatomy; hind: LimbAnatomy
  scapula: Point
  tail: { base: Point; points: Point[]; radii: number[] }
  ears: { base: Point; tip: Point; width: number }
  coat: string; belly: string; dark: string
}
const ring = (y: number, z: number, width: number, top: number, bottom: number, region: BodyRegion): BodySection => ({ at: [0, y, z], width, top, bottom, region })
const limb = (x: number, yz: [number, number][], radii: LimbAnatomy["radii"], foot: Point): LimbAnatomy => ({ points: yz.map(([y,z]) => [x,y,z]) as LimbAnatomy["points"], radii, foot })

/** Authored anatomical landmarks in the same units and pixel scale as the person.
 * Silhouette and skeleton share these values; species are not resized donkey bodies. */
const DOE: MammalAnatomy = {
  height: .91, coat: "#a97849", belly: "#c5aa7e", dark: "#453a30",
  body: [ring(.95,-.73,.08,.13,.11,"pelvis"),ring(.96,-.57,.245,.25,.23,"pelvis"),ring(.94,-.30,.22,.22,.22,"loin"),ring(.92,-.02,.25,.24,.255,"ribs"),ring(.93,.25,.255,.28,.28,"ribs"),ring(.95,.43,.21,.28,.30,"shoulder"),ring(.99,.51,.145,.18,.21,"shoulder")],
  neck: { base: [0,1.04,.44], poll: [0,1.66,.77], width: .115, rootWidth: .19 },
  skull: { length: .37, width: .135, height: .145, drop: .10, noseWidth: .045, pitch: .12 },
  front: limb(.18,[[.91,.49],[.60,.39],[.30,.50],[.065,.49]],[.125,.075,.040,.036],[.105,.065,.14]),
  hind: limb(.20,[[.94,-.54],[.65,-.31],[.30,-.59],[.065,-.55]],[.18,.105,.047,.036],[.105,.065,.14]),
  scapula: [.17,1.13,.29],
  tail: { base:[0,1.06,-.70],points:[[0,0,0],[0,-.06,-.12],[0,-.19,-.17]],radii:[.07,.075,.015] },
  ears: { base:[.09,.09,.025],tip:[.27,.27,-.02],width:.085 },
}
const BUCK: MammalAnatomy = {
  ...DOE, height: .98,
  body: DOE.body.map(s => ({...s,at:[s.at[0],s.at[1]*1.07,s.at[2]*1.08],width:s.width*1.16,top:s.top*1.12,bottom:s.bottom!*1.1})),
  neck:{base:[0,1.12,.48],poll:[0,1.75,.80],width:.14,rootWidth:.245},
  skull:{...DOE.skull,width:.155,height:.16,length:.40,noseWidth:.052},
  front:limb(.215,[[.98,.53],[.64,.42],[.31,.54],[.07,.53]],[.145,.085,.047,.043],[.12,.07,.16]),
  hind:limb(.225,[[1.00,-.59],[.69,-.34],[.32,-.64],[.07,-.60]],[.20,.12,.055,.043],[.12,.07,.16]),
  scapula:[.20,1.20,.32],tail:{...DOE.tail,base:[0,1.14,-.76]},
}
export const MAMMAL_ANATOMY: Record<MammalKind,MammalAnatomy> = {
  deer: DOE, buck: BUCK,
  sheep: {
    height:.67,coat:"#e9e5d8",belly:"#d5cebd",dark:"#625b50",
    body:[ring(.64,-.62,.12,.19,.16,"pelvis"),ring(.67,-.43,.30,.30,.25,"pelvis"),ring(.67,-.18,.32,.31,.29,"loin"),ring(.66,.10,.34,.33,.30,"ribs"),ring(.68,.30,.29,.30,.30,"shoulder"),ring(.70,.40,.19,.20,.25,"shoulder")],
    neck:{base:[0,.73,.29],poll:[0,1.03,.62],width:.165,rootWidth:.255},
    skull:{length:.30,width:.125,height:.145,drop:.10,noseWidth:.063,pitch:.28},
    front:limb(.21,[[.67,.34],[.43,.27],[.20,.36],[.055,.36]],[.14,.09,.05,.04],[.115,.055,.135]),
    hind:limb(.23,[[.69,-.42],[.45,-.25],[.20,-.46],[.055,-.40]],[.18,.12,.055,.043],[.115,.055,.135]),
    scapula:[.20,.85,.20],tail:{base:[0,.77,-.56],points:[[0,0,0],[0,-.16,-.08],[0,-.24,-.08]],radii:[.065,.055,.015]},
    ears:{base:[.105,.085,-.015],tip:[.28,.11,.035],width:.065},
  },
  goat:{
    height:.73,coat:"#b5aa90",belly:"#c5baa0",dark:"#514a3e",
    body:[ring(.77,-.62,.085,.12,.11,"pelvis"),ring(.79,-.44,.23,.22,.23,"pelvis"),ring(.76,-.19,.22,.23,.22,"loin"),ring(.73,.08,.26,.27,.28,"ribs"),ring(.76,.29,.225,.26,.29,"shoulder"),ring(.79,.40,.14,.15,.22,"shoulder")],
    neck:{base:[0,.82,.32],poll:[0,1.18,.64],width:.10,rootWidth:.17},
    skull:{length:.30,width:.115,height:.14,drop:.10,noseWidth:.049,pitch:.20},
    front:limb(.17,[[.73,.35],[.46,.27],[.22,.37],[.06,.37]],[.12,.075,.044,.037],[.105,.06,.14]),
    hind:limb(.19,[[.78,-.44],[.51,-.25],[.24,-.49],[.06,-.43]],[.16,.105,.047,.038],[.105,.06,.14]),
    scapula:[.16,.95,.18],tail:{base:[0,.91,-.56],points:[[0,0,0],[0,.10,-.14],[0,.14,-.23]],radii:[.065,.067,.008]},
    ears:{base:[.09,.055,.02],tip:[.27,.16,.025],width:.073},
  },
  rabbit:{
    height:.28,coat:"#97866c",belly:"#c3b296",dark:"#50463a",
    body:[ring(.30,-.37,.09,.12,.12,"pelvis"),ring(.33,-.23,.22,.25,.19,"pelvis"),ring(.34,-.09,.235,.26,.19,"pelvis"),ring(.32,.05,.18,.18,.17,"ribs"),ring(.30,.19,.15,.13,.145,"shoulder"),ring(.31,.25,.10,.10,.10,"shoulder")],
    neck:{base:[0,.32,.20],poll:[0,.45,.32],width:.085,rootWidth:.12},
    skull:{length:.19,width:.14,height:.15,drop:.055,noseWidth:.057,pitch:.06},
    front:limb(.105,[[.28,.19],[.18,.12],[.08,.23],[.04,.26]],[.078,.047,.030,.031],[.09,.04,.12]),
    hind:limb(.18,[[.35,-.16],[.22,.01],[.10,-.22],[.05,-.10]],[.16,.12,.06,.05],[.13,.05,.29]),
    scapula:[.11,.39,.10],tail:{base:[0,.34,-.34],points:[[0,0,0],[0,.025,-.055],[0,.035,-.10]],radii:[.065,.085,.015]},
    ears:{base:[.064,.11,-.01],tip:[.105,.42,-.06],width:.055},
  },
  fox:{
    height:.50,coat:"#b96732",belly:"#d8c7a7",dark:"#3a302a",
    body:[ring(.54,-.59,.06,.09,.09,"pelvis"),ring(.55,-.41,.16,.18,.17,"pelvis"),ring(.52,-.21,.135,.16,.11,"loin"),ring(.49,.015,.165,.20,.16,"ribs"),ring(.51,.24,.18,.23,.24,"shoulder"),ring(.56,.38,.13,.15,.19,"shoulder")],
    neck:{base:[0,.61,.30],poll:[0,.79,.55],width:.095,rootWidth:.155},
    skull:{length:.30,width:.12,height:.125,drop:.075,noseWidth:.026,pitch:.06},
    front:limb(.115,[[.50,.35],[.32,.24],[.14,.34],[.05,.35]],[.095,.06,.032,.034],[.085,.05,.13]),
    hind:limb(.135,[[.53,-.40],[.34,-.23],[.16,-.45],[.05,-.39]],[.13,.095,.04,.035],[.09,.05,.14]),
    scapula:[.12,.67,.18],tail:{base:[0,.62,-.53],points:[[0,0,0],[0,-.10,-.20],[0,-.25,-.43],[0,-.35,-.65],[0,-.36,-.82]],radii:[.055,.15,.17,.12,.01]},
    ears:{base:[.085,.065,-.005],tip:[.12,.265,-.025],width:.075},
  },
  boar:{
    height:.68,coat:"#605242",belly:"#554938",dark:"#3c342b",
    body:[ring(.64,-.75,.08,.12,.11,"pelvis"),ring(.66,-.55,.29,.25,.23,"pelvis"),ring(.68,-.30,.33,.29,.27,"loin"),ring(.70,-.04,.37,.33,.29,"ribs"),ring(.73,.22,.36,.36,.33,"shoulder"),ring(.75,.42,.275,.30,.29,"shoulder"),ring(.74,.53,.20,.20,.22,"shoulder")],
    neck:{base:[0,.76,.43],poll:[0,.73,.67],width:.19,rootWidth:.25},
    skull:{length:.47,width:.225,height:.23,drop:.125,noseWidth:.095,pitch:.24},
    front:limb(.235,[[.68,.40],[.41,.28],[.17,.40],[.065,.40]],[.17,.115,.065,.049],[.135,.065,.17]),
    hind:limb(.245,[[.63,-.52],[.42,-.32],[.19,-.57],[.065,-.48]],[.20,.13,.065,.05],[.135,.065,.17]),
    scapula:[.24,.92,.15],tail:{base:[0,.78,-.68],points:[[0,0,0],[0,-.06,-.17],[0,-.22,-.21]],radii:[.03,.023,.015]},
    ears:{base:[.15,.115,.025],tip:[.22,.30,.09],width:.10},
  },
}
export function limbBones(limb: LimbAnatomy) {
  const length = (a:Point,b:Point)=>Math.hypot(...a.map((v,i)=>v-b[i]))
  return {upper:length(limb.points[0],limb.points[1]),middle:length(limb.points[1],limb.points[2]),cannon:length(limb.points[2],limb.points[3])}
}
