import { registerGit } from '../run'

/**
 * `git help [cmd]` — plain-language explanations.
 * - no arg: lists every supported command, grouped, one `git <cmd> — …` line each.
 * - a cmd: prints that command's explanation (first line: `git <cmd> — <summary>`).
 * Also handles `git <cmd> --help` (the dispatcher forwards it here).
 */

interface Entry {
  name: string
  lines: string[]
}

const GROUPS: [title: string, entries: Entry[]][] = [
  [
    'Basics:',
    [
      {
        name: 'init',
        lines: [
          'git init — start a git repository here',
          'Creates the repository with a main branch that has no commits yet.',
        ],
      },
      {
        name: 'add',
        lines: [
          'git add — stage a file',
          'Copies the file into the index so the next commit will include it.',
          "Use 'git add .' to stage every change at once.",
        ],
      },
      {
        name: 'commit',
        lines: [
          'git commit — save a snapshot of your staged files',
          'Turns everything you staged into a permanent, named commit.',
          'Give it a message with -m: git commit -m "why this matters".',
          'Add -a to stage your tracked changes and commit in one step.',
        ],
      },
      {
        name: 'status',
        lines: [
          'git status — what has changed?',
          'Shows staged, unstaged, and untracked files, plus any in-progress merge.',
        ],
      },
      {
        name: 'log',
        lines: [
          'git log — the history of your commits',
          'Lists commits newest-first. Add --oneline for one line each.',
        ],
      },
      {
        name: 'diff',
        lines: [
          'git diff — what changed since the last save',
          'Shows your unstaged changes as additions (+) and deletions (-).',
          "Add --staged to see what's staged instead.",
        ],
      },
      {
        name: 'restore',
        lines: [
          'git restore — throw away a change',
          'Copies the file back from the index (or HEAD with --staged).',
        ],
      },
      {
        name: 'show',
        lines: [
          'git show — one commit in full',
          "Shows a commit's message plus exactly what it changed.",
        ],
      },
      {
        name: 'help',
        lines: ['git help — the command you are looking at', 'Run git help <command> for details.'],
      },
    ],
  ],
  [
    'Branches:',
    [
      {
        name: 'branch',
        lines: [
          'git branch — see and manage branches',
          'No args lists branches (* = current). Create one with git branch <name>.',
          'Delete with -d, rename with -m.',
        ],
      },
      {
        name: 'switch',
        lines: [
          'git switch — move to another branch',
          'git switch <branch> changes branches; -c creates one at the same time.',
        ],
      },
      {
        name: 'checkout',
        lines: [
          'git checkout — switch branches or restore a file',
          'Like switch, or git checkout <rev> -- <file> to pull a file from an older commit.',
        ],
      },
      {
        name: 'merge',
        lines: [
          'git merge — combine a branch into this one',
          'Fast-forwards when it can, otherwise makes a merge commit.',
          'Conflicts are marked in the files; resolve, git add, then git commit.',
          'Use --abort to undo a merge that went sideways.',
        ],
      },
    ],
  ],
  [
    'Undo:',
    [
      {
        name: 'reset',
        lines: [
          'git reset — move a branch pointer or unstage',
          '--soft keeps changes staged; --mixed (default) unstages them.',
          '--hard also wipes the changes from your files.',
        ],
      },
      {
        name: 'revert',
        lines: [
          'git revert — undo a commit, safely',
          'Makes a new commit that reverses the older one, keeping history intact.',
        ],
      },
      {
        name: 'cherry-pick',
        lines: [
          'git cherry-pick — copy one commit over here',
          'Replays that single commit onto your current branch.',
        ],
      },
      {
        name: 'stash',
        lines: [
          'git stash — set your in-progress changes aside',
          'git stash saves and clears them; stash list shows the saved sets.',
          'stash pop puts one back (and removes it); stash apply keeps a copy.',
        ],
      },
    ],
  ],
]

const ALL: Entry[] = GROUPS.flatMap(([, entries]) => entries)

registerGit('help', (ctx, argv) => {
  const topic = argv.find((a) => !a.startsWith('-'))
  if (!topic) {
    ctx.out('gitmatic simulates this set of git commands:')
    ctx.out('')
    for (const [title, entries] of GROUPS) {
      ctx.out(title)
      for (const e of entries) ctx.out(`  ${e.lines[0]}`)
    }
    ctx.out('')
    ctx.out("Run 'git help <command>' for details on any of them.")
    return
  }
  const found = ALL.find((e) => e.name === topic)
  if (found) {
    for (const line of found.lines) ctx.out(line)
    return
  }
  ctx.out(`gitmatic doesn't have a page for 'git ${topic}'.`)
  ctx.out("Run 'git help' to see the commands gitmatic supports.")
})
