"use client"

import { ChromeButton, ChromeSelect } from "@/components/ui/chrome-controls"
import { useEffect, useRef, useState } from "react"
import { useAppearanceStore } from "@/lib/game/appearance-store"
import { APPEARANCE_GROUPS, NEUTRAL_ADJUSTMENT, appearanceWorldKey, defaultAppearance, parseAppearance,
  sameAppearanceSelection, selectionGroup, type AppearanceGroup, type ColorAdjustment } from "@/lib/game/appearance"
import { useCameraStore } from "@/lib/game/camera-store"
import type { GameMap } from "@/lib/game/map/types"
import { Section, Tuner } from "./property-controls"
import { HudButton } from "./hud-button"

const LABELS: Record<AppearanceGroup,string> = { trees: "Trees", buildings: "Buildings", characters: "People", wildlife: "Animals", scenery: "Scenery" }
const PRESETS = ["#556835", "#365229", "#4f7045", "#586347", "#77864b", "#66784e", "#85945e"]

function ColorField({ value, onChange }: { value: string; onChange: (value:string)=>void }) {
  const [text,setText] = useState(value)
  useEffect(()=>setText(value),[value])
  return <div className="flex items-center gap-2 py-1">
    <label htmlFor="grass-color" className="w-20 text-[13px] text-ink-light">Base color</label>
    <input id="grass-color" type="color" aria-label="Grass color" value={value} onChange={e=>onChange(e.target.value)} className="h-8 w-10 cursor-pointer border border-rule bg-transparent" />
    <input aria-label="Grass hex color" value={text} spellCheck={false} maxLength={7} onChange={e=>{
      setText(e.target.value); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value)
    }} onBlur={()=>setText(value)} className="w-24 border border-rule bg-parchment px-2 py-1 font-mono text-xs text-ink" />
  </div>
}

function Adjustment({ value, onChange, prefix }: {value: ColorAdjustment; onChange:(value:ColorAdjustment)=>void; prefix:string}) {
  return <>{(["saturation","brightness"] as const).map(key=><Tuner key={key} label={`${prefix} ${key}`} labelClassName="w-28" value={value[key]}
    display={`${Math.round(value[key]*100)}%`} min={0} max={2} step={.01} onChange={number=>onChange({...value,[key]:number})} />)}</>
}

/** Live art controls inside the shared World panel, with portable, validated edits. */
export function AppearancePanel({ map }: { map: GameMap }) {
  const {value,update,storageError} = useAppearanceStore()
  const selection=useCameraStore(s=>s.selection)
  const [target,setTarget]=useState<"assets"|AppearanceGroup>("assets")
  const [scope,setScope]=useState<"object"|"group">("object")
  const [open,setOpen]=useState<Record<string,boolean>>({Grass:true,Assets:true,"Selected object":true,"Appearance JSON":false})
  const [json,setJson]=useState("")
  const [message,setMessage]=useState("")
  const [error,setError]=useState("")
  const file=useRef<HTMLInputElement>(null)
  const world=appearanceWorldKey(map)
  useEffect(()=>{useAppearanceStore.getState().hydrate()},[])
  const section=(title:string)=>({title,open:!!open[title],onToggle:()=>setOpen(old=>({...old,[title]:!old[title]}))})
  const selectedGroup=selection?selectionGroup(selection):null
  const label=selection?.kind==="building"?map.buildings.find(b=>b.id===selection.id)?.label??`Building ${selection.id}`
    : selection?.kind==="relic"?"Relic":selection?`${selection.kind} ${selection.id}`:"Nothing selected"
  const selectedEdit=selection?value.objects.find(edit=>edit.world===world&&sameAppearanceSelection(edit.selection,selection)):undefined
  const selectedValue=scope==="group"&&selectedGroup?value.groups[selectedGroup]:selectedEdit??NEUTRAL_ADJUSTMENT
  function changeSelected(next:ColorAdjustment) {
    if(!selection||!selectedGroup)return
    if(scope==="group") {update({...value,groups:{...value.groups,[selectedGroup]:next}});return}
    const others=value.objects.filter(edit=>edit.world!==world||!sameAppearanceSelection(edit.selection,selection))
    if(others.length>=256) {setError("The file already contains 256 object edits. Reset an object before adding another.");return}
    update({...value,objects:[...others,{world,selection,label,...next}]})
  }
  const exportText=()=>JSON.stringify(value,null,2)
  function apply(text:string) {
    try {update(parseAppearance(text));setJson(text);setMessage("Appearance applied.");setError("")}
    catch {setError("This is not a valid appearance file. Use version 1 JSON exported by this panel; color must be a hex value and sliders must be between 0 and 2.")}
  }
  return <div aria-label="Appearance controls">
    <Section {...section("Grass")}>
      <ColorField value={value.grass.color} onChange={color=>update({...value,grass:{...value.grass,color}})} />
      <div className="flex gap-2 py-1">{PRESETS.map(color=><ChromeButton type="button" key={color} aria-label={`Use grass ${color}`} title={color}
        className="h-7 w-7 border border-rule" style={{background:color}} onClick={()=>update({...value,grass:{...value.grass,color}})} />)}</div>
      <Adjustment prefix="Grass" value={value.grass} onChange={next=>update({...value,grass:{...value.grass,...next}})} />
      <Tuner label="Ground shading" labelClassName="w-28" value={value.grass.shading} display={`${Math.round(value.grass.shading*100)}%`} min={0} max={2} step={.01}
        onChange={shading=>update({...value,grass:{...value.grass,shading}})} />
      <Tuner label="Canopy shading" labelClassName="w-28" value={value.grass.canopyShade} display={`${Math.round(value.grass.canopyShade*100)}%`} min={0} max={2} step={.01}
        onChange={canopyShade=>update({...value,grass:{...value.grass,canopyShade}})} />
      <p className="py-1 text-[11px] text-ink-light">Try the swatches, then adjust brightness. Ground shading controls the terrain tint; canopy shading controls the shadows beneath trees.</p>
      <HudButton onClick={()=>update({...value,grass:defaultAppearance().grass})}>Reset grass</HudButton>
    </Section>
    <Section {...section("Assets")}>
      <label className="flex items-center justify-between gap-2 text-xs text-ink-light">Apply to
        <ChromeSelect aria-label="Asset group" value={target} onChange={e=>setTarget(e.target.value as typeof target)} className="border border-rule bg-parchment p-1 text-ink">
          <option value="assets">All assets</option>{APPEARANCE_GROUPS.map(group=><option key={group} value={group}>{LABELS[group]}</option>)}
        </ChromeSelect>
      </label>
      <Adjustment prefix="Asset" value={target==="assets"?value.assets:value.groups[target]} onChange={next=>update(target==="assets"?{...value,assets:next}:{...value,groups:{...value.groups,[target]:next}})} />
      <HudButton onClick={()=>update(target==="assets"?{...value,assets:defaultAppearance().assets}:{...value,groups:{...value.groups,[target]:{...NEUTRAL_ADJUSTMENT}}})}>Reset asset group</HudButton>
    </Section>
    <Section {...section("Selected object")}>
      <p className="text-xs text-ink" aria-live="polite">{label}</p>
      {selection&&selectedGroup?<>
        <label className="flex items-center justify-between gap-2 text-xs text-ink-light">Apply to
          <ChromeSelect aria-label="Selected edit scope" value={scope} onChange={e=>setScope(e.target.value as typeof scope)} className="border border-rule bg-parchment p-1 text-ink">
            <option value="object">This object</option><option value="group">All {LABELS[selectedGroup].toLowerCase()}</option>
          </ChromeSelect>
        </label>
        <Adjustment prefix="Selected" value={selectedValue} onChange={changeSelected}/>
        <HudButton onClick={()=>{if(scope==="group")changeSelected({...NEUTRAL_ADJUSTMENT});else update({...value,objects:value.objects.filter(edit=>edit.world!==world||!sameAppearanceSelection(edit.selection,selection))})}}>Reset selected edits</HudButton>
      </>:<p className="text-[11px] text-ink-light">Click a tree, building, person, animal, pile, or relic on the map. The controls follow your selection.</p>}
      <p className="py-1 text-[11px] text-ink-light">Object edits are saved for this seed and map size. Asset and group adjustments combine with object edits.</p>
    </Section>
    <Section {...section("Appearance JSON")}>
      <div className="flex flex-wrap gap-2">
        <HudButton onClick={async()=>{const text=exportText();setJson(text);try{await navigator.clipboard.writeText(text);setMessage("JSON copied. Paste it into our chat.")}catch{setMessage("Select and copy the JSON below.")}}}>Copy JSON</HudButton>
        <HudButton onClick={()=>{const text=exportText();setJson(text);const url=URL.createObjectURL(new Blob([text],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=`pilgrimage-appearance-${map.seed??0}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}>Download JSON</HudButton>
        <HudButton onClick={()=>file.current?.click()}>Import file</HudButton>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" aria-label="Import appearance file" onChange={async e=>{const selected=e.target.files?.[0];if(selected){try{apply(await selected.text())}catch{setError("The file could not be read.")}}e.target.value=""}}/>
      </div>
      <textarea aria-label="Appearance JSON" value={json} onChange={e=>setJson(e.target.value)} placeholder="Paste exported appearance JSON here" rows={7} spellCheck={false}
        className="mt-2 w-full select-text border border-rule bg-parchment p-2 font-mono text-[10px] text-ink" />
      <HudButton onClick={()=>apply(json)}>Apply JSON</HudButton>
      <HudButton onClick={()=>{setJson(exportText());update(defaultAppearance());setMessage("All appearance edits reset. Your previous values remain in the JSON box.")}}>Reset all appearance</HudButton>
      <p role="status" className="text-[11px] text-ink-light">{message}</p>
    </Section>
    {(error||storageError)&&<p role="alert" className="py-2 text-xs text-red">{error||storageError}</p>}
  </div>
}
