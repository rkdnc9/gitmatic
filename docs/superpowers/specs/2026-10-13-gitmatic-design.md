# gitmatic — design

A static website that teaches git the practical way. Everything runs in the
browser; no backend. Hosted on GitHub Pages from `rkdnc9/gitmatic`.

Legend: **(Rajiv)** = decided by Rajiv. **(Devin's call)** = proposed by Devin,
not explicitly approved; open to veto. Unmarked = follows directly from the above.

## 1. Intent

**Who it's for (Rajiv):** someone who knows nothing about git and wants to
become 80–90% fluent at everyday use — not memorize theory.

**What "fluent" means (Rajiv):** comfortable with branching, fetch vs pull,
rebase, pull requests and merges, resolving merge conflicts confidently, plus
the common team workflows: gitflow, tagging, hotfixes, and worktrees.

**Why this and not existing sites (Rajiv):** Learn Git Branching, Oh My Git and
similar feel textbook-like and don't teach the *ethos* of git — why it's useful
and where it shines. gitmatic teaches the "why" first; the commands follow.

**Core teaching idea (Rajiv):** each lesson makes the learner *wish* git had a
feature — and then reveals that it does. The first lesson or two establish what
git brings to the table at all; later lessons progress logically into advanced
topics. Tone is calm and clever, **not cheesy or dramatic**.

**Side purpose (Rajiv):** this is also Rajiv's practice project for AI-assisted
development, so code quality and a clean, testable structure matter, not just
the end product.

## 2. Goals, non-goals, anti-goals

### Goals
- Two modes **(Rajiv)**:
  - **Free mode** — explore git commands on your own in a sandbox.
  - **Guided mode** — levels from absolute zero to everyday fluency.
- In both modes **(Rajiv)**:
  - A clean, crisp, live visualization of the repo: local and remote, HEAD,
    branches, commits, and how they flow.
  - Answers available for every question/exercise.
- Fun, eye-candy UI **(Rajiv)**: game-style, big bold flat buttons, big bold
  text; ASCII motion art welcome.
- Fully static, browser-only, state in browser local storage **(Rajiv)**.

### Non-goals (Devin's call)
- Obscure or rarely used git: bisect, reflog surgery, submodules, hooks,
  filter-branch, sparse checkout, interactive rebase beyond a simple squash,
  cherry-pick beyond the basic form.
- Rare edge cases **(Rajiv: "don't intend to venture into the trickiest
  situations")**.
- Real network access, real remotes, connecting to a real GitHub account.
- Accounts, server-side progress, analytics/tracking.
- A full fake shell (no pipes, scripting, globbing, env vars).
- Phone as a first-class target (see §8).
- Internationalization in v1.

### Anti-goals (would make it a failure even if it "works")
- Feels like a textbook: walls of text before the learner gets to do anything.
- Cheesy or melodramatic presentation **(Rajiv)**.
- Synthetic busywork with no learning payoff **(Rajiv asked to be pushed back
  on this; agreed cuts are in §5.4)**.
- The simulated git behaving differently from real git for any command it
  claims to support — learners will carry the habit to real git.

## 3. Constraints

- **Hosting (Rajiv):** GitHub Pages (`rkdnc9.github.io/gitmatic`), so the app
  must work under a sub-path and with no server-side routing.
- **Repo (Rajiv):** `rkdnc9/gitmatic` (currently empty).
- **Stack (Rajiv):** React, using the latest, most efficient, well-proven
  libraries.
- **Engine (Rajiv):** a simulated git engine (not real git compiled to the
  browser). Chosen because rebase, remotes, PRs and conflicts are core topics
  and the visualization needs to know every step. Covers everyday commands only,
  with small toy files.
- **No backend (Rajiv).** Persistence = browser storage only.
- **Repo visibility:** `rkdnc9/gitmatic` is currently private. GitHub Pages
  from a private repo needs a paid GitHub plan; otherwise the repo must be
  public. *(Open question for Rajiv.)*

## 4. Stack (Devin's call)

| Concern | Choice | Why |
|---|---|---|
| Build | Vite + React 19 + TypeScript (strict) | Fast, standard, static output |
| Styling | Tailwind CSS v4 | Fast iteration on a bold flat look |
| State | Zustand | Small, simple, works well with a pure engine |
| Animation | Motion (formerly Framer Motion) | Layout/position animation for the graph |
| Graph rendering | Custom SVG components animated with Motion | Git graphs need a git-specific lane layout; generic node-editor libs (React Flow) fight that |
| Terminal | Custom React terminal component | Only a handful of commands; xterm.js is heavier than needed. Builder may switch if history/autocomplete gets hard |
| File / conflict editor | CodeMirror 6 | Lightweight, good for small files and conflict markers |
| Routing | React Router (hash routing) or equivalent | Works on GitHub Pages without 404 tricks |
| Tests | Vitest (engine + units), Playwright (key flows) | |
| Lint/format | ESLint + Prettier (or Biome) | Builder's pick |
| Deploy | GitHub Actions → GitHub Pages on push to `main` | |

Exact versions: latest stable at build time.

## 5. Product

### 5.1 Screen layout (Devin's call)

One main "playground" screen used by both modes:

- **Graph panel (largest):** the commit graph. Local repo and remote (`origin`)
  shown side by side (or stacked) so learners see them as two copies that sync.
- **Three-areas strip:** working directory → staging area → last commit, with
  each file's state. This is the #1 beginner confusion and must be visible.
- **Terminal:** where learners type commands. Above it, clickable suggestion
  chips (e.g. `git status`, `git add notes.txt`) for total beginners.
- **Side panel:** in guided mode, the lesson text/goal/hint/answer; in free
  mode, the "How do I…?" panel.
- **Files:** a small file list; clicking a file opens it in the editor (also
  reachable with `edit <file>` in the terminal).

Plus: a title screen (with ASCII motion art), a level list, and settings
(reset progress, reset sandbox, reduce motion).

### 5.2 Visualization requirements

- Commits as nodes with short IDs and messages; parent edges; lanes per branch.
- Branch labels, tag labels, and remote-tracking labels (`origin/main`) each
  visually distinct.
- **HEAD** always clearly marked: attached to a branch vs detached must look
  different.
- Remote repo has its own graph with its own branch labels.
- Worktrees: each worktree's HEAD/branch is marked, and which worktree the
  terminal is "in" is obvious.
- Stash entries shown somewhere (e.g. a small stack beside the graph).
- **Every command animates** what changed: commits pop in, branch labels slide,
  HEAD hops, rebased commits visibly get copied onto the new base (old ones fade),
  fetch shows commits travelling from remote to local.
- After each command, a one-line plain note of what happened
  (e.g. "moved `main` forward to a1b2c3d — fast-forward, no merge commit needed").
- Respects `prefers-reduced-motion` and a manual "reduce motion" setting.
- Colour is never the only signal (labels/shapes too).

### 5.3 Free mode

- Start from a blank repo or a **preset** (Devin's call), e.g.
  "fresh project", "repo with a remote and a teammate", "gitflow repo
  mid-release", "branch with a conflict waiting".
- A **"teammate pushes a commit"** button to simulate someone else updating the
  remote, so fetch/pull/conflict practice is possible on demand.
- **"How do I…?" panel (Devin's call):** searchable list of everyday tasks —
  undo my last commit, throw away my local changes, rename a branch, update my
  branch with the latest main, delete a merged branch, tag a release, start a
  hotfix, etc. Each shows the commands, a one-line why, and a "try it here"
  button that types them into the terminal.
- `git help <cmd>` prints a short plain-language explanation.
- Sandbox state persists across reloads; "reset" clears it.

### 5.4 Guided mode

**Beat of a lesson (Devin's call, shaped by Rajiv's "wish → reveal" idea and
his request to cut synthetic busywork):**

1. **Scenario** — 2–3 sentences, a small real-feeling problem.
2. **"Life without this"** — a ~10-second animated scene showing the pain
   (e.g. `final_v2_REALLY_final.txt` files multiplying). Not a manual exercise.
3. **Reveal** — the git feature that solves it, with a one-line "why".
4. **Do it** — learner types the commands; the graph animates.
5. **Goal check** — passes when the repo reaches the target *state*, however
   the learner got there (not an exact command match).
6. **Show answer** — always one click away; reveals the full command sequence.
   Using it marks the lesson "passed with help"; no penalty, no lock-out.
7. Short level-clear moment (ASCII flourish), then next lesson.

Some lessons have multiple small goals in sequence; scripted "teammate"
events can fire mid-lesson (e.g. teammate pushes, then the learner's push is
rejected → wish for "get their changes first" → reveal fetch/pull).

**Agreed cuts (Rajiv: "sounds good"):** no "struggle first" manual exercise
(replaced by step 2), no fake GitHub website (just a PR card), no game map /
stars / badges (a clean level list with checkmarks instead), no full shell.
ASCII art only on title screen and level-clear moments, never between the
learner and the task.

**Curriculum (Devin's draft; ordering and exact split left to builder, but the
scope is Rajiv's):**

| # | Topic | The "wish" | Commands |
|---|---|---|---|
| 1 | Why git exists | "I wish I could go back to how this was yesterday" | (mostly scene + first `git init`) |
| 2 | Save points | "I wish I could save a checkpoint with a note" | `init`, `status`, `add`, `commit`, `log` |
| 3 | Time travel | "I wish I could look at an old version without losing today's" | HEAD, `switch`/`checkout`, `diff`, `restore` |
| 4 | Undo safely | "I wish I could take that back" / "park this half-done work" | `revert`, `reset` (soft/mixed/hard), `stash` |
| 5 | Branches | "I wish I could try an idea without wrecking the working version" | `branch`, `switch -c`, `merge` (fast-forward vs merge commit) |
| 6 | Conflicts | "We both changed the same line — I wish git would ask me" | conflicting `merge`, editing markers, `add`, `commit`, `merge --abort` |
| 7 | Remotes | "I wish my work lived somewhere else too, and I could get my teammate's" | `clone`, `remote`, `fetch`, `pull`, `push`, `origin/main`, upstream tracking |
| 8 | Pull requests | "I wish someone could review this before it hits main" | push branch → open PR card → review → merge (merge commit or squash) |
| 9 | Rebase | "I wish my branch looked like I started from today's main" | `rebase`, `rebase --continue/--abort`, `pull --rebase`; when not to rebase |
| 10 | Tags & releases | "I wish I could name the exact version we shipped" | `tag` (lightweight + annotated), `push --tags` |
| 11 | Gitflow & hotfixes | "Prod is broken and main has half-done work on it" | `develop`, `feature/*`, `release/*`, `hotfix/*` branches using commands above |
| 12 | Worktrees | "I wish I could fix that hotfix without stashing my current work" | `worktree add/list/remove`, `cd` between them |

Lessons must be **data-driven** (a lesson = setup state + text + scenes +
goals + hints + answer + scripted events), so new lessons don't need engine
changes. Format (TS objects, JSON, MDX…) is the builder's call.

### 5.5 Pull requests (Devin's call)

A simple **PR card** on the remote: title, source → target branch, list of
commits, file diff, "approve", and "merge" with two options (merge commit,
squash). Opened via a button after pushing a branch (and optionally a
pseudo-command like `gh pr create` — builder's call; if added, label it as
GitHub CLI, not git). Lessons may script a reviewer comment requesting a
change, so the learner pushes another commit to the same PR.

## 6. Simulated git engine

A pure TypeScript module with no React dependency: `state + command → new
state + events`. The UI renders state and animates events. This is the heart of
the project and must be heavily unit-tested.

### 6.1 Model
- Objects: commits (id, parents, message, author, timestamp, tree snapshot).
  Files are small text files; a tree is a map of path → content.
- Refs: branches, tags (lightweight/annotated), HEAD (attached or detached),
  remote-tracking refs, upstream config per branch.
- Index (staging area) and working directory per worktree.
- Remotes: `origin` is a second simulated repository in the same browser state.
  Additional remotes not required.
- Stash stack.
- Worktrees: main worktree plus linked worktrees, each with its own HEAD,
  index, working dir, and path; a current working directory for the terminal.
- Commit IDs look like real short hashes (7 hex chars), **deterministic**
  (derived from content + a seed) so lessons and tests are reproducible.
- Default branch `main`.

### 6.2 Supported commands (v1 scope)
`init`, `clone`, `status`, `add` (paths, `.`, `-A`), `commit` (`-m`, `-a`,
`--amend`), `log` (`--oneline`, `--graph`, `--all`), `diff` (working, `--staged`,
between refs), `restore` (`--staged`), `switch` (`-c`), `checkout`
(branch, commit, `-b`, `-- <file>`), `branch` (list, create, `-d`/`-D`, `-m`,
`-a`, `-vv`), `merge` (`--no-ff`, `--abort`, `--squash`), `rebase` (onto
branch, `--continue`, `--abort`, simple `-i` squash only if cheap — builder's
call), `revert`, `reset` (`--soft`, `--mixed`, `--hard`), `stash` (push, `-m`,
list, pop, apply, drop), `tag` (create, `-a -m`, list, delete), `remote`
(`-v`, add), `fetch`, `pull` (`--rebase`), `push` (`-u`, `--tags`, rejection
when behind, `--force-with-lease`), `cherry-pick` (single commit), `worktree`
(add, list, remove), `show`, `help`.

Shell: `ls`, `cat`, `touch`, `echo "…" > file` / `>>`, `rm`, `edit <file>`,
`cd`, `pwd`, `clear`.

Unsupported commands print a friendly message ("gitmatic doesn't simulate
`git bisect` — it's rarely needed day to day") instead of a fake error.

### 6.3 Fidelity rules
- For supported commands, output messages, refusals, and resulting state match
  real git closely (wording may be simplified but never contradict real git).
  E.g. switching branches with conflicting uncommitted changes must refuse;
  pushing when behind must be rejected.
- Merges use a real 3-way line-based merge; conflicts produce standard
  `<<<<<<< / ======= / >>>>>>>` markers.
- **Suggested (Devin's call):** a test harness that runs the same command
  scripts against real git in Node/CI and compares resulting graphs/state, to
  catch drift. Builder decides how far to take this.

## 7. Persistence

- localStorage (or IndexedDB if size demands — builder's call): lesson
  progress (passed / passed with help), current lesson state, free-mode
  sandbox, settings.
- Versioned schema; on incompatible version, reset that part gracefully rather
  than crash.
- Separate reset buttons: progress, sandbox, everything.
- No accounts, no tracking.

## 8. Platform & quality (Devin's call)

- Desktop-first; usable on tablets; phones best-effort (reading lessons and
  watching the graph OK, typing commands not optimized).
- Keyboard-friendly: terminal focus, command history (↑/↓), tab completion for
  commands and branch names.
- Accessible: sufficient contrast, labels not just colour, reduced motion.
- Fast: static bundle, code-split per route; first load should feel instant on
  a normal connection.

## 9. Look & feel

- **Rajiv:** eye candy, fun, creative; game-style UI with big bold flat buttons
  and big bold text; ASCII motion art welcome. Not cheesy.
- **Devin's call:** a bold flat palette with high contrast, chunky rounded
  buttons, large display type for headings and goals, monospace for terminal
  and graph IDs. Dark theme default with a light theme option. Exact palette,
  fonts and art are the builder's call — produce a quick visual direction for
  Rajiv to react to before building out all screens.

## 10. Delivery order (Devin's call)

Build in milestones, each one deployable and usable:

1. **Foundation:** engine (local-only commands), playground screen with graph +
   three-areas strip + terminal, free mode, persistence, Pages deploy, visual
   direction check with Rajiv.
2. **Basics path:** lessons 1–6 (why git → conflicts) with the lesson runner,
   goal checks, hints, answers.
3. **Collaboration:** remote, teammate events, fetch/pull/push, PR card,
   rebase; lessons 7–9.
4. **Workflows:** tags, gitflow, hotfixes, worktrees; lessons 10–12; polish.

## 11. Smaller calls (Devin's call)

- Product name and site title: **gitmatic**; URL `rkdnc9.github.io/gitmatic`.
- `git clone` takes fake URLs (e.g. `https://github.com/team/notes-app.git`)
  that map to built-in preset remotes; unknown URLs give a friendly message.
- A blank free-mode repo has no remote until a preset is chosen or the learner
  clones one.
- Commit author is "you"; the scripted teammate has a fixed name and avatar.

## 12. Left to the builder

- Exact visual design (palette, typography, ASCII art pieces), after a quick
  direction check with Rajiv.
- Lesson content wording and exact split/order within the agreed scope.
- Lesson file format; engine internals; graph layout algorithm.
- Terminal implementation details; tab completion depth.
- Whether to include a `gh pr create`-style shortcut and interactive-rebase squash.
- Test depth beyond: engine thoroughly unit-tested, a few Playwright flows
  (complete a lesson, use free mode, reload keeps progress).

## 13. Success looks like

- A git beginner can go from lesson 1 to the end without outside help and then
  handle branching, fetch/pull/push, rebase, PRs, conflicts, tags, gitflow
  hotfixes, and worktrees in a real repo.
- Every supported command behaves like real git.
- It's genuinely pleasant to look at and use.
