import { useEffect, useState } from 'react'
import { useSettings } from '../../store/settings'

// A small branch-and-merge picture, one frame per state. Static when the user
// (or OS) prefers reduced motion.
const FRAMES = [
  `       ●
      ╱
   ○──╯`,
  `       ●──●
      ╱
   ○──╯`,
  `       ●──●
      ╱
   ○───●──`,
]

export default function AsciiTitle({ animated = true }: { animated?: boolean }) {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (!animated || reduceMotion) return
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 750)
    return () => clearInterval(id)
  }, [animated, reduceMotion])

  return (
    <div className="flex flex-col items-center gap-2">
      <h1 className="wordmark-display">
        <span className="acc">git</span>matic
      </h1>
      <pre className="ascii-art" aria-hidden="true">
        {FRAMES[frame]}
      </pre>
    </div>
  )
}