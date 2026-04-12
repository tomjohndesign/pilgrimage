const steps = [
  "Pilgrims travel an existing path through the map. Your site sits on or near that path.",
  "You build infrastructure — inns, chapels, marketplaces, guard posts — to attract and serve them.",
  "Pilgrims stop, stay, spend money, and patronize your relic. You collect taxes and patronage.",
  "Some pilgrims choose to settle as residents if job slots and housing are available.",
  "You reinvest gold to expand, increase renown, and draw more and better pilgrims.",
  "Repeat at increasing scale until you are the destination, not just a stop along the way.",
]

export function CoreLoop() {
  return (
    <ol className="list-none m-0 my-4 p-0">
      {steps.map((step, index) => (
        <li
          key={index}
          className="flex gap-4 items-start mb-3 text-base leading-relaxed text-ink-light"
        >
          <span className="font-display text-[11px] text-gold bg-parchment-dark border border-rule w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
            {index + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  )
}
