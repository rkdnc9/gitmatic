import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useSettings } from '../../store/settings'
import { useSandbox } from '../../store/sandbox'
import { layoutGraph, type GraphLayout } from './layout'

/** Horizontal layout metrics. Time flows left→right: col = x, lane = y. */
const COL_W = 140
const LANE_H = 84
const TOP = 36 // room above lane 0 for the HEAD pill
const NODE_R = 6
const MSG_MAX = 28

type Variants = {
  initial: { x: number; y: number; opacity: number; scale: number }
  animate: { x: number; y: number; opacity: number; scale: number }
  exit: { opacity: number; scale: number }
}

const spring = { type: 'spring' as const, stiffness: 400, damping: 34 }

function nodeVariants(x: number, y: number): Variants {
  return {
    initial: { x, y, opacity: 0, scale: 0 },
    animate: { x, y, opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.4 },
  }
}

/**
 * `scrollIntoView` on the HEAD commit whenever it (or the layout) changes.
 * Kept as a child so the effect fires after the motion elements have been
 * added to the DOM; reads the ref inside the effect because `.current` is
 * only populated after mount.
 */
function HeadTracker({
  headSha,
  containerRef,
}: {
  headSha: string
  containerRef: RefObject<HTMLDivElement | null>
}) {
  const first = useRef(true)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const el = container.querySelector(`[data-commit="${headSha}"]`) as SVGElement | null
    el?.scrollIntoView({
      behavior: first.current ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    })
    first.current = false
  }, [headSha, containerRef])
  return null
}

/**
 * The animated commit graph: `layoutGraph`'s output rendered as SVG.
 *
 * Motion notes:
 * - `MotionConfig reducedMotion={...}` makes every motion element here respect
 *   the user preference: `x`/`y`/`scale` (transform) animations switch to
 *   opacity-only (or instant) when `reducedMotion` is active, so no separate
 *   duration-gating is needed.
 * - Node/label positions bind `x`/`y` as motion values, which motion renders
 *   as a CSS `transform` on the `<g>` (more animatable than animating
 *   `cx`/`cy`). `layout={false}` keeps motion out of layout measurement, so
 *   plain CSS handles reflow.
 * - Edges are static `<path>`s recomputed from the same coordinates; they snap
 *   to their new position while nodes glide (documented trade-off).
 */
export default function GraphView() {
  const world = useSandbox((s) => s.world)
  const reduceMotion = useSettings((s) => s.reduceMotion)
  const containerRef = useRef<HTMLDivElement>(null)

  const repo = world.repo
  const wt = repo ? repo.worktrees[world.cwd] : null

  const layout: GraphLayout | null = useMemo(
    () => (repo && wt ? layoutGraph(repo, wt) : null),
    [repo, wt],
  )

  // Empty state: no repo, or a repo with no commits yet.
  if (!layout || layout.nodes.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-zinc-600 bg-zinc-900/40">
        <p className="text-sm text-zinc-400">Run git init to start a repository</p>
      </div>
    )
  }

  const width = Math.max(460, layout.cols * COL_W + 60)
  const height = Math.max(150, layout.lanes * LANE_H + 80)

  // node center: id -> {x, y}. String-keyed static table, so a Record.
  const pos: Record<string, { x: number; y: number }> = {}
  for (const n of layout.nodes) pos[n.id] = { x: n.col * COL_W + 40, y: n.lane * LANE_H + TOP }

  const headNode = layout.nodes.find((n) => n.isHead) ?? layout.nodes[layout.nodes.length - 1]
  const headSha = headNode.id

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
      <div
        ref={containerRef}
        className="overflow-x-auto rounded-xl border border-zinc-700 bg-zinc-900/40"
      >
        <svg width={width} height={height} role="img" aria-label="Commit graph">
          {/* Edges: smooth cubic beziers from child right-edge to parent left-edge. */}
          <g stroke="currentColor" className="text-zinc-500" fill="none" strokeWidth={1.5}>
            {layout.edges.map((e) => {
              const c = pos[e.child]
              const p = pos[e.parent]
              if (!c || !p) return null
              const x1 = c.x + NODE_R
              const y1 = c.y
              const x2 = p.x - NODE_R
              const y2 = p.y
              const dx = Math.max(Math.abs(x2 - x1) * 0.5, 24)
              return (
                <path
                  key={`${e.child}-${e.parent}`}
                  d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`}
                />
              )
            })}
          </g>

          {/* Nodes: pop in, glide on reposition, fade out when removed. */}
          <AnimatePresence>
            {layout.nodes.map((n) => {
              const x = n.col * COL_W + 40
              const y = n.lane * LANE_H + TOP
              const highlighted = n.isHead
              const msg =
                n.message.length > MSG_MAX ? n.message.slice(0, MSG_MAX) + '…' : n.message
              return (
                <motion.g
                  key={n.id}
                  layout={false}
                  variants={nodeVariants(x, y)}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={spring}
                  data-commit={n.id}
                >
                  <circle
                    r={NODE_R}
                    fill={highlighted ? '#fbbf24' : '#3f3f46'}
                    stroke={highlighted ? '#f59e0b' : '#a1a1aa'}
                    strokeWidth={2}
                  />
                  <text
                    x={0}
                    y={20}
                    textAnchor="middle"
                    className="fill-zinc-300 font-mono text-[11px]"
                  >
                    {n.id.slice(0, 7)}
                  </text>
                  <text x={0} y={34} textAnchor="middle" className="fill-zinc-500 text-[11px]">
                    {msg}
                  </text>
                </motion.g>
              )
            })}
          </AnimatePresence>

          {/* Label pills: branch (solid border, bold+ring when current), HEAD (chevron, amber; rose when detached), tags. */}
          <AnimatePresence>
            {layout.labels.map((l) => {
              const p = pos[l.target]
              if (!p) return null
              const isHead = l.kind === 'head'
              const text = isHead && layout.detached ? 'HEAD (detached)' : l.name
              const w = text.length * 7.2 + 16
              const h = 18
              const y = isHead ? p.y - 16 - h : p.y + NODE_R + 8
              const fill =
                l.kind === 'branch'
                  ? l.current
                    ? '#18181b'
                    : '#27272a'
                  : l.kind === 'head'
                    ? layout.detached
                      ? '#3f1d1d'
                      : '#3b2c0f'
                    : '#18181b'
              const stroke =
                l.kind === 'branch'
                  ? l.current
                    ? '#fbbf24'
                    : '#71717a'
                  : l.kind === 'head'
                    ? layout.detached
                      ? '#f87171'
                      : '#f59e0b'
                    : '#a1a1aa'
              return (
                <motion.g
                  key={`${l.kind}:${l.name}`}
                  layout={false}
                  variants={nodeVariants(p.x, 0)}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={spring}
                  data-label={text}
                >
                  <g transform={`translate(0 ${y})`}>
                    <rect
                      x={-w / 2}
                      y={0}
                      width={w}
                      height={h}
                      rx={h / 2}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={l.current || isHead ? 2 : 1.2}
                    />
                    {isHead && (
                      <path
                        d={`M ${-w / 2 + 5} ${h / 2 - 4} L ${-w / 2 + 9} ${h / 2} L ${-w / 2 + 5} ${h / 2 + 4}`}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={1.5}
                      />
                    )}
                    <text
                      x={isHead ? 4 : 0}
                      y={h / 2 + 4}
                      textAnchor="middle"
                      fontWeight={l.current || isHead ? 700 : 400}
                      className="fill-zinc-100 text-[11px]"
                    >
                      {text}
                    </text>
                  </g>
                </motion.g>
              )
            })}
          </AnimatePresence>
        </svg>
        <HeadTracker headSha={headSha} containerRef={containerRef} />
      </div>
    </MotionConfig>
  )
}
