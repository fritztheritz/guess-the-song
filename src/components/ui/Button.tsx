import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { SIZE_CLASSES, VARIANT_CLASSES, type ButtonSize, type ButtonVariant } from './button-styles'

export type { ButtonSize, ButtonVariant } from './button-styles'

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className = '',
  children,
  ...rest
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
