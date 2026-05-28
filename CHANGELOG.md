# Changelog

## 0.0.9 - 2026-05-28

- Simplify nested workspace folder labels in the Workspace Folder Actions picker
  by relying on indentation for the parent-child relationship and showing only
  the nested folder's relative path.

## 0.0.8 - 2026-05-16

- Show nested Git repositories under their parent workspace folders in the
  Workspace Folder Actions picker, with indentation and parent-adjacent
  ordering for easier scanning.
- Store GitHub PR and issue metadata for nested folders in
  `workspaceActions.subFolders[].remote`, and refresh those links alongside
  top-level workspace folder links.
- Support safe nested-folder actions including send to terminal, copy path,
  reveal, pull remote branch, rebase onto base branch, link to GitHub, and open
  saved PR or issue links.
- Remove mnemonic prefixes from the folder picker so it behaves as a plain text
  search list while keeping mnemonic shortcuts in the action picker.
- Add validation and tests for nested Git discovery, `.git` file worktrees,
  symlink escapes, missing saved subfolders, duplicate labels, and nested action
  visibility.

## 0.0.5 - 2026-05-05

- Add `Workspace Actions: Create Workspace` to create and immediately open a
  new `.code-workspace` file under a configured workspace root.

## 0.0.4 - 2026-04-29

- Refresh linked GitHub PR and issue status with a small concurrency queue, so
  `Workspace Actions: Refresh Status` no longer waits for every remote lookup
  one by one.
- Fetch base branch status for multiple Git repositories with the same
  concurrency queue while preserving per-repository remote fallback.
- Keep workspace file updates deterministic by collecting refreshed metadata
  before saving the `.code-workspace` file.
- Add focused tests for the concurrency queue, including worker limits, result
  ordering, and failure capture.

## 0.0.3 - 2026-04-28

- Publish the initial Marketplace-ready Workspace Actions extension.
