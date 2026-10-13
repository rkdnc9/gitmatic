# gitmatic Milestone 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployed gitmatic site with a simulated git engine (local commands), the playground screen (graph + three-areas strip + terminal + files), free mode with presets and "How do I…?", browser persistence, and a title screen — ready for the visual-direction check with Rajiv.

**Architecture:** A pure TypeScript engine (`src/engine`) maps `World + command line → CommandResult` immutably (Immer); errors abort atomically. React screens read a Zustand store that wraps the engine and persists to localStorage. The graph is a pure layout function (`layoutGraph`) rendered as SVG animated with Motion, keyed by commit id so every state change animates.

**Tech Stack:** Vite, React 19, TypeScript (strict), Tailwind CSS v4 (`@tailwindcss/vite`), Zustand (+ `persist`), Immer, Motion (`motion/react`), React Router (hash router), CodeMirror 6 via `@uiw/react-codemirror`, `node-diff3` (3-way merge), `diff` (jsdiff, unified diffs), Vitest + Testing Library + jsdom, Playwright, ESLint + Prettier. npm. Latest stable versions at install time.

**Spec:** `docs/superpowers/specs/2026-10-13-gitmatic-design.md` (milestone 1 in §10).

## Global Constraints

- Fully static, browser-only; no backend, no network calls, no analytics.
- Deployed to GitHub Pages at `rkdnc9.github.io/gitmatic` → Vite `base: '/gitmatic/'`, hash routing.
- Engine has no React import; every exported engine function is pure.
- Supported commands match real git's resulting state, refusals and key messages; wording may be simplified, never contradictory (spec §6.3).
- Default branch `main`. Commit IDs: 7 lowercase hex chars, deterministic.
- Author identity: `You <you@gitmatic.dev>`.
- Unsupported git commands print a friendly message, never a fake error (spec §6.2).
- Respect `prefers-reduced-motion` and the in-app "reduce motion" setting.
- Colour is never the only signal; labels/shapes carry meaning too.
- Tone: calm and clear, not cheesy (Rajiv).
- Desktop-first; nothing may be unusable at 768px wide.
- localStorage keys prefixed `gitmatic:`; schema versioned.

## Review Focus

1. **Awkward command lines** — quotes, extra spaces, unknown flags, empty input, `git` alone → git-like messages, never a crash. Test in Task 2.
2. **Commands in the wrong state** — before `git init`, on an unborn branch, mid-merge (`git switch`/`git merge` during conflicts) → real git's refusal. Tests in Tasks 3, 5, 6.
3. **Corrupted or old saved state** — garbage/old-version JSON in localStorage → app loads a fresh sandbox, no blank screen. Test in Task 11.
4. **Long histories** — 60+ commits, several branches → graph layout has no overlapping nodes and stays fast. Test in Task 10.
5. **Editing files in the UI while mid-merge** — saving a conflicted file via the editor then `git add` resolves it; status/strip update immediately. Test in Task 13.

---

## File Structure

```
src/engine/
  types.ts        World, Repo, Commit, Head, Pending, StashEntry, WorktreeState, CommandResult…
  world.ts        createWorld, currentWorktree, workdir, writeFile, requireRepo
  hash.ts         commitId()
  tokenize.ts     tokenize() — shell-like split, quotes, > and >>
  args.ts         parseArgs()
  errors.ts       GitError
  run.ts          runCommand() dispatcher, Ctx
  revs.ts         resolveRev(), isAncestor(), mergeBase(), reachable()
  status.ts       getStatus()
  merge3.ts       merge3() wrapper over node-diff3
  textDiff.ts     unifiedDiff() wrapper over jsdiff
  shell.ts        ls cat touch echo rm pwd clear edit
  commands/       init add commit status log diff restore show branch switch checkout merge reset revert cherryPick stash help
  completions.ts  getCompletions()
  testing.ts      exec() test helper
  index.ts        public API
src/components/graph/layout.ts   layoutGraph()
src/components/graph/GraphView.tsx
src/components/terminal/Terminal.tsx, SuggestionChips.tsx
src/components/areas/AreasStrip.tsx
src/components/files/FilePanel.tsx, FileEditor.tsx
src/components/howdoi/HowDoIPanel.tsx
src/components/ui/BigButton.tsx, Panel.tsx
src/components/ascii/AsciiTitle.tsx
src/content/presets.ts, howdoi.ts, suggestions.ts
src/store/storage.ts, sandbox.ts, settings.ts
src/screens/TitleScreen.tsx, FreeModeScreen.tsx, SettingsScreen.tsx
src/App.tsx, main.tsx, styles.css
tests/fidelity/  realGit.ts, scripts.ts, fidelity.test.ts
e2e/free-mode.spec.ts
.github/workflows/ci.yml, deploy.yml
```

---

### Task 1: Scaffold, CI, and Pages deploy

**Files:** Create: project via `npm create vite@latest . -- --template react-ts`, `vite.config.ts`, `src/App.tsx`, `src/screens/*` (placeholders), `src/styles.css`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.nvmrc`, `.prettierrc`; Modify: `README.md`, `package.json`. Test: `src/App.test.tsx`.

**Interfaces:** Produces npm scripts `dev`, `build`, `preview`, `lint`, `typecheck` (`tsc -b --noEmit`), `test` (`vitest run`), `test:e2e` (`playwright test`), `format`. Routes: `#/` → `TitleScreen`, `#/free` → `FreeModeScreen`, `#/settings` → `SettingsScreen`.

- [ ] **Step 1:** Install Node current LTS on the VM if missing (`node --version`); write it to `.nvmrc`.
- [ ] **Step 2:** Scaffold Vite react-ts in the repo root; add Tailwind v4 (`@tailwindcss/vite`, `@import "tailwindcss";` in `styles.css`), React Router, Vitest + jsdom + Testing Library, ESLint (flat config from template) + Prettier. Set `base: '/gitmatic/'`, TS `strict: true`.
- [ ] **Step 3: Write the failing test** `src/App.test.tsx`: render `<App />` → `screen.getByRole('heading', { name: /gitmatic/i })` exists and a link named `/free mode/i` exists.
- [ ] **Step 4:** `npm test` → FAIL.
- [ ] **Step 5:** Implement `App` with `createHashRouter`; `TitleScreen` placeholder with `<h1>gitmatic</h1>` and a `Link` "Free mode" to `/free`.
- [ ] **Step 6:** `npm test && npm run lint && npm run typecheck && npm run build` → all pass, `dist/index.html` references `/gitmatic/assets/…`.
- [ ] **Step 7:** `ci.yml` on `pull_request` and `push` to `main`: setup-node from `.nvmrc`, `npm ci`, lint, typecheck, test, build. `deploy.yml` on `push` to `main` + `workflow_dispatch`: build, `actions/upload-pages-artifact` (`dist`), `actions/deploy-pages`; permissions `pages: write`, `id-token: write`; concurrency group `pages`.
- [ ] **Step 8:** README: one-paragraph description + dev commands. **Manual step for Rajiv (cannot be automated with `GITHUB_TOKEN`):** repo Settings → Pages → Source: "GitHub Actions". Note it in the PR description.
- [ ] **Step 9: Commit** `chore: scaffold Vite React app with CI and Pages deploy`.

### Task 2: Engine core — types, world, tokenizer, args, dispatcher, shell commands

**Files:** Create `src/engine/{types,world,hash,tokenize,args,errors,run,shell,testing,index}.ts`; Test `src/engine/__tests__/{tokenize,args,shell,run}.test.ts`. Add deps `immer`.

**Interfaces (Produces — used by every later engine task):**

```ts
type Sha = string;
type Tree = Record<string, string>;                 // path -> file content
interface Commit { id: Sha; parents: Sha[]; message: string; author: string; time: number; tree: Tree }
type Head = { type: 'branch'; name: string } | { type: 'detached'; commit: Sha };
interface Pending { type: 'merge' | 'cherry-pick' | 'revert'; theirs: Sha; message: string; conflicts: string[]; origHead: Sha }
interface StashEntry { message: string; base: Sha; index: Tree; workdir: Tree; branch: string }
interface WorktreeState { head: Head; index: Tree; pending: Pending | null }
interface Tag { target: Sha; message: string | null }   // used from milestone 4
interface Repo { root: string; commits: Record<Sha, Commit>; branches: Record<string, Sha>;
                 tags: Record<string, Tag>; stash: StashEntry[]; worktrees: Record<string, WorktreeState> }
interface World { version: 1; cwd: string; files: Record<string, Tree>; repo: Repo | null; clock: number }
interface OutputLine { text: string; tone: 'out' | 'err' | 'hint' | 'ok' }
type Effect = { type: 'open-editor'; path: string } | { type: 'clear' };
interface CommandResult { world: World; output: OutputLine[]; note: string | null; effects: Effect[]; ok: boolean }

// world.ts
function createWorld(): World;                       // cwd '/project', files {'/project': {}}, repo null, clock 0
function workdir(w: World): Tree;                    // w.files[w.cwd]
function writeFile(w: World, path: string, content: string): World;
function currentWorktree(w: World): WorktreeState | null;
// run.ts
interface Ctx { w: Draft<World>; out(text: string, tone?: OutputLine['tone']): void; note(text: string): void; effect(e: Effect): void }
type CommandFn = (ctx: Ctx, argv: string[]) => void;
function runCommand(world: World, line: string): CommandResult;
function registerGit(name: string, fn: CommandFn): void;   // commands self-register via commands/index.ts
// errors.ts
class GitError extends Error { lines: string[] }     // thrown by commands; runCommand returns original world, lines as 'err', ok false
// hash.ts
function commitId(seed: string, taken: (id: string) => boolean): Sha;   // cyrb53-style hash → 7 hex; re-salt on collision
// tokenize.ts
type Token = { type: 'word'; value: string } | { type: 'redirect'; append: boolean };
function tokenize(line: string): Token[];            // throws GitError on unterminated quote
// args.ts
interface ArgSpec { bool?: string[]; string?: string[]; alias?: Record<string, string> }
function parseArgs(argv: string[], spec: ArgSpec): { flags: Record<string, string | boolean>; positionals: string[]; afterDashDash: string[] };
// testing.ts
function exec(lines: string[], world?: World): { world: World; last: CommandResult; all: CommandResult[] };
function text(r: CommandResult): string;             // output lines joined with '\n'
```

`runCommand` uses `produce` from Immer; increments `clock` once per successful command. Unknown first word → `"<cmd>: command not found"`. `git` alone → short usage + `git help`. Unknown `git <sub>` from a list of real-but-unsupported subcommands (`bisect`, `submodule`, `reflog`, `filter-branch`, `sparse-checkout`, `gc`, `blame`, …) → friendly message from spec §6.2; anything else → `git: '<sub>' is not a git command. See 'git help'.`. Unknown flags → `error: unknown option '<flag>'`. Long-form `--opt=value`, combined short bools (`-am "msg"`: `a` bool then `m` takes next).

- [ ] **Step 1: Write failing tests:**
  - `tokenize('git commit -m "first save"')` → words `['git','commit','-m','first save']`; `tokenize("echo 'hi there' >> notes.txt")` → words `echo`,`hi there`, redirect append, word `notes.txt`; `tokenize('  ')` → `[]`; `tokenize('echo "oops')` throws GitError.
  - `parseArgs(['-am','msg'], {bool:['a'], string:['m']})` → flags `{a:true, m:'msg'}`; `--message=x` with alias `{message:'m'}` → `m:'x'`; `['--', 'f.txt']` → `afterDashDash: ['f.txt']`.
  - Shell: `exec(['echo "hello" > a.txt','cat a.txt'])` → last output `hello`; `echo "more" >> a.txt` appends a line (file ends with `\n`); `touch b.txt` creates empty file; `ls` lists `a.txt  b.txt` sorted; `rm a.txt` then `cat a.txt` → err `cat: a.txt: No such file or directory`; `pwd` → `/project`; `clear` → effect `{type:'clear'}`; `edit a.txt` → effect `{type:'open-editor', path:'a.txt'}` (creates file if absent).
  - Run: `runCommand(w, '')` → ok true, no output, same world; `frobnicate` → err `frobnicate: command not found`; `git bisect` → friendly unsupported text contains `gitmatic doesn't simulate`; `git status --bogus` (after Task 3) — in this task use a stub command registered in the test to assert `error: unknown option '--bogus'` and that the world is unchanged (reference equality).
- [ ] **Step 2:** `npx vitest run src/engine` → FAIL.
- [ ] **Step 3:** Implement the files above. Files paths are flat (no subdirectories in toy repos).
- [ ] **Step 4:** Tests pass; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(engine): core types, tokenizer, dispatcher, shell commands`.

### Task 3: init, add, commit, status, log, revisions

**Files:** Create `src/engine/{revs,status}.ts`, `src/engine/commands/{init,add,commit,status,log,index}.ts`; Test `__tests__/{init,add-commit,status,log,revs}.test.ts`.

**Interfaces:**
```ts
function resolveRev(repo: Repo, wt: WorktreeState, rev: string): Sha | null;  // HEAD, branch, 4+ char sha prefix, X~n, X^, X^2
function reachable(repo: Repo, from: Sha[]): Set<Sha>;
function isAncestor(repo: Repo, a: Sha, b: Sha): boolean;
function mergeBase(repo: Repo, a: Sha, b: Sha): Sha | null;
function headCommit(repo: Repo, wt: WorktreeState): Sha | null;     // null on unborn branch
type IndexState = 'added' | 'modified' | 'deleted' | null;
type WorkState = 'untracked' | 'modified' | 'deleted' | null;
interface StatusEntry { path: string; index: IndexState; work: WorkState; conflicted: boolean }
function getStatus(w: World): StatusEntry[];        // [] when no repo; sorted by path
```

Exact messages (match git): init → `Initialized empty Git repository in /project/.git/` (re-init → `Reinitialized existing Git repository in /project/.git/`); any git command except init/help without repo → `fatal: not a git repository (or any of the parent directories): .git`; `add missing.txt` → `fatal: pathspec 'missing.txt' did not match any files`; commit with nothing staged and changes present → `no changes added to commit (use "git add" and/or "git commit -a")`; clean → `nothing to commit, working tree clean`; commit without `-m` → err `Aborting commit due to empty commit message.` plus hint `Use git commit -m "message"`; commit output `[main (root-commit) a1b2c3d] first save` / `[main a1b2c3d] msg`; log on unborn → `fatal: your current branch 'main' does not have any commits yet`. Status long format, unborn header (`No commits yet`), detached header `HEAD detached at <sha>`, and section texts exactly as git 2.4x prints them (`Changes to be committed:` / `Changes not staged for commit:` / `Untracked files:` with the `(use "git …")` hints). Log full format: `commit <sha> (HEAD -> main, feature)`, `Author: You <you@gitmatic.dev>`, `Date:` (derive from `time`; format is builder's call), blank, 4-space-indented message. `--oneline`: `<sha> (HEAD -> main) msg`. `--all`: all branch tips + HEAD. `--graph`: oneline plus a lane gutter built from `layoutGraph` lanes is acceptable only after Task 10 — until then render `* ` prefix; exact art is builder's call. Order: by `time` desc. `commit -a` stages tracked modifications/deletions only; `--amend` replaces HEAD commit (new id, same parents), `--amend` with no `-m` keeps message. Notes, e.g. commit: `Saved commit a1b2c3d on main — main now points to it.`

- [ ] **Step 1: Failing tests:** each message above; `exec(['git init','echo "a" > a.txt','git add a.txt','git commit -m "first"'])` → `repo.branches.main` is the only commit, parents `[]`, tree `{ 'a.txt': 'a\n' }`, `getStatus` `[]`; status entries for untracked / staged-new / modified-unstaged / staged-then-modified (`index:'added', work:'modified'`) / deleted; `git add .` and `-A` stage deletions; `resolveRev` for `HEAD~1`, `HEAD^`, `main`, 4-char prefix, ambiguous/unknown → null; same script run twice → identical commit ids (determinism); `--amend` changes id and keeps parent; every successful state-changing command returns non-null `note`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Pass + typecheck.
- [ ] **Step 5: Commit** `feat(engine): init, add, commit, status, log`.

### Task 4: diff, restore, show

**Files:** Create `src/engine/textDiff.ts`, `commands/{diff,restore,show}.ts`; Test `__tests__/diff-restore-show.test.ts`. Add dep `diff`.

**Interfaces:** `function unifiedDiff(path: string, before: string | null, after: string | null): string[]` — lines `diff --git a/p b/p`, `--- a/p` (or `/dev/null`), `+++ b/p`, hunks from jsdiff `structuredPatch`.

Behaviour: `diff` = workdir vs index; `--staged`/`--cached` = index vs HEAD; `diff A B` = trees of two revs; `diff -- file` limits paths. Output tones: `+` lines `ok`, `-` lines `err`. `restore f` = index→workdir; `restore --staged f` = HEAD→index (removes from index if not in HEAD); `restore --source=<rev> f`. `show [rev]` = log header + diff vs first parent.

- [ ] **Step 1: Failing tests:** modify committed `a.txt` → `git diff` contains `-a` and `+b`; after `git add`, `git diff` is empty and `git diff --staged` shows it; `git restore --staged a.txt` → status back to unstaged; `git restore a.txt` → workdir equals index; `git show HEAD` contains the commit message and its diff; `git diff missing-rev` → `fatal: ambiguous argument 'missing-rev': unknown revision or path not in the working tree.`
- [ ] **Steps 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(engine): diff, restore, show`.

### Task 5: branch, switch, checkout, detached HEAD

**Files:** Create `commands/{branch,switch,checkout}.ts`; Test `__tests__/branching.test.ts`.

**Interfaces:** Consumes `resolveRev`, `isAncestor`, `getStatus`. Produces internal helper in `world.ts`: `function moveHeadTo(ctx: Ctx, target: Sha, head: Head): void` — updates HEAD, index and workdir from target tree, carrying over local changes that don't conflict; throws GitError (git's "would be overwritten" text) when they do.

Behaviour/messages: `branch` lists with `* ` on current (and `* (HEAD detached at <sha>)`); `branch x` on unborn → `fatal: not a valid object name: 'main'`; existing → `fatal: a branch named 'x' already exists`; `-d` unmerged → `error: the branch 'x' is not fully merged` + hint to use `-D`; deleting current → `error: cannot delete branch 'x' used by worktree at '/project'`; `-m old new` / `-m new`. `switch x` → `Switched to branch 'x'`; unknown → `fatal: invalid reference: x`; `switch -c x [start]` → `Switched to a new branch 'x'`; `switch <sha>` without `--detach` → `fatal: a branch is expected, got commit '<sha>'` + hint; `switch --detach <rev>` / `checkout <sha>` → detached, message includes `You are in 'detached HEAD' state.` (shortened). `checkout -b x`, `checkout x`, `checkout -- f` (= restore). Dirty switch with conflicting local change → `error: Your local changes to the following files would be overwritten by checkout:` / `\t<file>` / `Please commit your changes or stash them before you switch branches.` / `Aborting`; non-conflicting local changes carry over. Committing in detached HEAD moves detached HEAD only.

- [ ] **Step 1: Failing tests:** each message; carry-over vs refusal cases; `switch -c feature` then commit → `main` unchanged, `feature` advanced; detached commit not on any branch, then `switch main` → note warns it's left behind (git prints `Warning: you are leaving 1 commit behind…`).
- [ ] **Steps 2–4.** **Step 5: Commit** `feat(engine): branches, switch, checkout`.

### Task 6: merge (fast-forward, merge commit, conflicts, abort, squash)

**Files:** Create `src/engine/merge3.ts`, `commands/merge.ts`; Modify `commands/commit.ts` (conclude pending), `commands/add.ts` (resolve conflicts), `status.ts`/`commands/status.ts` (unmerged section); Test `__tests__/merge.test.ts`. Add dep `node-diff3`.

**Interfaces:** `function merge3(base: string, ours: string, theirs: string, labels: { ours: string; theirs: string }): { text: string; conflict: boolean }` — markers `<<<<<<< HEAD`, `=======`, `>>>>>>> <theirs-label>`. `function mergeTrees(base: Tree, ours: Tree, theirs: Tree, labels): { tree: Tree; conflicts: string[] }` — file-level add/delete rules: same change both sides → take it; one side changed → take it; modify/delete → conflict (keep modified content). Both reused by revert/cherry-pick (Task 7) and rebase (milestone 3).

Behaviour/messages: up to date → `Already up to date.`; ff → `Updating <a>..<b>` / `Fast-forward`; `--no-ff` or diverged → merge commit with message `Merge branch '<x>'` (into non-main: `Merge branch 'x' into y`), two parents [ours, theirs]; conflicts → `Auto-merging f` / `CONFLICT (content): Merge conflict in f` / `Automatic merge failed; fix conflicts and then commit the result.`, sets `pending`, workdir has markers, index unchanged for conflicted paths; `git add f` removes f from `pending.conflicts`; `git commit` with conflicts left → `error: Committing is not possible because you have unmerged files.`; with none left → merge commit (default message from pending, `-m` optional); `merge --abort` restores `origHead` tree; switch/merge during pending → `error: you need to resolve your current index first` (switch) / `error: Merging is not possible because you have unmerged files.`; dirty overlapping workdir → git's "would be overwritten by merge" refusal. `--squash` → stages result, no commit, no pending parents, message `Squash commit -- not updating HEAD`.

- [ ] **Step 1: Failing tests:** all messages; ff moves label only (no new commit); diverged produces 2-parent commit with merged tree; conflict scenario (both edit line 1 of `notes.txt`) → status `conflicted:true`, workdir contains all three markers; resolve via `echo` + `git add` + `git commit` → 2 parents; abort restores exactly; squash leaves `pending` null and HEAD unchanged.
- [ ] **Steps 2–4.** **Step 5: Commit** `feat(engine): merge with conflicts, abort, squash`.

### Task 7: reset, revert, cherry-pick, stash

**Files:** Create `commands/{reset,revert,cherryPick,stash}.ts`; Test `__tests__/undo.test.ts`.

Behaviour/messages: `reset [--soft|--mixed|--hard] [rev]` (default mixed, rev HEAD); `--hard` prints `HEAD is now at <sha> <msg>`; mixed prints `Unstaged changes after reset:` + `M\t<file>` lines when any; `reset f` = unstage. `revert <rev>` → new commit `Revert "<msg>"` with body `This reverts commit <full id>.` (use the 7-char id); conflict path like merge with `pending.type='revert'`, `--continue`/`--abort`. `cherry-pick <rev>` → new commit same message on HEAD; conflicts → `pending.type='cherry-pick'`, `--continue`/`--abort`. `stash` / `stash push [-m msg]` → `Saved working directory and index state WIP on main: <sha> <msg>` (or `On main: <msg>`), resets to HEAD; nothing to stash → `No local changes to save`; `stash list` → `stash@{0}: WIP on main: …`; `pop` applies + drops (conflict → keep entry, git message), `apply`, `drop [stash@{n}]` → `Dropped stash@{0} (<id>)`. Untracked files are not stashed (git default).

- [ ] **Step 1: Failing tests:** each reset mode's effect on HEAD/index/workdir; revert of middle commit produces inverse change; cherry-pick onto another branch copies the change with a new id; stash push/list/pop round-trip restores both staged and unstaged changes; `stash pop` with empty stash → `error: No stash entries found.`
- [ ] **Steps 2–4.** **Step 5: Commit** `feat(engine): reset, revert, cherry-pick, stash`.

### Task 8: help, completions, command notes audit

**Files:** Create `commands/help.ts`, `src/engine/completions.ts`; Test `__tests__/{help,completions,notes}.test.ts`.

**Interfaces:** `function getCompletions(w: World, line: string): string[]` — completes shell commands, git subcommands (supported only), flags for the current subcommand, branch names where a rev/branch is expected, file names for add/restore/rm/cat/edit. Returns full candidate words for the last token, sorted.

- [ ] **Step 1: Failing tests:** `git help commit` and `git commit --help` print a 3–6 line plain explanation starting with `git commit — save a snapshot`; `git help` lists supported commands grouped (Basics / Branches / Undo); `getCompletions(w,'git sw')` → `['switch']`; `getCompletions(w,'git switch fe')` → `['feature']`; `getCompletions(w,'cat no')` → `['notes.txt']`. Parametrized notes test: for a table of `[setup lines, command]` covering every state-changing command, `note` is non-null and ≤ 120 chars.
- [ ] **Steps 2–4.** **Step 5: Commit** `feat(engine): help, completions`.

### Task 9: Fidelity harness against real git

**Files:** Create `tests/fidelity/{realGit,scripts,fidelity.test.ts}`, `tests/fidelity/snapshot.ts`; Modify `vite.config.ts` test `include` to add `tests/**`.

**Interfaces:**
```ts
interface Snapshot { head: string /* branch name or 'detached:<msg>' */; branches: Record<string, string /* tip message */>;
                     graph: { msg: string; parents: string[] /* parent messages */ }[] /* sorted by msg */;
                     status: string[] /* porcelain v1 lines, sorted */; files: Tree }
function snapshotSim(w: World): Snapshot;
function snapshotReal(dir: string): Snapshot;        // child_process git in a tmp dir
function runReal(script: string[]): Snapshot;        // runs each line via bash -c in a fresh tmp dir
```
Real git env: `git -c init.defaultBranch=main -c user.name=You -c user.email=you@gitmatic.dev -c advice.detachedHead=false`, `GIT_*_DATE` fixed. Commit messages in scripts are unique. Skip suite when `git` is not on PATH (`describe.skipIf`).

- [ ] **Step 1:** Write ≥12 scripts in `scripts.ts` covering: linear commits; branch + ff merge; diverged merge; conflict then resolve; merge --abort; reset soft/mixed/hard; revert; cherry-pick; stash push/pop; amend; detached commit; restore/--staged; branch -m/-d.
- [ ] **Step 2:** `fidelity.test.ts`: for each script, `expect(snapshotSim(exec(script).world)).toEqual(runReal(script))`.
- [ ] **Step 3:** Run; fix engine discrepancies found (each fix in the owning engine file with a regression unit test).
- [ ] **Step 4:** All pass in CI (ubuntu runner has git).
- [ ] **Step 5: Commit** `test: fidelity harness comparing engine to real git`.

### Task 10: Graph layout

**Files:** Create `src/components/graph/layout.ts`; Test `src/components/graph/layout.test.ts`.

**Interfaces:**
```ts
interface GraphNode { id: Sha; message: string; col: number; lane: number; isHead: boolean }
interface GraphEdge { child: Sha; parent: Sha }
interface GraphLabel { kind: 'branch' | 'head' | 'tag'; name: string; target: Sha; current: boolean }
interface GraphLayout { nodes: GraphNode[]; edges: GraphEdge[]; labels: GraphLabel[]; lanes: number; cols: number; detached: boolean }
function layoutGraph(repo: Repo, wt: WorktreeState): GraphLayout;
```
Algorithm (horizontal, time left→right): nodes = commits reachable from branches, tags, HEAD and stash bases; `col` = rank by `time` ascending (unique per commit). Lanes: iterate branches with `main` first then insertion order; for each, walk first-parent chain from tip assigning unassigned commits that branch's lane (new lane only if it claims ≥1 commit); remaining commits (detached work) get lanes after. HEAD label: if attached, `{kind:'head', target: branch tip}` and the branch label has `current: true`; if detached, `detached: true` and head label targets the commit.

- [ ] **Step 1: Failing tests:** linear 3 commits → one lane, cols 0..2; branch+diverged → `main` lane 0, `feature` lane 1, merge commit on lane 0 with 2 edges; detached commit gets its own lane and `detached: true`; unreachable commits after `reset --hard HEAD~1` are absent; **long history:** 60 commits over 4 branches → no two nodes share `(col, lane)`, `lanes ≤ 5`, runs in < 50 ms.
- [ ] **Steps 2–4.** **Step 5: Commit** `feat(graph): lane layout`.

### Task 11: Store, persistence, presets, suggestions

**Files:** Create `src/store/{storage,sandbox,settings}.ts`, `src/content/{presets,suggestions}.ts`; Test `src/store/sandbox.test.ts`, `src/content/{presets,suggestions}.test.ts`. Add dep `zustand`.

**Interfaces:**
```ts
// storage.ts
const safeStorage: StateStorage;                     // localStorage wrapper; getItem returns null on missing/invalid JSON
// sandbox.ts
interface TermLine { id: number; kind: 'input' | 'out' | 'err' | 'hint' | 'ok' | 'note'; text: string }
type PresetId = 'blank' | 'fresh-project' | 'feature-branch' | 'conflict-waiting';
interface SandboxState { world: World; lines: TermLine[]; history: string[]; presetId: PresetId; editorPath: string | null;
  run(line: string): void; reset(presetId?: PresetId): void; saveFile(path: string, content: string): void; closeEditor(): void }
const useSandbox: UseBoundStore<StoreApi<SandboxState>>;   // persist name 'gitmatic:sandbox', version 1; keeps last 500 lines, 100 history
// settings.ts
interface SettingsState { reduceMotion: boolean; theme: 'dark' | 'light'; setReduceMotion(v: boolean): void; setTheme(t: 'dark' | 'light'): void }
const useSettings;                                   // persist 'gitmatic:settings', version 1
// presets.ts
const PRESETS: Record<PresetId, { title: string; description: string; script: string[] }>;
function buildPreset(id: PresetId): World;           // runs script via runCommand; throws if any line fails
// suggestions.ts
function suggestCommands(w: World): string[];        // ≤ 4 chips
```
`run` appends the input line, output lines, and the note (kind `note`); applies effects (`clear` empties `lines`; `open-editor` sets `editorPath`). Version mismatch or invalid data → `migrate` returns a fresh state from `buildPreset('blank')`.

Suggestions: no repo → `git init`; untracked/modified files → `git status`, `git add <first file>`; staged → `git commit -m "describe your change"`; pending with conflicts → `edit <file>`, `git add <file>`, `git merge --abort`; clean with commits → `git log --oneline`, `git switch -c feature`.

- [ ] **Step 1: Failing tests:** `run('git init')` appends input + ok line + note; `localStorage.setItem('gitmatic:sandbox','{not json')` before store creation → store has blank world and no throw; stored `{version: 0}` → fresh; `reset('conflict-waiting')` → `git merge feature` from that state yields conflict; every preset builds with all lines ok; `suggestCommands` for each state above.
- [ ] **Steps 2–4.** **Step 5: Commit** `feat: sandbox store, persistence, presets`.

### Task 12: Terminal component

**Files:** Create `src/components/terminal/{Terminal,SuggestionChips}.tsx`; Test `Terminal.test.tsx`.

**Interfaces:** `function Terminal(): JSX.Element` — reads/writes `useSandbox`. Input with `$` prompt (shows `(main)` / `(HEAD detached)` / `(main|MERGING)` like git-prompt), Enter runs, ↑/↓ history, Tab completes via `getCompletions` (single → fill; multiple → print candidates as `hint`), Ctrl+L clears, auto-scroll to bottom, click anywhere focuses input. `SuggestionChips({ onPick }: { onPick(cmd: string): void })` fills the input (does not run). Exposes `focusTerminalWithText(text: string)` via a tiny store slice (`useTerminalInput`) so "How do I…?" can fill the input.

- [ ] **Step 1: Failing tests (Testing Library + user-event):** typing `git init⏎` shows `Initialized empty Git repository`; ↑ recalls it; `git sw⇥` becomes `git switch `; clicking chip `git init` fills input without running; prompt shows `(main|MERGING)` in the conflict preset after merge.
- [ ] **Steps 2–4.** **Step 5: Commit** `feat(ui): terminal`.

### Task 13: Graph view, areas strip, files + editor

**Files:** Create `src/components/graph/GraphView.tsx`, `src/components/areas/AreasStrip.tsx`, `src/components/files/{FilePanel,FileEditor}.tsx`; Test `GraphView.test.tsx`, `AreasStrip.test.tsx`, `FilePanel.test.tsx`. Add deps `motion`, `@uiw/react-codemirror`.

**Interfaces:** `GraphView()` renders `layoutGraph` output as SVG: `<g data-commit={id}>` per node (circle + 7-char id + truncated message), edges as smooth paths, labels as pills: branch (solid), current branch (bold + ring), HEAD (distinct shape/arrow; detached = different colour **and** text `HEAD (detached)`). Motion: nodes/labels animate position with spring keyed by id; new nodes pop (scale 0→1), removed fade out (`AnimatePresence`); all durations 0 when `useSettings().reduceMotion` or OS preference (`MotionConfig reducedMotion`). Horizontal scroll keeps HEAD in view. Empty state when no repo/no commits: short hint text.
`AreasStrip()` three columns "Working directory → Staging area → Last commit" from `getStatus` + HEAD tree; badges `new`/`modified`/`deleted`/`conflict` with text, not colour alone.
`FilePanel()` lists files in `workdir`; click → `editorPath`. `FileEditor({ path })`: CodeMirror, Save (Ctrl+S) → `saveFile`, Close; conflict markers highlighted (line decoration).

- [ ] **Step 1: Failing tests:** after `fresh-project` preset, GraphView renders one `[data-commit]` per commit and a label `main` marked current; detached state renders text `HEAD (detached)`; AreasStrip shows `notes.txt` under Staging area with text `modified` after edit+add; **mid-merge edit:** in conflict preset, merge → open `notes.txt` in FileEditor, replace content, save, then `run('git add notes.txt')` → AreasStrip no longer shows `conflict` and prompt drops `|MERGING` after commit.
- [ ] **Steps 2–4.** **Step 5: Commit** `feat(ui): animated graph, areas strip, file editor`.

### Task 14: Free mode screen and "How do I…?"

**Files:** Create `src/screens/FreeModeScreen.tsx`, `src/components/howdoi/HowDoIPanel.tsx`, `src/content/howdoi.ts`, `src/components/ui/{BigButton,Panel}.tsx`; Test `HowDoIPanel.test.tsx`, `src/content/howdoi.test.ts`.

**Interfaces:** `interface HowDoI { id: string; question: string; keywords: string[]; why: string; commands: string[] }`, `const HOW_DO_I: HowDoI[]`. Entries (local-only for M1): undo last commit but keep changes; throw away changes to a file; unstage a file; fix the last commit message; see what I changed; rename a branch; delete a merged branch; park work for later (stash); undo a commit safely (revert); look at an old version (detached); bring one commit to my branch (cherry-pick); abort a messy merge. `HowDoIPanel` = search input (matches question + keywords, case-insensitive) + list; each item shows commands, why, and "Try it" (`focusTerminalWithText(commands[0])`).
Layout: graph (top, largest) / areas strip / terminal + chips (bottom-left) / side panel with tabs "How do I…?" and "Files" (right); preset picker + Reset button in header (Reset asks to confirm).

- [ ] **Step 1: Failing tests:** every `HOW_DO_I` command runs ok against a preset chosen per entry (validate content against the engine); search "undo" returns the undo entries; "Try it" fills the terminal input.
- [ ] **Steps 2–4.** **Step 5: Commit** `feat(ui): free mode screen and How do I panel`.

### Task 15: Title screen, settings, theme — then visual-direction checkpoint

**Files:** Create `src/components/ascii/AsciiTitle.tsx`, `src/screens/{TitleScreen,SettingsScreen}.tsx` (replace placeholders); Modify `src/styles.css` (theme tokens via Tailwind v4 `@theme`); Test `TitleScreen.test.tsx`, `SettingsScreen.test.tsx`.

Look (spec §9, Devin's call): bold flat palette, high contrast, chunky rounded `BigButton`s with big bold text, large display type for headings, monospace for terminal/ids; dark default with light option (`data-theme` on `<html>`). `AsciiTitle`: ASCII "gitmatic" plus a small animated branch-and-merge drawing in ASCII; static when reduced motion. Title screen buttons: "Free mode" (enabled), "Guided lessons" (disabled, "coming soon" text — milestone 2), "Settings". Settings: theme toggle, reduce motion toggle, "Reset sandbox", "Reset everything" (both confirm).

- [ ] **Step 1: Failing tests:** Title renders the three buttons, Guided is disabled; toggling reduce motion persists to `gitmatic:settings`; Reset everything clears both `gitmatic:*` keys.
- [ ] **Steps 2–4.**
- [ ] **Step 5: Commit** `feat(ui): title screen, settings, theme`.
- [ ] **Step 6: Checkpoint — stop.** Open a PR, share screenshots of title + free mode (dark and light) with Rajiv, and wait for his reaction before polishing visuals further. Apply his feedback in this PR.

### Task 16: End-to-end tests and release check

**Files:** Create `playwright.config.ts` (webServer `npm run preview`, baseURL `http://localhost:4173/gitmatic/`), `e2e/free-mode.spec.ts`; Modify `ci.yml` (install Playwright chromium, run `test:e2e`).

- [ ] **Step 1: Write e2e tests:** (a) title → Free mode → type `git init`, `echo "hi" > a.txt`, `git add a.txt`, `git commit -m "first"` → graph shows 1 commit labelled `main`; (b) reload → terminal history and graph persist; (c) choose preset "Conflict waiting", run `git merge feature`, resolve via editor, `git add`, `git commit` → graph shows a merge commit with 2 parents; (d) settings reduce motion toggle survives reload.
- [ ] **Step 2:** `npm run build && npm run test:e2e` → PASS locally; CI green.
- [ ] **Step 3:** After merge, confirm the Pages deploy job succeeded and `https://rkdnc9.github.io/gitmatic/` loads (requires Rajiv's Pages setting from Task 1).
- [ ] **Step 4: Commit** `test: e2e free mode flows`.
