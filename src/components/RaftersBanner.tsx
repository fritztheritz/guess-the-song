// A championship banner hung from the rafters: two strings, a swallow-tailed pennant in the winning team's
// colour, and a slow sway. Absolutely positioned to hang from the top of its (relative) parent.
export default function RaftersBanner({ team, color, season, detail, className = '' }: { team: string; color: string; season: string; detail: string; className?: string }) {
  return (
    <figure className={`pointer-events-none absolute right-3 z-10 w-32 origin-top sm:right-8 sm:w-40 ${className}`} aria-label={`${team}, ${season} champions`}>
      <div className="rafters-sway origin-top">
        <div className="relative mx-auto h-10 w-[78%]" aria-hidden>
          <span className="absolute bottom-0 left-0 top-0 w-px bg-slate-500" style={{ transform: 'rotate(7deg)', transformOrigin: 'bottom' }} />
          <span className="absolute bottom-0 right-0 top-0 w-px bg-slate-500" style={{ transform: 'rotate(-7deg)', transformOrigin: 'bottom' }} />
          <span className="absolute -top-1 left-[-3px] size-1.5 rounded-full bg-slate-400" />
          <span className="absolute -top-1 right-[-3px] size-1.5 rounded-full bg-slate-400" />
        </div>
        <div className="relative shadow-[5px_5px_0_0_rgb(0_0_0/0.45)]" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 90%, 50% 100%, 0 90%)', background: color }}>
          <div className="m-1.5 flex min-h-48 flex-col items-center justify-start gap-1 border-2 border-dashed border-[#050a1c]/55 px-2 pb-9 pt-3 text-center text-[#050a1c]">
            <span className="font-display text-xs tracking-[0.3em]">CHAMPIONS</span>
            <span className="font-display text-2xl leading-[0.95] tracking-wide [overflow-wrap:anywhere]">{team}</span>
            <span aria-hidden className="my-0.5 h-0.5 w-8 bg-[#050a1c]/60" />
            <span className="font-display text-sm leading-tight tracking-wider">{season}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">{detail}</span>
          </div>
        </div>
      </div>
    </figure>
  )
}
