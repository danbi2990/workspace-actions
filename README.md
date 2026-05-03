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
- open a folder action menu to send paths to the terminal, copy paths, reveal
  folders, open saved links, pull updates, or remove folders
- refresh saved PR or issue status together with base-branch fetch state

## Requirements

- `git` must be available on your PATH for worktree, fetch, pull, and rebase
  actions.
- GitHub-related actions require the GitHub CLI (`gh`) to be available on your
  PATH and authenticated with `gh auth login`.

## Quick Start

1. Set `workspaceActions.workspaceRoots` to the root folders where new
   workspaces should be created.
2. Set `workspaceActions.workspaceFolderRoots` to the root folders you want to
   browse when adding workspace folders.
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
workspace folder:

```json
{
  "folders": [
    {
      "path": "."
    }
  ],
  "settings": {}
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

The same `workspaceActions.workspaceFolderRoots` setting is also used later
when linked worktree actions need to find the local base repository on disk.

This flow is opinionated and works best in setups where your local repositories
and worktrees live under predictable root folders.

### Workspace Actions: Workspace Folder Actions

Always starts with a workspace-folder picker, even when only one workspace
folder is open. After you choose a folder, it opens an action picker for that
folder.

Both pickers support single-key mnemonics for fast keyboard navigation.

Available actions:
- `[T] Send to Terminal`
- `[C] Copy Paths`
- `[O] Open PR Or Issue Links`
- `[L] Link to GitHub`
  Available for a single workspace folder in a saved workspace file.
- `[P] Pull Remote Branch`
- `[B] Pull Base Repository`
  Available for linked Git worktrees.
- `[M] Rebase onto Base Branch`
  Available when the current branch is behind the configured base branch.
- `[R] Reveal in Explorer`
  Available for a single existing folder.
- `[D] Remove From Workspace`
  Always removes the selected folder from the workspace. If the folder is a
  linked Git worktree, it removes the worktree too.

`Send to Terminal` and `Copy Paths` always use absolute workspace-folder paths.

### Workspace Actions: Refresh Status

Refreshes saved PR or issue status for linked workspace folders and fetches the
configured base branch without changing checked out files.

## Picker State

The workspace-folder picker uses the current `.code-workspace` file as the
source of truth for saved PR and issue links. Folders without saved
`workspaceActions` metadata are treated as unlinked.

It still inspects the filesystem and Git state for:
- branch drift from the configured upstream
- branch drift from the configured base branch
- local Git changes
- unsaved editors
- workspace folders that are missing from disk

The picker shows a single line per workspace folder.

Marker meanings:
- `$(cloud)` folder has a saved PR or issue link
- `$(cloud-download)` branch is behind its configured upstream
- `$(git-pull-request-draft)` branch is behind the configured base branch
- `$(diff-modified)` repository has Git changes
- `$(primitive-dot)` workspace folder contains unsaved editors

## Notes

- `Pull Remote Branch` updates the selected folder's current branch from its
  configured upstream.
- `Pull Base Repository` updates the underlying base repository for a linked
  Git worktree.
- `Rebase onto Base Branch` fetches the configured base branch and rebases the
  selected folder onto the latest base ref.
- Default folder picker mnemonics:
  `A`, `S`, `D`, `F`, `G`, `H`, `J`, `K`, `L`, `;`, `Q`, `W`, `E`, `R`, `T`,
  `Y`, `U`, `I`, `O`, `P`, `Z`, `X`, `C`, `V`, `B`, `N`, `M`, `,`, `.`
- Default action picker mnemonics:
  `T`, `C`, `O`, `L`, `P`, `B`, `M`, `R`, `D`
