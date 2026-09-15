"use client"

import { ChromeButton } from "@/components/ui/chrome-controls"
import { useEffect, useRef, useState } from "react"
import { Volume2, VolumeX } from "lucide-react"
import { Popover } from "@base-ui/react/popover"
import { Switch } from "@/components/ui/switch"
import { Tuner } from "./property-controls"
import { useCharacterAssetStore } from "@/lib/game/character-asset-store"
import { DEFAULT_CHARACTER_SOUNDS, useCharacterSoundStore } from "@/lib/game/character-sound-store"

/**
 * Placeholder background music: a long medieval lute recording streamed via the
 * YouTube IFrame API from an invisible player. Meant to be replaced by a real
 * audio pipeline later — swap VIDEO_ID for a different track, or swap this
 * whole component out.
 */

const VIDEO_ID = "5F5dgg1eeGE"
/** 0–100. Quiet enough to sit under the game rather than in front of it. */
const VOLUME = 10
const MUSIC_STORAGE_KEY = "pilgrimage.music"
const MUSIC_VOLUME_KEY = "pilgrimage.music-volume"
/** Retry until metadata supplies the actual video length. */
const DURATION_POLL_MS = 200

interface YouTubePlayer {
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getDuration: () => number
  setVolume: (volume: number) => void
  destroy: () => void
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string
          playerVars: Record<string, string | number>
          events: {
            onReady: (event: { target: YouTubePlayer }) => void
            onStateChange: (event: { target: YouTubePlayer; data: number }) => void
          }
        },
      ) => YouTubePlayer
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

/** Null when nothing is saved or outside a browser. Call from effects, not render. */
function loadMusicEnabled(): boolean | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(MUSIC_STORAGE_KEY)
    return raw === null ? null : raw === "on"
  } catch { return null }
}

function saveMusicEnabled(enabled: boolean): void {
  try { window.localStorage.setItem(MUSIC_STORAGE_KEY, enabled ? "on" : "off") } catch { /* Storage may be unavailable. */ }
}

/** A shared tuner with a per-channel mute that remembers the previous level. */
function SoundLevel({ label, value, fallback, onChange }: { label: string; value: number; fallback: number; onChange: (value: number) => void }) {
  const lastVolume = useRef(value || fallback)
  useEffect(() => { if (value > 0) lastVolume.current = value }, [value])
  return <div className="hud-sound-row">
    <Tuner label={label} value={value} display={`${Math.round(value * 100)}%`} min={0} max={1} step={.01} onChange={onChange} />
    <ChromeButton type="button" className="chrome-icon-button" aria-label={`${value > 0 ? "Mute" : "Unmute"} ${label.toLowerCase()}`}
      aria-pressed={value === 0} onClick={() => onChange(value > 0 ? 0 : lastVolume.current)}>
      {value > 0 ? <Volume2 size={16} /> : <VolumeX size={16} />}
    </ChromeButton>
  </div>
}

/**
 * The sound menu takes its look from wherever it is mounted (the HUD header
 * passes its button style); the hidden player host is fixed off-screen.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/1SK-0
 */
export function MusicPlayer({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const [ready, setReady] = useState(false)
  // Browsers refuse un-gestured audio, so playback waits for any interaction.
  const [interacted, setInteracted] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [volume, setVolume] = useState(VOLUME / 100)
  const muted = useCharacterAssetStore(state => state.muted)
  const setMuted = useCharacterAssetStore(state => state.setMuted)
  const mixer = useCharacterSoundStore(state => state.document.mixer)
  const patchMixer = useCharacterSoundStore(state => state.patchMixer)
  const audible = enabled && !muted && volume > 0
  const volumeRef = useRef(0)
  volumeRef.current = audible ? volume * 100 : 0
  // Only the first play jumps; pausing and resuming picks up where it left off.
  const seekedRef = useRef(false)
  const seekTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setEnabled(loadMusicEnabled() ?? true)
    try {
      const saved = window.localStorage.getItem(MUSIC_VOLUME_KEY)
      const level = Number(saved)
      if (saved !== null && Number.isFinite(level) && level >= 0 && level <= 1) setVolume(level)
    } catch { /* Keep the default when storage is unavailable. */ }
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false

    const create = () => {
      if (cancelled || !window.YT) return
      seekedRef.current = false
      // The API replaces the host element with the player iframe in place.
      playerRef.current = new window.YT.Player(host, {
        videoId: VIDEO_ID,
        // Looping a single video requires naming it as its own playlist.
        playerVars: {
          controls: 0,
          disablekb: 1,
          loop: 1,
          playlist: VIDEO_ID,
          // Keep background music inline on mobile; next.config.mjs also
          // disables picture-in-picture through the page's permissions policy.
          playsinline: 1,
          fs: 0,
        },
        events: {
          onReady: (event) => {
            if (cancelled) return
            // Keep the opening silent while metadata loads and the seek buffers.
            event.target.setVolume(0)
            setReady(true)
          },
          onStateChange: (event) => {
            if (!cancelled && event.data === 1 && seekedRef.current) {
              event.target.setVolume(volumeRef.current)
            }
          },
        },
      })
    }

    if (window.YT?.Player) {
      create()
    } else {
      const previous = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        previous?.()
        create()
      }
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement("script")
        script.src = "https://www.youtube.com/iframe_api"
        document.head.append(script)
      }
    }

    return () => {
      cancelled = true
      if (seekTimerRef.current !== null) window.clearTimeout(seekTimerRef.current)
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (interacted) return
    const mark = () => setInteracted(true)
    window.addEventListener("pointerdown", mark)
    window.addEventListener("keydown", mark)
    return () => {
      window.removeEventListener("pointerdown", mark)
      window.removeEventListener("keydown", mark)
    }
  }, [interacted])

  useEffect(() => {
    const player = playerRef.current
    if (!ready || !interacted || !player) return
    if (audible) {
      if (!document.hidden) player.playVideo()
      if (!seekedRef.current) {
        // Ten hours of lute is a lot to always hear the first minute of, so
        // each session drops in at an entirely random point in the recording.
        // The player only reports a duration once it has the video's metadata,
        // and seeking past the end just bounces back to the start, so wait for
        // a real length instead of jumping against a guessed one.
        const jump = () => {
          seekTimerRef.current = null
          const current = playerRef.current
          if (!current) return
          const duration = current.getDuration()
          if (document.hidden || !Number.isFinite(duration) || duration <= 0) {
            seekTimerRef.current = window.setTimeout(jump, DURATION_POLL_MS)
            return
          }
          seekedRef.current = true
          current.seekTo(Math.random() * duration, true)
        }
        jump()
      }
    } else player.pauseVideo()
    return () => {
      if (seekTimerRef.current !== null) {
        window.clearTimeout(seekTimerRef.current)
        seekTimerRef.current = null
      }
    }
  }, [ready, interacted, audible])

  // The game falls silent with the tab, like it would if it paused.
  useEffect(() => {
    const onVisibilityChange = () => {
      const player = playerRef.current
      if (!ready || !interacted || !player) return
      if (document.hidden) player.pauseVideo()
      else if (audible) player.playVideo()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [ready, interacted, audible])

  useEffect(() => {
    if (ready && seekedRef.current) playerRef.current?.setVolume(audible ? volume * 100 : 0)
  }, [ready, audible, volume])

  const changeMusic = (level: number) => {
    setVolume(level)
    setEnabled(level > 0)
    saveMusicEnabled(level > 0)
    try { window.localStorage.setItem(MUSIC_VOLUME_KEY, String(level)) } catch { /* Session-only preference. */ }
  }

  return (
    <>
      {/* Kept 1px and transparent rather than display:none so playback isn't suppressed. */}
      <div aria-hidden className="pointer-events-none fixed bottom-0 left-0 h-px w-px overflow-hidden opacity-0">
        <div ref={hostRef} />
      </div>
      <Popover.Root>
        <Popover.Trigger render={<ChromeButton type="button" aria-label="Sound settings" className={className} />}>
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          {!compact && " Sound"}
        </Popover.Trigger>
        <Popover.Portal keepMounted><Popover.Positioner side="bottom" align="end" sideOffset={12} collisionPadding={12} className="chrome-popup-positioner">
          <Popover.Popup className="hud-sound-menu">
            <div className="hud-sound-heading"><Popover.Title>Sound</Popover.Title>
              <Switch aria-label="All sounds" checked={!muted} onCheckedChange={on => setMuted(!on)} />
            </div>
            <SoundLevel label="Music" value={enabled ? volume : 0} fallback={VOLUME / 100} onChange={changeMusic} />
            <SoundLevel label="Selection voices" value={mixer.selection} fallback={DEFAULT_CHARACTER_SOUNDS.mixer.selection} onChange={selection => patchMixer({ selection })} />
            <SoundLevel label="Footsteps & effects" value={mixer.foley} fallback={DEFAULT_CHARACTER_SOUNDS.mixer.foley} onChange={foley => patchMixer({ foley })} />
            <SoundLevel label="Environment & wildlife" value={mixer.ambience} fallback={DEFAULT_CHARACTER_SOUNDS.mixer.ambience} onChange={ambience => patchMixer({ ambience })} />
          </Popover.Popup>
        </Popover.Positioner></Popover.Portal>
      </Popover.Root>
    </>
  )
}
