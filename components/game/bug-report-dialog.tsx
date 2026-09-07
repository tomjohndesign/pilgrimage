"use client"

import { useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { BUG_REPORT_MESSAGE_LIMIT, BUG_REPORT_REPOSITORY, type BugReportDiagnostics } from "@/lib/bug-report"
import { HudButton } from "./hud-button"

/** The diagnostic snapshot stays fixed while the player reviews and submits it. */
export function BugReportDialog({ diagnostics, onClose }: {
  diagnostics: BugReportDiagnostics | null
  onClose: () => void
}) {
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [issueUrl, setIssueUrl] = useState("")
  const inFlight = useRef(false)

  function close() {
    if (inFlight.current) return
    setError("")
    setIssueUrl("")
    onClose()
  }

  async function submit() {
    if (!diagnostics || !message.trim() || inFlight.current) return
    inFlight.current = true
    setSending(true)
    setError("")
    try {
      const response = await fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ message, diagnostics }),
        signal: AbortSignal.timeout(25_000),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(typeof result.error === "string" ? result.error : "The report could not be sent. Please try again later.")
        return
      }
      const prefix = `https://github.com/${BUG_REPORT_REPOSITORY}/issues/`
      if (typeof result.url !== "string" || !result.url.startsWith(prefix) || !/^\d+$/.test(result.url.slice(prefix.length))) throw new Error("Invalid response")
      setIssueUrl(result.url)
      setMessage("")
    } catch {
      setError("Delivery could not be confirmed. Your report may have arrived; check the repository before retrying. Your message has been kept.")
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  return <Dialog open={diagnostics !== null} onOpenChange={open => { if (!open) close() }}>
    <DialogContent className="hud-report max-h-[85dvh] overflow-y-auto rounded-none border-rule bg-parchment text-ink sm:max-w-xl"
      showCloseButton={!sending}
      onKeyDown={event => event.stopPropagation()}
      onEscapeKeyDown={event => { if (sending) event.preventDefault() }}
      onInteractOutside={event => event.preventDefault()}
      onCloseAutoFocus={event => {
        event.preventDefault()
        document.getElementById("bug-report-button")?.focus()
      }}>
      <DialogTitle className="font-display text-lg">Report a bug</DialogTitle>
      <DialogDescription className="text-sm text-ink-light">
        Your message and the diagnostics below will be posted to the Pilgrimage GitHub repository through the game’s account.
        No player account, IP address, cookies, browsing history, or raw logs are attached.
        Reports may be public. Please leave names, contact details, and other personal information out of your message.
      </DialogDescription>
      {issueUrl ? <div role="status" className="space-y-4 text-sm">
        <p>Thank you. Your bug report was created.</p>
        <a href={issueUrl} target="_blank" rel="noopener noreferrer" className="text-gold underline">View issue on GitHub</a>
        <div><HudButton onClick={close}>Done</HudButton></div>
      </div> : <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void submit() }}>
        <div className="grid gap-2">
          <label htmlFor="bug-report-message" className="font-display text-xs">What went wrong?</label>
          <textarea id="bug-report-message" required maxLength={BUG_REPORT_MESSAGE_LIMIT} rows={5}
            value={message} disabled={sending} onChange={event => setMessage(event.target.value)}
            placeholder="What were you doing? What happened, and what did you expect? Include steps to reproduce the problem."
            className="w-full resize-y select-text border border-rule bg-parchment-dark p-3 text-base text-ink placeholder:text-ink-light focus:outline-gold" />
          <span className="text-xs text-ink-light">{message.length} / {BUG_REPORT_MESSAGE_LIMIT}</span>
        </div>
        <details className="min-w-0 border border-rule p-3 text-sm">
          <summary className="cursor-pointer text-gold">Review session diagnostics</summary>
          <p className="my-2 text-ink-light">Captured when this form opened. Includes game settings and state, browser family and major version, screen size category, and error counts. Up to 100 buildings; no full replay or error text.</p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all select-text text-xs" tabIndex={0}>{JSON.stringify(diagnostics, null, 2)}</pre>
        </details>
        {error && <div role="alert" className="text-sm text-red">
          <p>{error}</p>
          <a href={`https://github.com/${BUG_REPORT_REPOSITORY}/issues`} target="_blank" rel="noopener noreferrer" className="underline">Check existing reports</a>
        </div>}
        <div className="flex justify-end gap-3">
          <HudButton disabled={sending} onClick={close}>Cancel</HudButton>
          <HudButton type="submit" disabled={sending || !message.trim()}>{sending ? "Sending…" : "Submit bug report"}</HudButton>
        </div>
      </form>}
    </DialogContent>
  </Dialog>
}
