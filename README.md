# Workspace Actions

Workspace Actions is a VS Code extension for working with multi-root
workspaces, local Git worktrees, and GitHub-linked folders without leaving the
keyboard.

It helps you:
- create a new `.code-workspace` file and open it immediately
- add existing folders to the current `.code-workspace`
- create a new folder and add it to the workspace in one flow
- create a local worktree from a GitHub issue or pull request URL and add it
  to the current workspace
- discover nested Git repositories and run safe actions without adding them as
  workspace folders
- open a folder action menu to send paths to the terminal, copy paths, reveal
  folders, open saved links, pull updates, or remove folders
- refresh saved PR or issue status together with base-branch fetch state

## Requirements

- VS Code 1.105 or newer.
- `git` must be available on your PATH for worktree, fetch, pull, and rebase
  actions.
- GitHub-related actions require the GitHub CLI (`gh`) to be available on your
  PATH and authenticated with `gh auth login`.

## Quick Start

1. Set `workspaceActions.workspaceRoots` to the root folders where new
   workspaces should be created.
2. Set `workspaceActions.workspaceFolderRoots` to the root folders you want to
   browse when adding workspace folders and where local repositories can be
   found when creating worktrees from GitHub URLs.
3. Optionally set `workspaceActions.baseBranch` if your default base branch is
   not `main`.
4. Run one of the commands below from the Command Palette.

## Commands

### Workspace Actions: Create Workspace

Reads roots from `workspaceActions.workspaceRoots`.

If more than one root is configured, the extension first asks where to create
the workspace. It then asks for a workspace name and creates:

```text
<workspace-root>/<workspace-name>/<workspace-name>.code-workspace
```

The created workspace file includes its containing folder as the first
workspace folder and uses the workspace name as the window title:

```json
{
  "folders": [
    {
      "path": "."
    }
  ],
  "settings": {
    "window.title": "<workspace-name>"
  }
}
```

After writing the file, the extension opens the new workspace.

### Workspace Actions: Add Workspace Folder

Reads roots from `workspaceActions.workspaceFolderRoots`.

If more than one root is configured, the extension first asks which root to
browse. It then shows folders under that root in updated-time descending order
and lets you either:
- pick an existing folder
- create a new folder from the same picker

The selected folder is added to the current `.code-workspace` file using an
absolute path.

Workspace file updates preserve existing JSONC comments. Comments inside a
folder entry are removed only when that folder entry itself is removed.

### Workspace Actions: Add Local Worktree from GitHub Issue or PR URL

Accepts a GitHub issue or pull request URL, creates a local worktree, and adds
the new folder to the current `.code-workspace` file with saved
`workspaceActions` metadata.

That metadata includes:
- the linked GitHub URL
- the linked item type
- the last refreshed remote status snapshot

For pull requests, the created local branch also tracks the PR head branch so
upstream updates can be detected and pulled cleanly.

The same `workspaceActions.workspaceFolderRoots` setting lets this command find
the existing local repository from which it creates the worktree.

This flow is opinionated and works best in setups where your local repositories
and worktrees live under predictable root folders.

### Workspace Actions: Workspace Folder Actions

Always starts with a target picker, even when only one workspace folder is open.
The picker lists top-level workspace folders and automatically discovers nested
Git repositories up to two directory levels below them. Nested repositories
appear directly below their parent as indented relative paths.

Saved nested entries that are missing or fail path validation may still appear,
but only metadata-safe actions are available. After you choose a target, the
extension opens its action picker.

The target picker uses normal text search. The action picker supports the
single-key mnemonics shown in square brackets.

The default shortcut is `Cmd+Ctrl+L` on macOS and `Ctrl+Alt+L` on Windows and
Linux.

Available actions:
- `[T] Send to Terminal`
  Available for top-level folders and valid nested repositories.
- `[C] Copy Paths`
  Available for every picker entry.
- `[O] Open PR Or Issue Links`
  Available for top-level folders and nested entries with saved remote
  metadata.
- `[L] Link to GitHub`
  Available for a single top-level folder or valid nested repository in a saved
  workspace file.
- `[P] Pull Remote Branch`
  Available when the selected target's current branch tracks an upstream.
- `[B] Pull Base Repository`
  Available for top-level Git worktrees only.
- `[M] Rebase onto Base Branch`
  Available when a valid target's current branch is behind the configured base
  branch.
- `[R] Reveal in Explorer`
  Available for a single existing, valid target.
- `[D] Remove From Workspace`
  Available for top-level workspace folders only, never nested repositories.

`Remove From Workspace` always asks for confirmation. A regular folder or
missing entry is removed only from the workspace; existing folder contents
remain on disk. A Git worktree with uncommitted changes is not removed. After
confirmation, Workspace Actions removes a clean worktree directory, attempts to
delete its checked-out local branch with `git branch -d`, and then removes the
workspace entry. If Git rejects the branch deletion, the extension reports a
warning.

`Send to Terminal` and `Copy Paths` always use the selected target's absolute
path.

### Workspace Actions: Refresh Status

Refreshes saved PR or issue status for linked top-level workspace folders and
linked nested repositories. It also fetches the configured base branch without
changing checked out files.

## Picker State

The target picker uses the current `.code-workspace` file as the source of truth
for top-level `workspaceActions` metadata and nested
`workspaceActions.subFolders[].remote` metadata. Targets without saved remote
metadata are treated as unlinked.

It also discovers nested Git repositories from the filesystem and inspects
filesystem and Git state for:
- branch drift from the configured upstream
- branch drift from the configured base branch
- local Git changes
- unsaved editors
- workspace folders that are missing from disk

The picker shows one row for each top-level workspace folder and nested target.
Nested targets are grouped directly below their parent and use indented
relative-path labels.

Marker meanings:
- `$(cloud)` target has a saved PR or issue link
- `$(pass-filled)` a top-level linked worktree belongs to a merged PR or closed
  issue
- `$(circle-slash)` a top-level linked worktree belongs to a PR that closed
  without being merged
- `$(warning)` workspace folder entry is missing from disk
- `$(cloud-download)` branch is behind its configured upstream
- `$(git-pull-request-draft)` branch is behind the configured base branch
- `$(diff-modified)` repository has Git changes
- `$(primitive-dot)` top-level folder contains unsaved editors, or a removable
  worktree has uncommitted changes

## Notes

- `Pull Remote Branch` updates the selected folder's current branch from its
  configured upstream.
- `Pull Base Repository` updates the underlying base repository for a top-level
  Git worktree.
- `Rebase onto Base Branch` fetches the configured base branch and rebases the
  selected folder onto the latest base ref.
- Default action-picker mnemonics:
  `T`, `C`, `O`, `L`, `P`, `B`, `M`, `R`, `D`
