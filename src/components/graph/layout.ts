import type { Repo, WorktreeState, Sha, Commit } from '../../engine/types'

export interface GraphNode {
  id: Sha
  message: string
  col: number
  lane: number
  isHead: boolean
}

export interface GraphEdge {
  child: Sha
  parent: Sha
}

export interface GraphLabel {
  kind: 'branch' | 'head' | 'tag'
  name: string
  target: Sha
  current: boolean
}

export interface GraphLayout {
  nodes: GraphNode[]
  edges: GraphEdge[]
  labels: GraphLabel[]
  lanes: number
  cols: number
  detached: boolean
}

/**
 * Pure function: computes a horizontal graph layout for a repo's commit graph.
 * Time flows left→right. Branches are lanes; main is lane 0.
 */
export function layoutGraph(repo: Repo, wt: WorktreeState): GraphLayout {
  // Step 1: collect all reachable commit Shas
  const reachable = new Set<Sha>()

  // HEAD and stash bases
  const headTip = wt.head.type === 'branch' ? repo.branches[wt.head.name] ?? null : wt.head.commit
  if (headTip) reachable.add(headTip)
  for (const entry of repo.stash) {
    reachable.add(entry.base)
  }

  // Branches
  for (const [, tip] of Object.entries(repo.branches)) {
    reachable.add(tip)
  }

  // Tags
  for (const tag of Object.values(repo.tags)) {
    reachable.add(tag.target)
  }

  // Walk first-parent chains from each reachable tip
  const visited = new Set<Sha>()
  const queue: Sha[] = [...reachable]
  while (queue.length > 0) {
    const sha = queue.shift()!
    if (visited.has(sha)) continue
    visited.add(sha)
    const commit = repo.commits[sha]
    if (!commit) continue
    for (const parent of commit.parents) {
      if (!visited.has(parent)) {
        queue.push(parent)
      }
    }
  }

  // Step 2: assign columns by time ascending
  const commitsByTime = Array.from(visited)
    .map((sha) => ({ sha, time: repo.commits[sha]?.time ?? 0 }))
    .sort((a, b) => a.time - b.time)

  const colMap = new Map<Sha, number>()
  commitsByTime.forEach(({ sha }, i) => {
    colMap.set(sha, i)
  })

  // Step 3: assign lanes
  // Order branches: main first, then insertion order
  const branchNames = Object.keys(repo.branches)
  branchNames.sort((a, b) => {
    if (a === 'main') return -1
    if (b === 'main') return 1
    return 0
  })

  const shaToLane = new Map<Sha, number>()
  let nextLane = 0

  for (const bname of branchNames) {
    const tip = repo.branches[bname]
    if (!tip) continue
    // Walk the first-parent chain, keeping only commits not yet claimed by an
    // earlier branch. A branch only gets a new lane if it claims >= 1 commit.
    const claimed: Sha[] = []
    let cur: Sha | undefined = tip
    const chainSeen = new Set<Sha>()
    while (cur && !chainSeen.has(cur)) {
      chainSeen.add(cur)
      if (!shaToLane.has(cur)) claimed.push(cur)
      const c: Commit | undefined = repo.commits[cur]
      if (!c || c.parents.length === 0) break
      cur = c.parents[0]
    }
    if (claimed.length === 0) continue
    const lane = nextLane++
    for (const sha of claimed) {
      shaToLane.set(sha, lane)
    }
  }

  // Remaining unassigned commits get lanes after branches
  const remaining: Sha[] = []
  for (const sha of visited) {
    if (!shaToLane.has(sha)) {
      remaining.push(sha)
    }
  }
  // Sort remaining by time for deterministic lane assignment
  remaining.sort((a, b) => (repo.commits[a]?.time ?? 0) - (repo.commits[b]?.time ?? 0))
  for (const sha of remaining) {
    shaToLane.set(sha, nextLane++)
  }

  // Step 4: build nodes (ordered by col so left-to-right time order)
  const nodes: GraphNode[] = []
  for (const { sha } of commitsByTime) {
    const commit = repo.commits[sha]!
    const isHead = sha === headTip
    nodes.push({
      id: sha,
      message: commit.message,
      col: colMap.get(sha)!,
      lane: shaToLane.get(sha)!,
      isHead,
    })
  }

  // Step 5: build edges
  const edges: GraphEdge[] = []
  for (const sha of visited) {
    const commit = repo.commits[sha]
    if (!commit) continue
    if (commit.parents.length >= 1) {
      edges.push({ child: sha, parent: commit.parents[0] })
    }
    if (commit.parents.length >= 2) {
      edges.push({ child: sha, parent: commit.parents[1] })
    }
  }

  // Step 6: build labels
  const labels: GraphLabel[] = []

  // Branch labels
  for (const [bname, tip] of Object.entries(repo.branches)) {
    const isCurrent = wt.head.type === 'branch' && wt.head.name === bname
    labels.push({
      kind: 'branch',
      name: bname,
      target: tip,
      current: isCurrent,
    })
  }

  // HEAD label
  if (wt.head.type === 'branch') {
    labels.push({
      kind: 'head',
      name: wt.head.name,
      target: repo.branches[wt.head.name],
      current: true,
    })
  } else {
    // detached
    labels.push({
      kind: 'head',
      name: 'HEAD',
      target: wt.head.commit,
      current: true,
    })
  }

  // Tag labels
  for (const [tname, tag] of Object.entries(repo.tags)) {
    labels.push({
      kind: 'tag',
      name: tname,
      target: tag.target,
      current: false,
    })
  }

  // Step 7: determine detached
  const detached = wt.head.type === 'detached'

  return {
    nodes,
    edges,
    labels,
    lanes: nextLane,
    cols: commitsByTime.length,
    detached,
  }
}

