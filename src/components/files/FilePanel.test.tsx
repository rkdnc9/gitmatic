import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import FilePanel from './FilePanel'
import { useSandbox } from '../../store/sandbox'

describe('FilePanel', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('lists files in the working directory', () => {
    useSandbox.getState().reset('fresh-project')
    render(<FilePanel />)
    expect(screen.getByText('notes.txt')).toBeInTheDocument()
  })

  it('opens a file in the editor (sets editorPath)', async () => {
    useSandbox.getState().reset('fresh-project')
    const user = userEvent.setup()
    render(<FilePanel />)
    await user.click(screen.getByText('notes.txt'))
    expect(useSandbox.getState().editorPath).toBe('notes.txt')
  })

  it('highlights the open file', () => {
    useSandbox.getState().reset('fresh-project')
    useSandbox.getState().openFile('notes.txt')
    const { container } = render(<FilePanel />)
    const row = (container.textContent ?? '').includes('●')
    expect(row).toBe(true)
    // The open file's button carries aria-current.
    expect(container.querySelector('[aria-current="true"]')).not.toBeNull()
  })

  it('shows the empty state when there are no files', () => {
    useSandbox.getState().reset('blank')
    render(<FilePanel />)
    expect(screen.getByText('No files')).toBeInTheDocument()
  })
})