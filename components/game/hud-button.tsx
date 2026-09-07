import type { ButtonHTMLAttributes } from "react"

/** Compact parchment button shared by the HUD panels and report dialog. */
export function HudButton({ children, className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} {...props}
    className={`pointer-events-auto border border-rule bg-parchment-dark px-2 py-1 font-display text-[9px] uppercase tracking-[2px] text-ink transition-colors hover:border-gold hover:text-red disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>
    {children}
  </button>
}
