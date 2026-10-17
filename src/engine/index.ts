// Side-effect: register all git commands with the dispatcher.
import './commands'

export type * from './types'
export { parseArgs, type ArgSpec, type ParsedArgs } from './args'
export { GitError } from './errors'
export { commitId } from './hash'
export { registerGit, runCommand, type CommandFn, type Ctx } from './run'
export { resolveRev, reachable, isAncestor, mergeBase, headCommit } from './revs'
export { getStatus, type StatusEntry, type IndexState, type WorkState } from './status'
export { tokenize, type Token } from './tokenize'
export { createWorld, currentWorktree, requireRepo, workdir, writeFile } from './world'