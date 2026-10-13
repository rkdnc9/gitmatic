import type { Sha } from './types'

/** cyrb53: small, fast, well-distributed 53-bit string hash. */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** Deterministic 7-hex-char id for `seed`; re-salts until `taken` returns false. */
export function commitId(seed: string, taken: (id: string) => boolean): Sha {
  for (let salt = 0; ; salt++) {
    const id = cyrb53(salt === 0 ? seed : `${seed}\u0000${salt}`)
      .toString(16)
      .padStart(14, '0')
      .slice(0, 7)
    if (!taken(id)) return id
  }
}
