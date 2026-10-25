import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import AreasStrip from './AreasStrip'
import { useSandbox } from '../../store/sandbox'

describe('AreasStrip', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('shows the three columns with the last commit', () => {
    useSandbox.getState().reset('fresh-project')
    render(<AreasStrip />)
    expect(screen.getByRole('heading', { name: 'Working directory' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Staging area' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Last commit' })).toBeInTheDocument()
    expect(screen.getByText('notes.txt')).toBeInTheDocument()
    expect(screen.getByText('[in commit]')).toBeInTheDocument()
  })

  it('shows a staged modification under the Staging area', () => {
    useSandbox.getState().reset('fresh-project')
    useSandbox.getState().run('echo "edit" >> notes.txt')
    useSandbox.getState().run('git add notes.txt')
    render(<AreasStrip />)
    expect(screen.getByText('[modified]')).toBeInTheDocument()
  })

  it('shows an untracked file in the working directory', () => {
    useSandbox.getState().reset('fresh-project')
    useSandbox.getState().run('echo "u" > u.txt')
    render(<AreasStrip />)
    expect(screen.getByText('[untracked]')).toBeInTheDocument()
  })

  it('shows a conflict badge during a pending merge', () => {
    useSandbox.getState().reset('conflict-waiting')
    useSandbox.getState().run('git merge feature')
    render(<AreasStrip />)
    expect(screen.getAllByText('[conflict]').length).toBeGreaterThanOrEqual(1)
  })

  it('shows muted dashes for empty columns', () => {
    useSandbox.getState().reset('blank')
    const { container } = render(<AreasStrip />)
    // blank = no repo: all three columns are empty -> at least one dash.
    expect((container.textContent ?? '').includes('—')).toBe(true)
  })
})