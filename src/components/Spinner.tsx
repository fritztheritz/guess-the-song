// One branded spinner shared by every loading state — previously only Callback.tsx had this
// ring, everywhere else just showed plain "Loading…" text.
export default function Spinner({ className = 'h-10 w-10' }: { className?: string }) {
  return <div className={`animate-spin rounded-full border-4 border-arena-600 border-t-hardwood-500 ${className}`} />
}
