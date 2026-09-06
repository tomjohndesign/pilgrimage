"use client"

import { BUILDING_VIEWS, projectBuildingPoint, projectionLayout } from "@/lib/game/building-art/projection"
import { registrationTransforms, type Registrations, type Point } from "@/lib/game/building-art/registration"
import { buildingDimensions } from "@/lib/game/building-art/dimensions"
import type { BuildingRecipe } from "@/lib/game/building-art/style"

/** An atlas cell and the actual game-grid projection share one coordinate system. */
export function AtlasPreview({ image, recipe, view, allViews = false, grid = false, registrations, onRegisterPoint, points = [], closeup = false }: {
  image: string; recipe: BuildingRecipe; view: number; allViews?: boolean; grid?: boolean; registrations?: Registrations; onRegisterPoint?: (point: Point) => void; points?: Point[]; closeup?: boolean
}) {
  const views = allViews ? BUILDING_VIEWS : [BUILDING_VIEWS[view]]
  const layout = projectionLayout(recipe)
  let viewBox = `0 0 ${allViews ? 2048 : 1024} ${allViews ? 2048 : 1024}`
  if (closeup && !allViews) {
    const dimensions = buildingDimensions(recipe)
    const bounds = [-1,1].flatMap(x => [-1,1].flatMap(z => [0,dimensions.ridgeHeight].map(y => projectBuildingPoint(recipe,view,x*dimensions.width/2,y,z*dimensions.depth/2))))
    const xs = bounds.map(p=>p[0]), ys = bounds.map(p=>p[1])
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const side = Math.max(maxX-minX,maxY-minY)*1.1
    viewBox = `${((minX+maxX-side)/2)*1024} ${((minY+maxY-side)/2)*1024} ${side*1024} ${side*1024}`
  }
  return <svg viewBox={viewBox} style={{ width: "100%", height: "100%" }} onClick={onRegisterPoint && !allViews ? (event) => {
    const rect=event.currentTarget.getBoundingClientRect(), side=Math.min(rect.width,rect.height)
    const point: Point=[(event.clientX-rect.left-(rect.width-side)/2)/side,(event.clientY-rect.top-(rect.height-side)/2)/side]
    if(point.every(n=>n>=0&&n<=1)) onRegisterPoint(point)
  } : undefined} role="img" aria-label={`${recipe.subject} — ${allViews ? "all four isometric views" : BUILDING_VIEWS[view].name}`}>
    {views.map((v) => {
      const point = (x: number,z: number) => projectBuildingPoint(recipe,v.id,x,0,z).map((n)=>n*1024)
      const lines = []
      for(let x=-recipe.width/2;x<=recipe.width/2;x++) lines.push([point(x,-recipe.depth/2),point(x,recipe.depth/2)])
      for(let z=-recipe.depth/2;z<=recipe.depth/2;z++) lines.push([point(-recipe.width/2,z),point(recipe.width/2,z)])
      const registration=registrations?.[v.id]
      const fit=registration ? registrationTransforms(recipe,v.id,registration) : null
      return <svg key={v.id} x={allViews ? v.column*1024 : 0} y={allViews ? v.row*1024 : 0} width={1024} height={1024} viewBox="0 0 1024 1024" overflow="hidden">
        {recipe.output === "concept" && <rect width="1024" height="1024" fill="#f3eddf" />}
        {fit ? (["left","right"] as const).map((face)=>{
          // A small overlap avoids subpixel gaps when the SVG is scaled on screen.
          const m=fit[face], start=face==="left"?0:fit.split*1024-1, width=face==="left"?fit.split*1024+1:1024-start
          return <svg key={face} x={start} width={width} height={1024} viewBox={`${start} 0 ${width} 1024`} overflow="hidden"><g transform={`matrix(${m[0]} ${m[1]} 0 ${m[3]} ${m[4]*1024} ${m[5]*1024})`}><svg width={1024} height={1024} viewBox="0 0 1024 1024" overflow="hidden"><image href={image} x={-v.column*1024} y={-v.row*1024} width={2048} height={2048} preserveAspectRatio="none" /></svg></g></svg>
        }) : <image href={image} x={-v.column*1024} y={-v.row*1024} width={2048} height={2048} preserveAspectRatio="none" />}
        {onRegisterPoint && points.map(([x,y],i)=><circle key={i} cx={x*1024} cy={y*1024} r={8} fill="#b53025" stroke="#fff" strokeWidth={3} />)}
        {grid && <g fill="none" stroke="#256a64" strokeWidth={2.5}>
          {lines.map(([a,b],i)=><line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} opacity={0.65} />)}
          <circle cx={layout.anchor[0]*1024} cy={layout.anchor[1]*1024} r={7} fill="#ac3c30" stroke="#fff" />
          <text x={35} y={50} fill="#352b24" stroke="none" fontFamily="sans-serif" fontSize={24}>{v.id} · {v.name} · {recipe.width}×{recipe.depth}</text>
        </g>}
      </svg>
    })}
  </svg>
}
