"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Placeholder background music: a long medieval lute recording streamed via the
 * YouTube IFrame API from an invisible player. Meant to be replaced by a real
 * audio pipeline later — swap VIDEO_ID for a different track, or swap this
 * whole component out.
 */

const VIDEO_ID = "5F5dgg1eeGE"
/** 0–100. Quiet enough to sit under the game rather than in front of it. */
const VOLUME = 20
const MUSIC_STORAGE_KEY = "pilgrimage.music"
/** Used only if the player hasn't reported a duration yet; the real track is ~10h. */
const FALLBACK_DURATION_SECONDS = 9 * 60 * 60
/** Never drop in this close to the end, so the random start isn't over in seconds. */
const TAIL_SECONDS = 10 * 60

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
          events: { onReady: (event: { target: YouTubePlayer }) => void }
        },
      ) => YouTubePlayer
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

/** Null when nothing is saved or outside a browser. Call from effects, not render. */
function loadMusicEnabled(): boolean | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(MUSIC_STORAGE_KEY)
  return raw === null ? null : raw === "on"
}

function saveMusicEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(MUSIC_STORAGE_KEY, enabled ? "on" : "off")
}

export function MusicPlayer() {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const [ready, setReady] = useState(false)
  // Browsers refuse un-gestured audio, so playback waits for any interaction.
  const [interacted, setInteracted] = useState(false)
  const [enabled, setEnabled] = useState(true)
  // Only the first play jumps; pausing and resuming picks up where it left off.
  const seekedRef = useRef(false)

  useEffect(() => {
    setEnabled(loadMusicEnabled() ?? true)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false

    const create = () => {
      if (cancelled || !window.YT) return
      // The API replaces the host element with the player iframe in place.
      playerRef.current = new window.YT.Player(host, {
        videoId: VIDEO_ID,
        // Looping a single video requires naming it as its own playlist.
        playerVars: { controls: 0, disablekb: 1, loop: 1, playlist: VIDEO_ID },
        events: {
          onReady: (event) => {
            event.target.setVolume(VOLUME)
            setReady(true)
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
    if (enabled) {
      if (!seekedRef.current) {
        seekedRef.current = true
        // Ten hours of lute is a lot to always hear the first minute of, so
        // each session drops in somewhere else in the recording.
        const duration = player.getDuration() || FALLBACK_DURATION_SECONDS
        const span = Math.max(0, duration - TAIL_SECONDS)
        player.seekTo(Math.random() * span, true)
      }
      player.playVideo()
    } else player.pauseVideo()
  }, [ready, interacted, enabled])

  // The game falls silent with the tab, like it would if it paused.
  useEffect(() => {
    const onVisibilityChange = () => {
      const player = playerRef.current
      if (!ready || !interacted || !player) return
      if (document.hidden) player.pauseVideo()
      else if (enabled) player.playVideo()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [ready, interacted, enabled])

  const toggle = () => {
    const next = !enabled
    setEnabled(next)
    saveMusicEnabled(next)
  }

  return (
    <>
      {/* Kept 1px and transparent rather than display:none so playback isn't suppressed. */}
      <div aria-hidden className="pointer-events-none fixed bottom-0 left-0 h-px w-px overflow-hidden opacity-0">
        <div ref={hostRef} />
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={enabled}
        className="pointer-events-auto absolute bottom-5 left-1/2 z-10 -translate-x-1/2 border border-rule bg-parchment/95 px-4 py-2 font-display text-[10px] uppercase tracking-[2px] text-ink shadow-[0_2px_16px_rgba(0,0,0,0.6)] transition-colors hover:border-gold hover:text-red"
      >
        ♪ Music {enabled ? "On" : "Off"}
      </button>
    </>
  )
}
