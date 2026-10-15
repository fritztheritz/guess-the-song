/** The reveal moment: a hardwood flash, a slanted "BUZZER BEATER" bar that swoops across like a broadcast
 *  graphic, and a tilted sticker that stays behind. Render inside a `relative` container. */
export default function BuzzerBeaterBanner() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-30 bg-hardwood-500/20 animate-buzzer-flash" />
      <div className="pointer-events-none absolute inset-x-0 top-[18%] z-20 overflow-hidden" aria-hidden>
        <div className="animate-banner-swoop mx-[-6%] bg-hardwood-500 py-3 text-center font-display text-5xl tracking-[0.2em] text-white shadow-xl sm:text-7xl">
          BUZZER BEATER
        </div>
      </div>
      <div className="relative z-10 -rotate-2 sticker text-3xl tracking-widest sm:text-4xl">Buzzer beater</div>
    </>
  )
}
