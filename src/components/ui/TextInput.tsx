import type { InputHTMLAttributes } from 'react'

// The standard text-field chrome (rounded-lg, arena border, hardwood focus ring) repeated
// across every form in the app with minor accidental differences in padding/text size. `size`
// is a real variant (not a className override) — this repo has no Tailwind class-merge utility,
// so two conflicting padding utilities in one string would race on generated-CSS order instead
// of predictably picking the "later" one.
const SIZE_CLASSES = {
  sm: 'px-3 py-1.5',
  md: 'px-3 py-2',
} as const

export default function TextInput({
  inputSize = 'md',
  className = '',
  ...rest
}: {
  /** Named to avoid colliding with the native HTML `size` attribute (visible character width). */
  inputSize?: keyof typeof SIZE_CLASSES
  className?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`rounded-lg border border-arena-600 bg-arena-800 text-slate-100 outline-none focus:border-hardwood-500 ${SIZE_CLASSES[inputSize]} ${className}`}
      {...rest}
    />
  )
}
