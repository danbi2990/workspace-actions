# Changelog

## 0.0.11 - 2026-07-28

- Clarify worktree removal prompts and documentation, including dirty-worktree
  protection and the best-effort local branch deletion with `git branch -d`.
- Bring the README in sync with nested repository discovery, current picker
  shortcuts, action availability, and status markers.
- Exclude historical implementation plans from packaged extensions.

## 0.0.10 - 2026-07-27

- Set the window title of newly created workspaces to the workspace name.
- Preserve surrounding JSONC comments when updating folders and metadata in
  saved workspace files.

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

## 0.0.7 - 2026-05-10

- Fix activation of the bundled extension and add a regression test that loads
  the compiled bundle with VS Code as its only external module.

## 0.0.6 - 2026-05-10

- Switch dependency management and extension packaging from npm to pnpm and
  esbuild.
- Add GitHub Actions CI to test and package the extension on pushes and pull
  requests.

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

## 0.0.3 - 2026-04-27

- Broaden the Marketplace description to cover multi-root workspaces, local Git
  worktrees, and GitHub-linked folders.

## 0.0.2 - 2026-04-24

- Add a Marketplace icon and document the required Git and GitHub CLI setup.

## 0.0.1 - 2026-04-23

- Publish the initial Marketplace-ready Workspace Actions extension with
  production packaging and public publisher and repository metadata.
