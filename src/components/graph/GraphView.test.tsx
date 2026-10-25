import { render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import GraphView from './GraphView'
import { useSandbox } from '../../store/sandbox'

const scrollSpy = vi.fn()

describe('GraphView', () => {
  beforeAll(() => {
    // jsdom has no scrollIntoView; GraphView's HEAD auto-scroll uses it.
    Element.prototype.scrollIntoView = scrollSpy
  })
  beforeEach(() => {
    window.localStorage.clear()
    scrollSpy.mockClear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders one [data-commit] per commit and marks the current branch', () => {
    useSandbox.getState().reset('fresh-project')
    const { container } = render(<GraphView />)
    expect(container.querySelectorAll('[data-commit]').length).toBe(1)
    // One branch pill + one HEAD pill (both point at 'main' when attached).
    expect(container.querySelectorAll('[data-label]').length).toBe(2)
  })

  it('shows the feature commit after a fast-forward merge', () => {
    useSandbox.getState().reset('feature-branch')
    useSandbox.getState().run('git merge feature') // fast-forward: main now points at feature's tip
    const { container } = render(<GraphView />)
    expect(container.querySelectorAll('[data-commit]').length).toBe(2)
  })

  it('shows the empty state when there is no repository', () => {
    useSandbox.getState().reset('blank')
    render(<GraphView />)
    expect(screen.getByText(/Run git init to start a repository/i)).toBeInTheDocument()
  })

  it('labels a detached HEAD', () => {
    useSandbox.getState().reset('fresh-project')
    const sha = useSandbox.getState().world.repo!.branches.main
    useSandbox.getState().run(`git checkout ${sha}`)
    const { container } = render(<GraphView />)
    expect(container.textContent).toContain('HEAD (detached)')
  })
})