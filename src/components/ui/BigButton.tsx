import type { ReactNode } from 'react'

/**
 * A big, bold, flat rounded button. Semantic classes only (`big-button`,
 * variant modifiers) — GTM-15 owns the visual theme; this is the structural
 * button every screen shares.
 */
export function BigButton({
  children,
  onClick,
  disabled,
  variant = 'primary',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'ghost'
}) {
  return (
    <button
      type="button"
      className={`big-button big-button-${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
