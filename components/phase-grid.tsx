const phases = [
  {
    label: "Early Game",
    name: "Waypoint",
    description: "A place to rest. People stop because it's convenient, not because they seek you out.",
  },
  {
    label: "Mid Game",
    name: "Respite",
    description: "Word has spread. Merchants set up. There's reason to linger. You're a known quantity.",
  },
  {
    label: "Late Game",
    name: "Destination",
    description: "You are the pilgrimage. Travelers come specifically for your relic and your city.",
  },
]

export function PhaseGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-5">
      {phases.map((phase) => (
        <div
          key={phase.name}
          className="bg-parchment-dark border border-rule p-4 text-center"
        >
          <div className="font-display text-[10px] tracking-[2px] text-gold uppercase mb-1.5">
            {phase.label}
          </div>
          <div className="font-display text-sm text-red mb-2">
            {phase.name}
          </div>
          <p className="text-sm leading-snug text-ink-light m-0">
            {phase.description}
          </p>
        </div>
      ))}
    </div>
  )
}
