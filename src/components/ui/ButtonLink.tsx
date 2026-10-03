import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SIZE_CLASSES, VARIANT_CLASSES, type ButtonSize, type ButtonVariant } from './button-styles'

// A router link that looks exactly like <Button> — for navigation that should read as a call
// to action, so link-buttons and real buttons can't drift apart.
export default function ButtonLink({
  to,
  variant = 'outline',
  size = 'md',
  className = '',
  children,
}: {
  to: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      className={`inline-block rounded-full text-center font-semibold transition-colors ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
    >
      {children}
    </Link>
  )
}
