
import { ChromeButton } from "@/components/ui/chrome-controls"
import type { ComponentProps } from "react"

/** Shared secondary button shared by the HUD panels and report dialog. */
export function HudButton({ children, className = "", type = "button", ...props }: ComponentProps<"button">) {
  return <ChromeButton type={type} {...props}
    className={`hud-action ${className}`}>
    {children}
  </ChromeButton>
}
