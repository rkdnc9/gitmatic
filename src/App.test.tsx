import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the title screen with links to free mode and settings', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: /free mode/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
    // Guided lessons exists but is disabled (milestone 2).
    const guided = screen.getByRole('button', { name: /guided lessons/i })
    expect(guided).toBeDisabled()
  })
})