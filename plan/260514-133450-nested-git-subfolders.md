# Nested Git Subfolders Plan

## Goal

Show git repositories that live under a workspace folder in the Workspace
Folder Actions picker, and allow safe actions to run against those nested
repositories.

Example picker labels:

```text
home
home/config_files            $(diff-modified)
home/workspace-actions       $(cloud)
home/open-markdown-link
```

## Metadata Model

Store explicit subfolder metadata under the parent workspace folder entry.

```json
{
  "folders": [
    {
      "path": ".",
      "workspaceActions": {
        "subFolders": [
          {
            "path": "config_files"
          },
          {
            "path": "workspace-actions",
            "remote": {
              "kind": "pr",
              "url": "https://github.com/danbi2990/workspace-actions/pull/123",
              "owner": "danbi2990",
              "repo": "workspace-actions",
              "number": 123,
              "status": "open",
              "title": "Add nested repo support"
            }
          }
        ]
      }
    }
  ]
}
```

Rules:

- `subFolders[].path` is always relative to the parent workspace folder.
- `remote` stores GitHub issue or pull request metadata, not just a URL.
- `remote.url` is the canonical URL field for new metadata.
- Readers should accept both `url` and the older top-level `link` field during
  parsing, but writers should emit `url`.
- If both `url` and `link` exist in the same nested `remote`, prefer `url`.
- Keep top-level `workspaceActions.link` unchanged for now. This plan only
  introduces `url` as the canonical field inside `subFolders[].remote`.
- The shape inside `subFolders[].remote` should otherwise match the existing
  top-level GitHub remote metadata shape so refresh, linking, and open-link
  code can reuse the same parser and formatter.
- Runtime actions resolve each subfolder to an absolute path before executing.
- If a discovered nested git repo matches a saved `subFolders[].path`, merge the
  live git state with saved metadata.
- Reject or ignore unsafe paths such as absolute paths, `..` escapes, empty
  paths, `.` paths, and symlink escapes outside the parent workspace folder.
- Normalize paths before comparing so duplicate entries such as `repo`,
  `./repo`, and case-only duplicates on case-insensitive filesystems do not
  produce multiple picker rows.
- Path validation should first do lexical validation with `path.resolve` and
  `path.relative`, then use `realpath` for existing paths before running any
  action.
- A resolved existing subfolder is valid only when both the lexical resolved
  path and the realpath remain inside the parent workspace folder realpath.
- Missing saved subfolders cannot be realpathed. They may be shown as missing
  metadata entries, but no filesystem or git action should run until the path
  exists and passes realpath validation.
- Use `lstat` during discovery to identify symlinks before descending. Do not
  recurse through symlinked directories in the first version.

## Target Model

Do not overload `WorkspaceFolderLike` to represent nested subfolders.

Use an explicit picker target model:

```ts
type WorkspaceActionTarget =
  | {
      kind: "workspaceFolder";
      label: string;
      folderName: string;
      fsPath: string;
      workspaceFolderPath: string;
    }
  | {
      kind: "subFolder";
      label: string;
      folderName: string;
      fsPath: string;
      workspaceFolderPath: string;
      relativePath: string;
      validationState: "valid" | "missing" | "invalid";
      isActionable: boolean;
      remote?: WorkspaceFolderRemoteLinkMetadata;
    };
```

This separation is important because nested subfolders are not VS Code
workspace folders. Action visibility must use `target.kind`, not just whether a
workspace file exists.

For nested subfolders, `isActionable` is true only when the path exists and
passes lexical and realpath validation. Missing or invalid saved subfolders may
still appear so their saved metadata is visible, but they must not run
filesystem or git actions.

## Picker Behavior

- Show normal workspace folders and nested git subfolders in the same picker.
- Use `parent/subfolder` labels for nested entries.
- Keep the existing icon order for state badges where possible.
- Show `$(cloud)` when a nested subfolder has saved `remote` metadata.
- Keep workspace folders and nested subfolders internally distinct even if they
  share the same display picker.
- If a nested label collides with another picker row, add absolute path detail
  so the user can distinguish them.
- Keep search useful by matching both the short `parent/subfolder` label and
  the absolute path detail when practical.

## Git State Policy

Nested repositories should not accidentally double-count parent state.

Initial policy:

- Workspace folder rows keep their current aggregate state behavior for
  backwards compatibility.
- Nested subfolder rows show state for their own resolved git repository.
- If duplicate icons become noisy in practice, add a follow-up mode that hides
  nested repository state from parent rows when nested rows are visible.
- Tests should document the chosen behavior so future refactors do not
  accidentally change it.

## Action Scope

Initial safe actions for nested subfolders:

- Send to Terminal
- Copy Paths
- Reveal in Explorer
- Pull Remote Branch
- Rebase onto Base Branch
- Link to GitHub, storing metadata in `workspaceActions.subFolders[].remote`
- Open PR Or Issue Links only when `remote` metadata exists

Actions to avoid or rename for nested subfolders:

- For missing or realpath-invalid nested subfolders, only show metadata-only
  actions such as Copy Paths and Open PR Or Issue Links when `remote` metadata
  exists. Hide Reveal, Pull Remote Branch, Rebase onto Base Branch, and Link to
  GitHub until the path exists and passes validation.
- Do not show `Remove From Workspace`, because nested subfolders are not VS Code
  workspace folders.
- Do not show `Open PR Or Issue Links` for nested subfolders without saved
  `remote` metadata, even though the current top-level action is always visible.
- Do not show `Pull Base Repository` for nested subfolders in the first version,
  even if the nested repo is represented by a `.git` file or otherwise looks
  worktree-like. Pulling a base repository should remain a top-level linked
  worktree action until nested base-repo semantics are explicit.
- Add a separate `Remove Subfolder Entry` later if saved metadata needs cleanup.
- Do not remove directories or worktrees from nested subfolder actions in the
  first version.
- Never allow a nested target to execute the workspace-folder removal path.

## Discovery Strategy

Start conservative to avoid slowing down the picker.

1. Always include saved `workspaceActions.subFolders`.
2. Discover nested git repositories under each workspace folder with a shallow
   or bounded scan.
3. Exclude noisy directories such as `.git`, `node_modules`, `target`, `dist`,
   `build`, `.cache`, and hidden vendor/cache folders.
4. Cache discovery results briefly so opening the picker stays fast.

Recommended first implementation:

- Discover depth 2 under each workspace folder.
- Detect both `.git` directories and `.git` files so worktrees and submodules
  are not missed.
- Prefer `git -C <path> rev-parse --show-toplevel` or equivalent validation
  when a candidate is ambiguous.
- Do not recurse into ignored/noisy directories.
- Refresh discovery asynchronously after showing the initial picker, similar to
  the current folder-state loading pattern.
- Use the existing limited concurrency utility when probing multiple candidate
  directories.
- Cache discovery with a short TTL and invalidate when the workspace file
  changes, workspace folders change, or the user runs Refresh Status.
- If two picker openings happen while discovery is already running, either
  share the in-flight discovery promise or isolate updates by generation id.
  Do not allow a late async discovery result from an old picker state to replace
  newer picker items.
- Avoid following symlink loops. If symlinks are followed later, track realpaths
  to prevent cycles.

## Refresh Status

`Workspace Actions: Refresh Status` must update nested remote metadata too.

Required behavior:

- Read top-level workspace folder metadata and nested `subFolders[].remote`
  metadata in one pass.
- Refresh PR/issue state for both top-level and nested remotes using the same
  concurrency queue.
- Write refreshed nested metadata back to
  `workspaceActions.subFolders[].remote`.
- Preserve deterministic workspace file formatting and row order.
- Clear or invalidate any nested target cache after refresh.
- Report refreshed remote status counts in a way that includes nested remotes,
  or split the message if separate counts are more useful.

## Implementation Steps

1. Extend workspace-file parsing/writing to read and update
   `workspaceActions.subFolders`.
2. Add internal types for picker targets so workspace folders and nested
   subfolders are distinct.
3. Build picker items from workspace folders, saved subfolders, and discovered
   nested git repositories.
4. Reuse existing folder status logic against resolved absolute subfolder paths.
5. Adjust action visibility so nested subfolders only see safe actions.
6. Add link-to-GitHub support for nested subfolders by writing
   `subFolders[].remote`.
7. Extend Refresh Status to refresh nested `remote` metadata.
8. Add cache invalidation for workspace file changes, workspace folder changes,
   and explicit refresh.
9. Add tests for metadata parsing, picker labels, duplicate merge behavior,
   action visibility, and remote metadata updates.

## Test Plan

- Reads `workspaceActions.subFolders` from a workspace folder entry.
- Writes new subfolder metadata using a relative path.
- Reads `remote.url`, accepts legacy `remote.link` when present, and writes
  `remote.url`.
- When both `remote.url` and `remote.link` are present, reads `remote.url`.
- Writing `subFolders[].remote` preserves existing top-level
  `workspaceActions.link` and sibling top-level metadata.
- Writing or refreshing top-level `workspaceActions.link` metadata preserves
  existing `workspaceActions.subFolders` entries and their nested `remote`
  metadata.
- Merges saved metadata with a discovered nested git repository.
- Shows nested labels as `parent/subfolder`.
- Adds path detail or another disambiguator for duplicate labels.
- Shows the cloud icon for nested entries with `remote` metadata.
- Hides `Remove From Workspace` for nested subfolders.
- Hides `Open PR Or Issue Links` for nested subfolders without `remote`
  metadata.
- Shows `Open PR Or Issue Links` for nested subfolders with `remote` metadata.
- Hides `Pull Base Repository` for all nested subfolders in the first version.
- Hides filesystem and git actions for missing or realpath-invalid nested
  subfolders.
- Allows only metadata-safe actions for missing or invalid nested subfolders,
  such as opening saved remote metadata when present.
- Prevents nested subfolders from executing workspace-folder removal even if an
  action item is constructed incorrectly.
- Allows terminal/copy/reveal/pull/rebase actions for nested subfolders.
- Stores GitHub metadata under `subFolders[].remote` when linking a nested
  subfolder.
- Refreshes nested PR/issue remote status and writes it back to the workspace
  file.
- Preserves parent/nested git state behavior according to the documented
  aggregate-state policy.
- Specifically covers the current aggregate policy: a parent workspace row
  still shows dirty/behind state from a nested repository, and the nested row
  also shows its own dirty/behind state.
- Adds a regression test that would fail if parent rows silently switch to
  direct-repository-only state.
- Rejects or ignores invalid `subFolders[].path` values: absolute path,
  `../escape`, `.`, empty string, symlink escape, and normalized duplicates.
- Covers existing symlink escape, missing saved subfolder, and non-descended
  symlink directory discovery cases.
- Discovers both `.git` directory repositories and `.git` file worktrees.
- Merges saved, missing, and discovered subfolders deterministically.
- Does not scan noisy directories during nested git discovery.
- Covers cache hit, cache miss, workspace file invalidation, workspace folder
  change invalidation, explicit Refresh Status invalidation, concurrent picker
  opens, and ignored late async discovery updates.

## Open Questions

- Should nested subfolders get their own mnemonic sequence or share the same
  sequence with top-level workspace folders?
- Should nested discovery be configurable by depth?
- Should `remote.provider` be added now, or only when another provider appears?
- Should missing saved `subFolders` be shown with a warning icon or hidden until
  cleanup UX exists?
