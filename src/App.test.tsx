import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the title screen with a link to free mode', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /gitmatic/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /free mode/i })).toBeInTheDocument()
  })
})
