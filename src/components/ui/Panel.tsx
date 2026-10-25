import type { ReactNode } from 'react'

/**
 * A titled container with the rounded border/background used across the app.
 * `title` renders as a small uppercase heading in a header row; `className`
 * is appended so screens can size it (e.g. `flex-1`).
 */
export function Panel({
  title,
  children,
  className,
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel${className ? ` ${className}` : ''}`}>
      {title !== undefined && (
        <header className="panel-header">
          <h2>{title}</h2>
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  )
}
