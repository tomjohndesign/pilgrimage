interface TwoColumnGridProps {
  leftTitle: string
  leftItems: string[]
  rightTitle: string
  rightItems: string[]
}

export function TwoColumnGrid({
  leftTitle,
  leftItems,
  rightTitle,
  rightItems,
}: TwoColumnGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4">
      <div>
        <h3 className="font-display text-[13px] font-semibold tracking-[1px] text-ink mb-2">
          {leftTitle}
        </h3>
        <ul className="list-none p-0 m-0">
          {leftItems.map((item, index) => (
            <li
              key={index}
              className="text-[15px] leading-relaxed text-ink-light py-1 pl-4 relative before:content-['✦'] before:absolute before:left-0 before:text-[8px] before:text-gold before:top-[7px]"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-display text-[13px] font-semibold tracking-[1px] text-ink mb-2">
          {rightTitle}
        </h3>
        <ul className="list-none p-0 m-0">
          {rightItems.map((item, index) => (
            <li
              key={index}
              className="text-[15px] leading-relaxed text-ink-light py-1 pl-4 relative before:content-['✦'] before:absolute before:left-0 before:text-[8px] before:text-gold before:top-[7px]"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
