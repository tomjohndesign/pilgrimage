"use client"

import { useEffect, useRef, useState } from "react"
import { Music2, Slash } from "lucide-react"

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
  const raw = window.localStorage.getItem(MUSIC_STORAGE_KEY)
  return raw === null ? null : raw === "on"
}

function saveMusicEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(MUSIC_STORAGE_KEY, enabled ? "on" : "off")
}

/**
 * The toggle button takes its look from wherever it is mounted (the HUD header
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
  // Only the first play jumps; pausing and resuming picks up where it left off.
  const seekedRef = useRef(false)
  const seekTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setEnabled(loadMusicEnabled() ?? true)
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
              event.target.setVolume(VOLUME)
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
    if (enabled) {
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
        aria-label={`Music ${enabled ? "on" : "off"}`}
        title={`Music ${enabled ? "on" : "off"}`}
        className={className}
      >
        <span className="relative inline-flex" aria-hidden="true">
          <Music2 size={16} />
          {!enabled && <Slash size={16} className="absolute inset-0" />}
        </span>
        {!compact && ` Music ${enabled ? "On" : "Off"}`}
      </button>
    </>
  )
}
