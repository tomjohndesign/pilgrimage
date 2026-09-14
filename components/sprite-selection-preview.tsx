"use client"

import { useEffect, useRef, useState } from "react"
import { SELECTION_OUTLINE_COLOR, SELECTION_OUTLINE_OPACITY, SELECTION_FILL, SELECTION_FILL_OPACITY } from "@/lib/game/selection"

/** The game's selection colors on the actual atlas silhouette, one source pixel wide. */
export function SpriteSelectionPreview({url,row,frame,cellSize}:{url:string;row:number;frame:number;cellSize:number}) {
  const canvas=useRef<HTMLCanvasElement>(null)
  const [source,setSource]=useState<HTMLImageElement|null>(null)
  useEffect(()=>{
    let active=true
    setSource(null)
    const image=new Image()
    image.onload=()=>{if(active)setSource(image)}
    image.src=url
    return()=>{active=false;image.onload=null}
  },[url])
  useEffect(()=>{
    const target=canvas.current,ctx=target?.getContext('2d')
    if(!target||!ctx)return
    ctx.clearRect(0,0,cellSize,cellSize)
    if(!source)return
    const mask=document.createElement('canvas');mask.width=mask.height=cellSize
    const m=mask.getContext('2d')!
    m.drawImage(source,frame*cellSize,row*cellSize,cellSize,cellSize,0,0,cellSize,cellSize)
    for(const [x,y] of [[-1,0],[1,0],[0,-1],[0,1]])ctx.drawImage(mask,x,y)
    ctx.globalCompositeOperation='source-in';ctx.fillStyle=SELECTION_OUTLINE_COLOR;ctx.fillRect(0,0,cellSize,cellSize)
    ctx.globalCompositeOperation='destination-out';ctx.drawImage(mask,0,0)
    ctx.globalCompositeOperation='source-in';ctx.globalAlpha=SELECTION_OUTLINE_OPACITY;ctx.fillRect(0,0,cellSize,cellSize)
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over'
    m.globalCompositeOperation='source-in';m.fillStyle=SELECTION_FILL;m.fillRect(0,0,cellSize,cellSize)
    ctx.globalAlpha=SELECTION_FILL_OPACITY;ctx.drawImage(mask,0,0);ctx.globalAlpha=1
  },[source,row,frame,cellSize])
  return <canvas ref={canvas} width={cellSize} height={cellSize} aria-label="Selected character highlight" className="pointer-events-none absolute inset-0 h-full w-full" style={{imageRendering:'pixelated'}}/>
}
