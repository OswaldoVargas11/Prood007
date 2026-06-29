# Agent Worktrees — Isolated Git Workspaces Per Task

> Implemented: LAW-10 | Status: Active

## Problem

All Paperclip agents currently share one worktree (`Prod007-agents`, branch `fix/law-2-fiscal-seams`) under `PAPERCLIP_WORKSPACE_STRATEGY=project_primary`. Editing files in parallel leads to collisions and broken state.

## Solution

Each implementing agent creates an **isolated git worktree** branched from `agents/sandbox`, does all work there, and merges back when done. Parallel tasks never touch the same working tree.

```
Prod007/                          ← main repo
  .claude/worktrees/
    wt-law-7/   [wt/law-7]       ← Agent A works here
    wt-law-8/   [wt/law-8]       ← Agent B works here (no collision)
    wt-law-9/   [wt/law-9]       ← Agent C works here
agents/sandbox                    ← integration branch (merge target)
```

---

## Helper Script

```
scripts/agent-worktree.sh  open|merge|close|list  [TASK_ID]
```

### Commands

| Command | Effect |
|---|---|
| `open <task>` | Create worktree `wt-<task>` on new branch `wt/<task>` from `agents/sandbox` |
| `merge <task>` | Merge `wt/<task>` into `agents/sandbox` via temp worktree (no-ff) |
| `close <task>` | Remove worktree dir and delete branch |
| `list` | Show all active task worktrees |

---

## Lifecycle — Full Example

### 1. Open (run once at task start)

```bash
# From Prod007-agents (or any other worktree in the repo):
./scripts/agent-worktree.sh open law-7
# → creates: Prod007/.claude/worktrees/wt-law-7/  on branch wt/law-7
# → based on: agents/sandbox
```

### 2. Work in the isolated worktree

The agent's CWD is `Prod007/.claude/worktrees/wt-law-7/`. All edits, installs, and builds happen there. Other agents work in their own `wt-law-N/` dirs simultaneously — no overlap.

```bash
# Inside the worktree:
cd /c/Users/OswaldoVargasRodrigu/Prod007/.claude/worktrees/wt-law-7
# ... implement feature ...
git add -p
git commit -m "feat(law-7): ..."
```

### 3. Merge back to agents/sandbox

```bash
# From Prod007-agents (the shared hub worktree):
./scripts/agent-worktree.sh merge law-7
# → creates a temp sandbox worktree, runs --no-ff merge, removes temp worktree
```

If there are conflicts, the script stops and leaves the temp merge worktree open so the agent can resolve them manually, then re-run `merge`.

### 4. Close (cleanup)

```bash
./scripts/agent-worktree.sh close law-7
# → removes Prod007/.claude/worktrees/wt-law-7/ and deletes branch wt/law-7
```

---

## Conventions

| Item | Convention |
|---|---|
| Branch name | `wt/<TASK_ID>` (e.g. `wt/law-7`) |
| Worktree path | `<MAIN_ROOT>/.claude/worktrees/wt-<TASK_ID>/` |
| Base branch | `agents/sandbox` (always up to date before opening) |
| Merge style | `--no-ff` (preserves task history) |
| Commit scope | Only within the task worktree; never push to prod/main |
| Cleanup | Always `close` after merge; stale worktrees block branch deletion |

---

## Rules

1. **Never edit files in `Prod007-agents` (the shared worktree) when implementing a task.** Use a dedicated `wt-<task>` worktree.
2. **One branch per task.** Do not reuse a `wt/law-N` branch for a different task.
3. **Merge then close in sequence.** Closing before merging discards all work.
4. **Keep `agents/sandbox` as the merge target.** Never merge task branches directly to `main`.
5. **Push is blocked for agents.** Deliverable = commit on `agents/sandbox` + comment on the Paperclip issue. The owner handles push/PR/merge to main.

---

## Owner Action Required — Paperclip Workspace Strategy

The current strategy keeps all agents in a single shared worktree. To have Paperclip assign each agent run its own isolated worktree **automatically** (without agents needing to call the script manually), the owner must change the project workspace strategy.

### What to change

**Current value**: `PAPERCLIP_WORKSPACE_STRATEGY=project_primary`

**Target value**: `PAPERCLIP_WORKSPACE_STRATEGY=worktree_per_run`

(If `worktree_per_run` is not a recognized value, check the Paperclip project settings UI at `http://127.0.0.1:3100` → Project → Workspace → Strategy for the list of valid options.)

### Where to change it

Paperclip does not expose `PAPERCLIP_WORKSPACE_STRATEGY` in `~/.paperclip/instances/default/config.json` (that file controls DB, logging, server, storage, secrets). The workspace strategy is a **per-project** setting managed through the Paperclip UI or CLI:

1. Open Paperclip at `http://127.0.0.1:3100`
2. Navigate to the **Lawzora** project → **Settings** → **Workspace**
3. Change **Strategy** from `project_primary` to `worktree_per_run`
4. Save and restart any running agent sessions

### What this change does

| Strategy | Behavior |
|---|---|
| `project_primary` | All agents share `Prod007-agents` (current — serial only) |
| `worktree_per_run` | Each agent run gets its own worktree under `.claude/worktrees/` — fan-out safe |

**Until the owner makes this change**, agents must use `scripts/agent-worktree.sh` manually to get isolation. The script is functional today and does NOT require the Paperclip-level change to work.

---

## Verifying the Setup Does Not Break the Shared Tree

The shared worktree (`Prod007-agents`) is unaffected by adding new worktrees. Git worktrees are additive — existing branches and working trees are unchanged. You can verify:

```bash
# From Prod007-agents:
git worktree list          # shows all worktrees; Prod007-agents entry unchanged
./scripts/agent-worktree.sh list   # shows only task worktrees
git status                 # clean (no changes in shared tree)
```

---

## FAQ

**Can two agents merge to `agents/sandbox` simultaneously?**
No — the merge step is serial because `agents/sandbox` is a single branch. Merges should be sequential (Aurora coordinates). The working/building phase is fully parallel.

**What if `agents/sandbox` has moved ahead since I opened my worktree?**
Before merging, rebase your task branch: `git -C <wt-path> rebase agents/sandbox`. Then run `merge`.

**Can I use PowerShell instead of Git Bash?**
The script requires Bash. On Windows, run it via Git Bash (`bash scripts/agent-worktree.sh open law-7`) or use the equivalent `git worktree` commands directly in PowerShell.
