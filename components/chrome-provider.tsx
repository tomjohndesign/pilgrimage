"use client"

import { Tooltip } from "@base-ui/react/tooltip"
import { ThemeProvider, useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { ChromeButton } from "./ui/chrome-controls"
import { useEffect, type ReactNode } from "react"

/** Shared dark/light surfaces and Base UI tooltip timing.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/CTF-0
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/DFN-0
 */
export function ChromeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>()
    const scrolling = (event: Event) => {
      const element = event.target instanceof HTMLElement ? event.target : document.documentElement
      element.dataset.scrolling = "true"
      clearTimeout(timers.get(element))
      timers.set(element, setTimeout(() => { delete element.dataset.scrolling; timers.delete(element) }, 700))
    }
    document.addEventListener("scroll", scrolling, { capture: true, passive: true })
    return () => { document.removeEventListener("scroll", scrolling, true); for (const [element, timer] of timers) { clearTimeout(timer); delete element.dataset.scrolling } }
  }, [])
  return <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false} disableTransitionOnChange><Tooltip.Provider delay={250}>{children}</Tooltip.Provider></ThemeProvider>
}
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return <ChromeButton className="chrome-icon-button" aria-label="Toggle light mode" title="Toggle light / dark mode" onClick={() => setTheme(theme === "light" ? "dark" : "light")}><Sun size={15} className="theme-light-icon" /><Moon size={15} className="theme-dark-icon" /></ChromeButton>
}
