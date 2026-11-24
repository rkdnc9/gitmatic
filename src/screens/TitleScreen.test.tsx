import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import TitleScreen from '../screens/TitleScreen'

const mount = () =>
  render(
    <MemoryRouter>
      <TitleScreen />
    </MemoryRouter>,
  )

describe('TitleScreen', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the three buttons with Guided lessons disabled', () => {
    mount()
    expect(screen.getByRole('link', { name: /free mode/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guided lessons/i })).toBeDisabled()
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })

  it('shows the gitmatic wordmark', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'gitmatic' })).toBeInTheDocument()
  })

  it('Free mode link is enabled', async () => {
    mount()
    const free = screen.getByRole('link', { name: /free mode/i })
    expect(free).not.toBeDisabled()
    await userEvent.hover(free)
  })
})