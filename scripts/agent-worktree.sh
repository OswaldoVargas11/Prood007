#!/usr/bin/env bash
# Agent worktree helper — open/merge/close isolated git worktrees per task.
#
# Each agent task gets its own worktree branched from agents/sandbox.
# This allows parallel agent execution without file-tree collisions.
#
# Usage:
#   ./scripts/agent-worktree.sh open  <TASK_ID>   # create worktree
#   ./scripts/agent-worktree.sh merge <TASK_ID>   # merge back to agents/sandbox
#   ./scripts/agent-worktree.sh close <TASK_ID>   # remove worktree + branch
#   ./scripts/agent-worktree.sh list              # list active task worktrees
#
# Convention:
#   branch  : wt/<TASK_ID>              (e.g. wt/law-7)
#   path    : <MAIN_ROOT>/.claude/worktrees/wt-<TASK_ID>
#   base    : agents/sandbox

set -euo pipefail

# Resolve the main git repo root regardless of which worktree we're called from.
MAIN_ROOT="$(git rev-parse --git-common-dir)"
MAIN_ROOT="${MAIN_ROOT%/.git}"   # strip trailing /.git
# On Windows/Git Bash git --git-common-dir may return the .git path directly
if [[ "$MAIN_ROOT" == *.git ]]; then
  MAIN_ROOT="${MAIN_ROOT%.git}"
  MAIN_ROOT="${MAIN_ROOT%/}"
fi

WT_BASE="${MAIN_ROOT}/.claude/worktrees"
SANDBOX="agents/sandbox"

usage() {
  echo "Usage: $0 <open|merge|close|list> [TASK_ID]"
  exit 1
}

cmd="${1:-}"
task="${2:-}"

case "$cmd" in
  open)
    [[ -z "$task" ]] && usage
    branch="wt/$task"
    path="${WT_BASE}/wt-${task}"

    if git -C "$MAIN_ROOT" worktree list | grep -q "wt-${task}"; then
      echo "Worktree already exists: $path"
      echo "Run: $path"
      exit 0
    fi

    echo "Creating worktree wt-${task} from $SANDBOX..."
    git -C "$MAIN_ROOT" worktree add "$path" -b "$branch" "$SANDBOX"
    echo ""
    echo "Worktree ready. Work inside:"
    echo "  $path"
    echo ""
    echo "When done, run:"
    echo "  $0 merge $task   # merge back to $SANDBOX"
    echo "  $0 close $task   # cleanup"
    ;;

  merge)
    [[ -z "$task" ]] && usage
    branch="wt/$task"
    path="${WT_BASE}/wt-${task}"
    merge_wt="${WT_BASE}/wt-sandbox-merge-${task}"

    if ! git -C "$MAIN_ROOT" branch --list "$branch" | grep -q .; then
      echo "ERROR: Branch $branch not found. Did you run 'open' first?"
      exit 1
    fi

    # Check for uncommitted changes in the task worktree
    if [[ -d "$path" ]] && ! git -C "$path" diff --quiet --cached --exit-code 2>/dev/null; then
      echo "ERROR: Task worktree $path has staged but uncommitted changes. Commit first."
      exit 1
    fi

    echo "Creating temporary merge worktree for $SANDBOX..."
    git -C "$MAIN_ROOT" worktree add "$merge_wt" "$SANDBOX"

    echo "Merging $branch into $SANDBOX..."
    git -C "$merge_wt" merge --no-ff "$branch" -m "merge(${branch}): into ${SANDBOX} [LAW-10]"

    echo "Removing temporary merge worktree..."
    git -C "$MAIN_ROOT" worktree remove "$merge_wt" --force

    echo ""
    echo "Merged $branch → $SANDBOX successfully."
    echo "Run: $0 close $task   # to remove worktree + branch"
    ;;

  close)
    [[ -z "$task" ]] && usage
    branch="wt/$task"
    path="${WT_BASE}/wt-${task}"

    echo "Removing worktree $path..."
    git -C "$MAIN_ROOT" worktree remove "$path" --force 2>/dev/null || true

    echo "Deleting branch $branch..."
    git -C "$MAIN_ROOT" branch -d "$branch" 2>/dev/null || \
      git -C "$MAIN_ROOT" branch -D "$branch" 2>/dev/null || true

    echo "Done. Worktree wt-${task} closed."
    ;;

  list)
    echo "Active task worktrees:"
    git -C "$MAIN_ROOT" worktree list | grep "/wt-" || echo "  (none)"
    ;;

  *)
    usage
    ;;
esac
