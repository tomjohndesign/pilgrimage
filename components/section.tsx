interface SectionProps {
  number: string
  title: string
  children: React.ReactNode
}

export function Section({ number, title, children }: SectionProps) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-sm md:text-base font-semibold tracking-[3px] uppercase text-red mb-4 pb-2 border-b border-rule flex items-center gap-2.5">
        <span className="text-[11px] text-gold font-normal">{number}.</span>
        {title}
      </h2>
      {children}
    </section>
  )
}
