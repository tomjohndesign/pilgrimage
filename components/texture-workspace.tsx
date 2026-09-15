"use client"

import { useEffect } from "react"
import { AssetEditorFrame, AssetEditorContent, AssetEditorPanels, AssetEditorSection, type AssetEditorNavigation } from "./asset-editor-frame"
import { TextureGallery } from "./texture-gallery"
import { CharacterTextures } from "./character-textures"
import { EnvironmentGallery } from "./environment-lab/environment-gallery"
import { WaterSourceGallery } from "./environment-lab/water-source-gallery"

/** Texture catalogue using the shared workspace sections.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/9YC-0 — Textures
 */
export function TextureWorkspace({ mode, onModeChange, active = true }: AssetEditorNavigation & { active?: boolean }) {
  useEffect(() => { if (active && window.location.hash === "#trees") { window.history.replaceState(null, "", window.location.href.split("#")[0]); onModeChange("trees") } }, [active, onModeChange])
  return <AssetEditorFrame mode={mode} onModeChange={onModeChange} label="Texture catalogue" version="" status="Game assets" detail="Textures and sprite sheets">
    <AssetEditorContent><div className="workspace-catalogue">
      <AssetEditorPanels>
        <AssetEditorSection title="Materials">{active && <TextureGallery />}</AssetEditorSection>
        <AssetEditorSection title="Characters">{active && <CharacterTextures />}</AssetEditorSection>
        <AssetEditorSection title="Environment">{active && <EnvironmentGallery />}</AssetEditorSection>
        <AssetEditorSection title="Water">{active && <WaterSourceGallery />}</AssetEditorSection>
      </AssetEditorPanels>
    </div></AssetEditorContent>
  </AssetEditorFrame>
}
