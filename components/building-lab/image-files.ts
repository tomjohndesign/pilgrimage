import { buildingGuideSvg, BUILDING_VIEWS } from "@/lib/game/building-art/projection"
import { registrationTransforms, type Registrations } from "@/lib/game/building-art/registration"
import type { BuildingRecipe } from "@/lib/game/building-art/style"

async function readImage(url: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = url
  await image.decode()
  return image
}

/** Rasterize our code-native registration diagram; no generated art is altered. */
export async function guideFile(recipe: BuildingRecipe): Promise<File> {
  const url = URL.createObjectURL(new Blob([buildingGuideSvg(recipe)], { type: "image/svg+xml" }))
  try {
    const image = await readImage(url)
    const canvas = document.createElement("canvas"); canvas.width=2048; canvas.height=2048
    const context = canvas.getContext("2d"); if (!context) throw new Error("Could not prepare the isometric guide.")
    context.drawImage(image,0,0)
    const blob = await new Promise<Blob>((resolve,reject)=>canvas.toBlob((blob)=>blob ? resolve(blob) : reject(new Error("Could not prepare the guide.")),"image/png"))
    return new File([blob],"isometric-four-view-guide.png",{type:"image/png"})
  } finally { URL.revokeObjectURL(url) }
}

/** Export one exact atlas cell, preserving its full canvas and alpha/anchor. */
export async function atlasViewPng(url: string, view: number): Promise<string> {
  const image = await readImage(url)
  if (image.naturalWidth !== image.naturalHeight || image.naturalWidth % 2 !== 0) throw new Error("A four-view atlas must be square with even dimensions.")
  const size = image.naturalWidth/2, cell=BUILDING_VIEWS[view]
  const canvas=document.createElement("canvas");canvas.width=size;canvas.height=size
  const context=canvas.getContext("2d");if(!context)throw new Error("Could not export this view.")
  context.drawImage(image,cell.column*size,cell.row*size,size,size,0,0,size,size)
  return canvas.toDataURL("image/png")
}

export async function validateAtlas(url: string): Promise<void> {
  const image=await readImage(url)
  if(image.naturalWidth!==image.naturalHeight || image.naturalWidth%2!==0 || image.naturalWidth<512) throw new Error("Use a square 2×2 four-view atlas with even dimensions, at least 512px wide.")
}

/** Authoring export: register all four views onto the same game footprint. */
export async function registeredAtlasPng(url: string, recipe: BuildingRecipe, registrations: Registrations, preview = false): Promise<string> {
  if(registrations.length !== 4 || !preview && registrations.some(r=>!r?.[3])) throw new Error("Fit the ground corners and eave in all four views before exporting sprites.")
  const image=await readImage(url),size=image.naturalWidth/2
  const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight
  const context=canvas.getContext("2d");if(!context)throw new Error("Could not export the registered atlas.")
  for(const view of BUILDING_VIEWS) {
    context.save();context.translate(view.column*size,view.row*size)
    context.beginPath();context.rect(0,0,size,size);context.clip()
    if (!registrations[view.id]) {
      context.drawImage(image,view.column*size,view.row*size,size,size,0,0,size,size)
      context.restore()
      continue
    }
    const fit=registrationTransforms(recipe,view.id,registrations[view.id]!)
    if(recipe.output==="concept") {context.fillStyle="#f3eddf";context.fillRect(0,0,size,size)}
    // Integer pixel boundaries partition the raster without an antialiased gap.
    const split = Math.round(fit.split * size)
    for(const face of ["left","right"] as const) {
      context.save();context.beginPath();context.rect(face==="left"?0:split,0,face==="left"?split:size-split,size);context.clip()
      const m=fit[face];context.transform(m[0],m[1],0,m[3],m[4]*size,m[5]*size)
      context.drawImage(image,view.column*size,view.row*size,size,size,0,0,size,size)
      context.restore()
    }
    context.restore()
  }
  return canvas.toDataURL("image/png")
}
