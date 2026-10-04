// A small keycap shown on a button so the shortcut is learnable from the screen, not just the
// "?" help. Hidden on touch-sized screens, where there's no keyboard to use it with.
export default function Kbd({ children }: { children: string }) {
  return (
    <kbd className="ml-2 hidden rounded bg-black/25 px-1.5 py-0.5 font-mono text-[10px] font-normal tracking-normal opacity-80 md:inline-block" aria-hidden>
      {children}
    </kbd>
  )
}
