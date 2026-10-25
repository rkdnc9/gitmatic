import { registerGit } from '../run'
import { PROJECT_DIR } from '../world'

const INIT_MSG = `Initialized empty Git repository in ${PROJECT_DIR}/.git/`
const REINIT_MSG = `Reinitialized existing Git repository in ${PROJECT_DIR}/.git/`

registerGit('init', (ctx) => {
  if (ctx.w.repo !== null) {
    ctx.out(REINIT_MSG, 'ok')
    ctx.note(REINIT_MSG)
    return
  }
  ctx.w.repo = {
    root: PROJECT_DIR,
    commits: {},
    branches: {},
    tags: {},
    stash: [],
    worktrees: {
      [ctx.w.cwd]: { head: { type: 'branch', name: 'main' }, index: {}, pending: null },
    },
  }
  ctx.out(INIT_MSG, 'ok')
  ctx.note(INIT_MSG)
})