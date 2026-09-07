"use client"

import { useEffect, useRef } from "react"

/** Count failures without storing messages, stacks, file names or rejection values. */
export function useBugReportRuntime() {
  const runtime = useRef({ started: 0, errors: 0, rejections: 0, webglContextLosses: 0 })
  useEffect(() => {
    runtime.current.started = performance.now()
    const error = () => { runtime.current.errors++ }
    const rejection = () => { runtime.current.rejections++ }
    const contextLost = () => { runtime.current.webglContextLosses++ }
    window.addEventListener("error", error)
    window.addEventListener("unhandledrejection", rejection)
    document.addEventListener("webglcontextlost", contextLost, true)
    return () => {
      window.removeEventListener("error", error)
      window.removeEventListener("unhandledrejection", rejection)
      document.removeEventListener("webglcontextlost", contextLost, true)
    }
  }, [])
  return () => ({
    sessionMinutes: Math.max(0, Math.round((performance.now() - runtime.current.started) / 60_000)),
    runtimeErrors: { errors: runtime.current.errors, rejections: runtime.current.rejections,
      webglContextLosses: runtime.current.webglContextLosses },
  })
}
