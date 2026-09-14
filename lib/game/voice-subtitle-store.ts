"use client"

import { create } from "zustand"
import type { VoiceLine } from "./voice-lines"

/** The line clears itself so a subtitle never outlives the audio by much. */
const SUBTITLE_MS = 3500

interface VoiceSubtitleState {
  line: VoiceLine | null
  tongue: string
  travelerId: number | null
  show: (line: VoiceLine, tongue: string, travelerId: number) => void
  clear: () => void
}

let timer: ReturnType<typeof setTimeout> | undefined

export const useVoiceSubtitleStore = create<VoiceSubtitleState>()((set) => ({
  line: null,
  tongue: "",
  travelerId: null,
  show: (line, tongue, travelerId) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => set({ line: null, tongue: "", travelerId: null }), SUBTITLE_MS)
    set({ line, tongue, travelerId })
  },
  clear: () => {
    if (timer) clearTimeout(timer)
    set({ line: null, tongue: "", travelerId: null })
  },
}))
