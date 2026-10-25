import { merge as diff3Merge } from 'node-diff3'
import type { Tree } from './types'

export interface MergeLabels {
  ours: string
  theirs: string
}

export interface TextMergeResult {
  text: string
  conflict: boolean
}

export type ConflictKind = 'content' | 'add/add' | 'modify/delete'

/**
 * Three-way text merge of `ours` and `theirs` against the common `base`, using
 * node-diff3. On conflict the merged text holds git's marker blocks
 * (`<<<<<<< <ours>`, `=======`, `>>>>>>> <theirs>`); a modify/delete keeps the
 * surviving content.
 */
export function merge3(
  base: string,
  ours: string,
  theirs: string,
  labels: MergeLabels,
): TextMergeResult {
  const res = diff3Merge(ours, base, theirs, {
    label: { a: labels.ours, o: '', b: labels.theirs },
  })
  // diff3 splits on lines and appends a trailing '' for a final newline; rejoin.
  const parts: string[] = [...res.result]
  let trailing = ''
  if (parts.length > 0 && parts.at(-1) === '') {
    trailing = '\n'
    parts.pop()
  }
  return { text: parts.join('\n') + trailing, conflict: res.conflict }
}

/**
 * Merges two file-level trees (`ours`/`theirs`) against `base`, per path over the
 * union of all three trees:
 *   - both sides changed identically, or only one side changed -> take that content
 *   - add/add with different content   -> conflict (markers in workdir, base in index)
 *   - modify/delete (either direction) -> conflict, the modified content is kept
 *   - otherwise                        -> clean merge
 *
 * Returns the merged `tree` (the index result: base content for conflicted paths)
 * plus `workdir` (working-tree result: markers or the surviving content), the
 * sorted `conflicts` list, and `kinds` mapping each conflict to its kind.
 */
export function mergeTrees(
  base: Tree,
  ours: Tree,
  theirs: Tree,
  labels: MergeLabels,
): { tree: Tree; workdir: Tree; conflicts: string[]; kinds: Record<string, ConflictKind> } {
  const paths = Array.from(new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])).sort()
  const tree: Tree = {}
  const workdir: Tree = {}
  const conflicts: string[] = []
  const kinds: Record<string, ConflictKind> = {}

  for (const f of paths) {
    const inBase = Object.hasOwn(base, f)
    const inOurs = Object.hasOwn(ours, f)
    const inTheirs = Object.hasOwn(theirs, f)
    const b = inBase ? base[f] : ''
    const o = inOurs ? ours[f] : ''
    const t = inTheirs ? theirs[f] : ''

    // Deleted by both sides: gone.
    if (!inOurs && !inTheirs) continue
    // Neither side changed it: keep base content (absent when not in base).
    if (o === b && t === b) {
      if (inBase) {
        tree[f] = base[f]
        workdir[f] = base[f]
      }
      continue
    }

    const r = merge3(b, o, t, labels)
    if (!r.conflict) {
      if (inOurs || inTheirs) {
        tree[f] = r.text
        workdir[f] = r.text
      }
      continue
    }

    // Conflict: classify and record.
    let kind: ConflictKind = 'content'
    if (!inBase) kind = 'add/add'
    else if (!inOurs || !inTheirs) kind = 'modify/delete'
    const kept = !inOurs ? t : !inTheirs ? o : r.text
    conflicts.push(f)
    kinds[f] = kind
    tree[f] = b
    workdir[f] = kind === 'modify/delete' ? kept : r.text
  }

  return { tree, workdir, conflicts, kinds }
}
