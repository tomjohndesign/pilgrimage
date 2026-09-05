"use client"

import { useEffect, useRef, useState } from "react"

/** Return opens the console without stealing Enter from existing HUD controls. */
export function CheatBar({ onBlasterPastor, onLastMarch }: {
  onBlasterPastor: () => void
  onLastMarch: () => void
}) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [message, setMessage] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  function close() {
    setOpen(false)
    setCode("")
    previousFocus.current?.focus()
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, button, a, [contenteditable='true'], [role='button']")) return
      if (event.key === "Enter") {
        event.preventDefault()
        previousFocus.current = document.activeElement as HTMLElement | null
        setMessage("")
        setOpen(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!message || open) return
    const timeout = window.setTimeout(() => setMessage(""), 6000)
    return () => window.clearTimeout(timeout)
  }, [message, open])

  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-6 z-30 mx-auto max-w-xl">
      <p role="status" aria-live="polite" className={message ? "mb-2 border border-gold/50 bg-[#14100a]/95 px-4 py-3 text-sm text-parchment shadow-lg" : "sr-only"}>
        {message}
      </p>
      {open && (
        <form
          aria-label="Cheat console"
          className="pointer-events-auto border border-gold bg-[#14100a]/95 p-4 shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === "Escape") {
              event.preventDefault()
              setMessage("")
              close()
            }
            if (event.key === "Enter" && (event.repeat || event.nativeEvent.isComposing)) event.preventDefault()
          }}
          onSubmit={(event) => {
            event.preventDefault()
            if (!code.trim()) {
              close()
            } else if (code.trim().toLowerCase() === "blasterpastor") {
              onBlasterPastor()
              setMessage("Blaster Pastor activated — the brothers will take rocket trips and return to the shrine!")
              close()
            } else if (code.trim().toLowerCase() === "thelastmarchoftheents") {
              onLastMarch()
              setMessage("The Ents are waking… About 1 in 100 trees will stroll, resting a minute between walks.")
              close()
            } else {
              setMessage("Unknown cheat code. Try again.")
              inputRef.current?.select()
            }
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <label htmlFor="cheat-code" className="font-display text-[10px] uppercase tracking-[3px] text-gold">Cheat code</label>
            <button type="button" onClick={() => { setMessage(""); close() }} className="text-xs text-parchment/70 hover:text-gold">Esc · Close</button>
          </div>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="text-gold">›</span>
            <input
              ref={inputRef}
              id="cheat-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Enter a cheat code…"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={80}
              className="min-w-0 flex-1 select-text border-b border-parchment/30 bg-transparent py-2 font-mono text-base text-parchment outline-none placeholder:text-parchment/40 focus:border-gold"
            />
            <button type="submit" className="border border-gold/60 px-3 py-2 font-display text-[10px] uppercase tracking-wider text-gold hover:bg-gold/10">Return ↵</button>
          </div>
        </form>
      )}
    </div>
  )
}
