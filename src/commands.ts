import * as path from "node:path";
import {
  parseGitHubIssueOrPullRequestUrl,
  type WorkspaceFolderRemoteLinkMetadata,
} from "./prCleanup";
import type { UpdateWorkspaceFileResult } from "./workspaceFile";

export const COPY_WORKSPACE_FOLDER_PATHS_COMMAND =
  "workspace-actions.copyWorkspaceFolderPaths";
export const ADD_WORKSPACE_FOLDER_COMMAND =
  "workspace-actions.addWorkspaceFolder";
export const ADD_LOCAL_WORKTREE_FROM_GITHUB_URL_COMMAND =
  "workspace-actions.addLocalWorktreeFromGitHubUrl";
export const CREATE_WORKSPACE_COMMAND =
  "workspace-actions.createWorkspace";

export interface UriLike {
  fsPath: string;
}

export interface WorkspaceFolderLike {
  name: string;
  uri: UriLike;
}

export interface QuickPickItemLike {
  label: string;
  folder: WorkspaceFolderLike;
  folderState?: FolderUiState;
  cleanupCandidate?: WorkspaceCleanupCandidate;
}

export interface WorkspaceFolderQuickPickItem extends QuickPickItemLike {
  mnemonic?: string;
}

export interface WorkspaceFolderCandidate {
  name: string;
  fsPath: string;
  updatedAt: number;
}

export interface WorkspaceFolderRootQuickPickItem {
  label: string;
  detail?: string;
  rootPath: string;
}

export interface AddWorkspaceFolderQuickPickItem {
  label: string;
  detail?: string;
  description?: string;
  candidate?: WorkspaceFolderCandidate;
  itemKind: "create" | "folder";
}

export interface FolderUiState {
  isGitWorktree: boolean;
  hasGitChanges: boolean;
  hasRemoteBranchTracking: boolean;
  remoteBranchMoved: boolean;
  baseBranchMoved: boolean;
  dirtyEditors: number;
}

export interface PrWorktreeCandidate {
  kind: "pr";
  folderName: string;
  folderPath: string;
  branchName: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  prState: "closed" | "merged";
  isDirty: boolean;
}

export interface MissingWorkspaceFolderCandidate {
  kind: "missing";
  folderName: string;
  folderPath: string;
}

export interface IssueWorktreeCandidate {
  kind: "issue";
  folderName: string;
  folderPath: string;
  branchName: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  isDirty: boolean;
}

export interface GenericWorktreeCandidate {
  kind: "worktree";
  folderName: string;
  folderPath: string;
  isDirty: boolean;
}

export interface WorkspaceFolderRemovalCandidate {
  kind: "folder";
  folderName: string;
  folderPath: string;
}

export type WorkspaceCleanupCandidate =
  | PrWorktreeCandidate
  | MissingWorkspaceFolderCandidate
  | IssueWorktreeCandidate
  | GenericWorktreeCandidate
  | WorkspaceFolderRemovalCandidate;

export interface PrWorktreeQuickPickItem {
  label: string;
  detail?: string;
  candidate: WorkspaceCleanupCandidate;
}

export interface WorkspaceFolderLinkTarget {
  kind: "pr" | "issue";
  url: string;
}

export interface CreatedWorkspaceFolderFromUrl {
  folderPath: string;
  metadata: WorkspaceFolderRemoteLinkMetadata;
}

export type WorkspaceFolderActionKind =
  | "sendToTerminal"
  | "copyPaths"
  | "openLinks"
  | "linkToGitHub"
  | "pullRemoteBranch"
  | "pullBaseRepository"
  | "rebaseOntoBaseBranch"
  | "revealInExplorer"
  | "removeCleanupItems";

export interface WorkspaceFolderActionQuickPickItem {
  label: string;
  detail?: string;
  action: WorkspaceFolderActionKind;
}

interface WorkspaceFolderActionDefinition {
  label: string;
  action: WorkspaceFolderActionKind;
}

const WORKSPACE_FOLDER_MNEMONICS = "asdfghjkl;qwertyuiopzxcvbnm,.";
const WORKSPACE_FOLDER_ACTION_MNEMONIC_PATTERN = /^\[([A-Za-z])\]/;

export interface CopyWorkspaceFolderPathsDependencies {
  workspaceFolders: readonly WorkspaceFolderLike[] | undefined;
  getFolderUiState(folder: WorkspaceFolderLike): Thenable<FolderUiState>;
  inspectWorkspaceFolder(
    folder: WorkspaceFolderLike,
  ): Thenable<WorkspaceCleanupCandidate | undefined>;
  showQuickPick(
    items: readonly WorkspaceFolderQuickPickItem[],
    options: {
      placeHolder: string;
      loadItems?: (
        updateItems: (items: readonly WorkspaceFolderQuickPickItem[]) => void,
      ) => Promise<void>;
    },
  ): Thenable<WorkspaceFolderQuickPickItem | undefined>;
  showActionQuickPick(
    items: readonly WorkspaceFolderActionQuickPickItem[],
    options: { placeHolder: string },
  ): Thenable<WorkspaceFolderActionQuickPickItem | undefined>;
  resolveWorkspaceFolderLink(
    folder: WorkspaceFolderLike,
  ): Thenable<WorkspaceFolderLinkTarget | undefined>;
  linkWorkspaceFolderToGitHub(folder: WorkspaceFolderLike): Thenable<void>;
  sendTextToTerminal(text: string): Thenable<void>;
  copyText(text: string): Thenable<void>;
  openExternalUrls(urls: readonly string[]): Thenable<void>;
  revealPath(fsPath: string): Thenable<void>;
  pullRemoteBranches(folderPaths: readonly string[]): Thenable<void>;
  pullBaseRepositories(folderPaths: readonly string[]): Thenable<void>;
  rebaseOntoBaseBranch(folderPath: string): Thenable<void>;
  workspaceFilePath: string | undefined;
  confirmRemoval(message: string): Thenable<boolean>;
  removeWorktree(folderPath: string): Thenable<void>;
  removeFolderFromWorkspace(
    workspaceFilePath: string,
    folderPath: string,
  ): Thenable<void>;
  showInformationMessage(message: string): Thenable<string | undefined>;
  showWarningMessage(message: string): Thenable<string | undefined>;
  showErrorMessage(message: string): Thenable<string | undefined>;
}

export interface RemoveClosedOrMergedPrWorktreesDependencies {
  workspaceFolders: readonly WorkspaceFolderLike[] | undefined;
  workspaceFilePath: string | undefined;
  inspectWorkspaceFolder(
    folder: WorkspaceFolderLike,
  ): Thenable<WorkspaceCleanupCandidate | undefined>;
  showQuickPick(
    items: readonly PrWorktreeQuickPickItem[],
    options: { placeHolder: string },
  ): Thenable<PrWorktreeQuickPickItem | undefined>;
  confirmRemoval(message: string): Thenable<boolean>;
  removeWorktree(folderPath: string): Thenable<void>;
  removeFolderFromWorkspace(
    workspaceFilePath: string,
    folderPath: string,
  ): Thenable<void>;
  showInformationMessage(message: string): Thenable<string | undefined>;
  showWarningMessage(message: string): Thenable<string | undefined>;
  showErrorMessage(message: string): Thenable<string | undefined>;
}

export interface AddWorkspaceFolderDependencies {
  workspaceFilePath: string | undefined;
  workspaceFolderRoots: readonly string[] | undefined;
  pathExists(fsPath: string): boolean;
  listWorkspaceFolderCandidates(
    rootPath: string,
  ): Thenable<readonly WorkspaceFolderCandidate[]>;
  showRootQuickPick(
    items: readonly WorkspaceFolderRootQuickPickItem[],
    options: { placeHolder: string },
  ): Thenable<WorkspaceFolderRootQuickPickItem | undefined>;
  showFolderQuickPick(
    items: readonly AddWorkspaceFolderQuickPickItem[],
    options: { placeHolder: string },
  ): Thenable<AddWorkspaceFolderQuickPickItem | undefined>;
  showInputBox(options: {
    placeHolder: string;
    prompt: string;
  }): Thenable<string | undefined>;
  createDirectory(fsPath: string): Thenable<void>;
  addFolderToWorkspace(
    workspaceFilePath: string,
    folderPath: string,
  ): Thenable<UpdateWorkspaceFileResult>;
  showInformationMessage(message: string): Thenable<string | undefined>;
  showWarningMessage(message: string): Thenable<string | undefined>;
  showErrorMessage(message: string): Thenable<string | undefined>;
}

export interface CreateWorkspaceDependencies {
  workspaceRoots: readonly string[] | undefined;
  pathExists(fsPath: string): boolean;
  showRootQuickPick(
    items: readonly WorkspaceFolderRootQuickPickItem[],
    options: { placeHolder: string },
  ): Thenable<WorkspaceFolderRootQuickPickItem | undefined>;
  showInputBox(options: {
    placeHolder: string;
    prompt: string;
  }): Thenable<string | undefined>;
  createDirectory(fsPath: string): Thenable<void>;
  writeFile(fsPath: string, content: string): Thenable<void>;
  openWorkspace(workspaceFilePath: string): Thenable<void>;
  showInformationMessage(message: string): Thenable<string | undefined>;
  showWarningMessage(message: string): Thenable<string | undefined>;
  showErrorMessage(message: string): Thenable<string | undefined>;
}

export interface AddWorkspaceFolderFromUrlDependencies {
  workspaceFilePath: string | undefined;
  showInputBox(options: {
    placeHolder: string;
    prompt: string;
  }): Thenable<string | undefined>;
  createWorkspaceFolderFromUrl(
    metadata: WorkspaceFolderRemoteLinkMetadata,
  ): Thenable<CreatedWorkspaceFolderFromUrl>;
  addFolderToWorkspace(
    workspaceFilePath: string,
    folderPath: string,
    metadata: WorkspaceFolderRemoteLinkMetadata,
  ): Thenable<UpdateWorkspaceFileResult>;
  showInformationMessage(message: string): Thenable<string | undefined>;
  showErrorMessage(message: string): Thenable<string | undefined>;
}

const BASE_BRANCH_MOVED_ICON = "$(git-pull-request-draft)";
const REMOTE_BRANCH_MOVED_ICON = "$(cloud-download)";
const GIT_CHANGES_ICON = "$(diff-modified)";
const DIRTY_EDITORS_ICON = "$(primitive-dot)";
const REMOTE_LINK_ICON = "$(cloud)";
const COMPLETED_REMOTE_WORK_ICON = "$(pass-filled)";
const CLOSED_REMOTE_WORK_ICON = "$(circle-slash)";
const STATUS_ICON_SEPARATOR = "   ";
const COPY_WORKSPACE_FOLDERS_PLACEHOLDER =
  "Choose a workspace folder";
const WORKSPACE_FOLDER_ACTION_PLACEHOLDER =
  "Choose an action";
const CHOOSE_WORKSPACE_FOLDER_ROOT_PLACEHOLDER =
  "Choose a root folder";
const ADD_WORKSPACE_FOLDER_PLACEHOLDER =
  "Choose a folder to add to the workspace";
const ADD_WORKSPACE_FOLDER_FROM_URL_PLACEHOLDER =
  "Paste a GitHub issue or pull request URL";
const CREATE_WORKSPACE_NAME_PLACEHOLDER = "new-workspace-name";
const CHOOSE_WORKSPACE_ROOT_PLACEHOLDER =
  "Choose where to create the workspace";
const CREATE_NEW_FOLDER_LABEL = "$(add) Create New Folder...";

export function toQuickPickItems(
  folders: readonly WorkspaceFolderLike[],
  folderStates: ReadonlyMap<string, FolderUiState>,
  cleanupCandidates: ReadonlyMap<string, WorkspaceCleanupCandidate> = new Map(),
  linkTargets: ReadonlyMap<string, WorkspaceFolderLinkTarget> = new Map(),
): WorkspaceFolderQuickPickItem[] {
  return folders.map((folder, index) => {
    const mnemonic = WORKSPACE_FOLDER_MNEMONICS[index];
    const baseLabel = toWorkspaceFolderLabel(
      folder,
      folderStates.get(folder.uri.fsPath),
      cleanupCandidates.get(folder.uri.fsPath),
      linkTargets.has(folder.uri.fsPath),
    );

    return {
      label: mnemonic ? `[${mnemonic.toUpperCase()}] ${baseLabel}` : baseLabel,
      mnemonic,
      folder,
      folderState: folderStates.get(folder.uri.fsPath),
      cleanupCandidate: cleanupCandidates.get(folder.uri.fsPath),
    };
  });
}

export async function copyWorkspaceFolderPaths(
  deps: CopyWorkspaceFolderPathsDependencies,
): Promise<void> {
  const folders = deps.workspaceFolders ?? [];

  if (folders.length === 0) {
    await deps.showInformationMessage("No workspace folders are open.");
    return;
  }

  const linkTargets = await buildLinkTargetMap(
    folders,
    deps.resolveWorkspaceFolderLink,
  );
  const initialFolderItems = toQuickPickItems(
    folders,
    new Map(),
    new Map(),
    linkTargets,
  );
  let loadedFolderItems: WorkspaceFolderQuickPickItem[] | undefined;
  let loadFolderItemsPromise:
    | Promise<readonly WorkspaceFolderQuickPickItem[]>
    | undefined;

  const loadFolderItems = async (): Promise<
    readonly WorkspaceFolderQuickPickItem[]
  > => {
    if (loadedFolderItems) {
      return loadedFolderItems;
    }

    if (!loadFolderItemsPromise) {
      loadFolderItemsPromise = Promise.all([
        buildFolderStateMap(folders, deps.getFolderUiState),
        buildCleanupCandidateMap(folders, deps.inspectWorkspaceFolder),
      ]).then(([folderStates, cleanupCandidates]) => {
        loadedFolderItems = toQuickPickItems(
          folders,
          folderStates,
          cleanupCandidates,
          linkTargets,
        );
        return loadedFolderItems;
      });
    }

    return loadFolderItemsPromise;
  };

  while (true) {
    const pickerItems = loadedFolderItems ?? initialFolderItems;
    const picked = await deps.showQuickPick(pickerItems, {
      placeHolder: COPY_WORKSPACE_FOLDERS_PLACEHOLDER,
      loadItems: loadedFolderItems
        ? undefined
        : async (updateItems) => {
            updateItems(await loadFolderItems());
          },
    });

    if (!picked) {
      return;
    }

    const enrichedPicked =
      picked.folderState === undefined || picked.cleanupCandidate === undefined
        ? await enrichPickedFolderItem(picked, loadFolderItems)
        : picked;

    const selectedFolders = [enrichedPicked.folder];
    const selectedFolderStates = [enrichedPicked.folderState];
    const selectedPaths = toWorkspaceFolderPaths(selectedFolders);
    const selectedCleanupCandidates = toSelectedCleanupCandidates([enrichedPicked]);

    const action = await deps.showActionQuickPick(
      toWorkspaceFolderActionQuickPickItems(
        selectedFolders,
        selectedFolderStates,
        selectedCleanupCandidates,
        deps.workspaceFilePath !== undefined,
      ),
      {
        placeHolder: WORKSPACE_FOLDER_ACTION_PLACEHOLDER,
      },
    );

    if (!action) {
      continue;
    }

    await performWorkspaceFolderAction(
      action.action,
      selectedFolders,
      selectedPaths,
      selectedCleanupCandidates,
      deps,
    );
    return;
  }
}

export function toAddWorkspaceFolderQuickPickItems(
  candidates: readonly WorkspaceFolderCandidate[],
): AddWorkspaceFolderQuickPickItem[] {
  const sortedCandidates = [...candidates].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );

  return [
    {
      label: CREATE_NEW_FOLDER_LABEL,
      itemKind: "create",
    },
    ...sortedCandidates.map((candidate) => ({
      label: candidate.name,
      detail: candidate.fsPath,
      candidate,
      itemKind: "folder" as const,
    })),
  ];
}

export function toWorkspaceFolderRootQuickPickItems(
  rootPaths: readonly string[],
): WorkspaceFolderRootQuickPickItem[] {
  return rootPaths.map((rootPath) => ({
    label: path.basename(rootPath) || rootPath,
    detail: rootPath,
    rootPath,
  }));
}

export function toPrWorktreeQuickPickItems(
  candidates: readonly WorkspaceCleanupCandidate[],
): PrWorktreeQuickPickItem[] {
  return candidates.map((candidate) => ({
    label: `${candidate.folderName}   ${toCleanupBadge(candidate)}`,
    candidate,
  }));
}

export function toWorkspaceFolderActionQuickPickItems(
  selectedFolders: readonly WorkspaceFolderLike[],
  selectedFolderStates: readonly (FolderUiState | undefined)[],
  cleanupCandidates: readonly WorkspaceCleanupCandidate[],
  hasWorkspaceFile = true,
): WorkspaceFolderActionQuickPickItem[] {
  const items = toAlwaysVisibleWorkspaceFolderActions();

  if (canLinkWorkspaceFolderToGitHub(selectedFolders, hasWorkspaceFile)) {
    items.push(toWorkspaceFolderActionQuickPickItem("[L] Link to GitHub", "linkToGitHub"));
  }

  if (canPullRemoteBranches(selectedFolderStates, cleanupCandidates)) {
    items.push(
      toWorkspaceFolderActionQuickPickItem(
        "[P] Pull Remote Branch",
        "pullRemoteBranch",
      ),
    );
  }

  if (canPullBaseRepositories(selectedFolderStates, cleanupCandidates)) {
    items.push(
      toWorkspaceFolderActionQuickPickItem(
        "[B] Pull Base Repository",
        "pullBaseRepository",
      ),
    );
  }

  if (canRebaseOntoBaseBranch(selectedFolderStates, cleanupCandidates)) {
    items.push(
      toWorkspaceFolderActionQuickPickItem(
        "[M] Rebase onto Base Branch",
        "rebaseOntoBaseBranch",
      ),
    );
  }

  if (canRevealInExplorer(selectedFolders, cleanupCandidates)) {
    items.push(
      toWorkspaceFolderActionQuickPickItem(
        "[R] Reveal in Explorer",
        "revealInExplorer",
      ),
    );
  }

  if (canRemoveFromWorkspace(selectedFolders, hasWorkspaceFile)) {
    items.push(
      toWorkspaceFolderActionQuickPickItem(
        "[D] Remove From Workspace",
        "removeCleanupItems",
      ),
    );
  }

  return items;
}

export function findWorkspaceFolderActionByMnemonic(
  items: readonly WorkspaceFolderActionQuickPickItem[],
  value: string,
): WorkspaceFolderActionQuickPickItem | undefined {
  if (value.length !== 1) {
    return undefined;
  }

  const input = value.toLowerCase();
  return items.find((item) => getWorkspaceFolderActionMnemonic(item) === input);
}

export function findWorkspaceFolderByMnemonic(
  items: readonly WorkspaceFolderQuickPickItem[],
  value: string,
): WorkspaceFolderQuickPickItem | undefined {
  if (value.length !== 1) {
    return undefined;
  }

  const input = value.toLowerCase();
  return items.find((item) => item.mnemonic === input);
}

export function getWorkspaceFolderActionMnemonic(
  item: WorkspaceFolderActionQuickPickItem,
): string | undefined {
  const match = item.label.match(WORKSPACE_FOLDER_ACTION_MNEMONIC_PATTERN);
  return match?.[1]?.toLowerCase();
}

async function performWorkspaceFolderAction(
  action: WorkspaceFolderActionKind,
  selectedFolders: readonly WorkspaceFolderLike[],
  selectedPaths: readonly string[],
  selectedCleanupCandidates: readonly WorkspaceCleanupCandidate[],
  deps: CopyWorkspaceFolderPathsDependencies,
): Promise<void> {
  const joinedPaths = selectedPaths.join(", ");

  switch (action) {
    case "sendToTerminal":
      await deps.sendTextToTerminal(joinedPaths);
      return;
    case "copyPaths":
      await deps.copyText(joinedPaths);
      await deps.showInformationMessage("Copied workspace folder paths.");
      return;
    case "openLinks":
      await openWorkspaceFolderLinks(selectedFolders, deps);
      return;
    case "linkToGitHub":
      await deps.linkWorkspaceFolderToGitHub(selectedFolders[0]!);
      return;
    case "pullRemoteBranch":
      await deps.pullRemoteBranches(selectedPaths);
      return;
    case "pullBaseRepository":
      await deps.pullBaseRepositories(selectedPaths);
      return;
    case "rebaseOntoBaseBranch":
      await deps.rebaseOntoBaseBranch(selectedPaths[0]!);
      return;
    case "revealInExplorer":
      await deps.revealPath(selectedPaths[0]!);
      return;
    case "removeCleanupItems":
      await removeWorkspaceCleanupCandidates(
        selectedCleanupCandidates,
        deps,
      );
      return;
  }
}

export async function removeClosedOrMergedPrWorktrees(
  deps: RemoveClosedOrMergedPrWorktreesDependencies,
): Promise<void> {
  const folders = deps.workspaceFolders ?? [];
  if (folders.length === 0) {
    await deps.showInformationMessage("No workspace folders are open.");
    return;
  }

  try {
    const candidates = (
      await Promise.all(
        folders.map((folder) => deps.inspectWorkspaceFolder(folder)),
      )
    ).filter(
      (candidate): candidate is WorkspaceCleanupCandidate =>
        candidate !== undefined,
    );

    if (candidates.length === 0) {
      await deps.showInformationMessage(
        "No closed, merged, or missing worktree folders were found.",
      );
      return;
    }

    const picked = await deps.showQuickPick(
      toPrWorktreeQuickPickItems(candidates),
      {
        placeHolder: "Choose a closed, merged, or missing worktree to remove",
      },
    );

    if (!picked) {
      return;
    }

    await removeWorkspaceCleanupCandidates([picked.candidate], deps);
  } catch (error) {
    await deps.showErrorMessage(toCleanupErrorMessage(error));
  }
}

export async function addWorkspaceFolder(
  deps: AddWorkspaceFolderDependencies,
): Promise<void> {
  const workspaceFilePath = await requireWorkspaceFilePath(deps);
  if (!workspaceFilePath) {
    return;
  }

  const rootPaths = getConfiguredRootPaths(deps.workspaceFolderRoots);
  if (rootPaths.length === 0) {
    await deps.showInformationMessage(
      "Set workspaceActions.workspaceFolderRoots before using this command.",
    );
    return;
  }

  try {
    const rootPath = await resolveWorkspaceFolderRoot(rootPaths, deps);
    if (!rootPath) {
      return;
    }

    if (!deps.pathExists(rootPath)) {
      await deps.showErrorMessage(
        `Configured workspace folder root does not exist: ${rootPath}`,
      );
      return;
    }

    const candidates = await deps.listWorkspaceFolderCandidates(rootPath);
    const picked = await deps.showFolderQuickPick(
      toAddWorkspaceFolderQuickPickItems(candidates),
      {
        placeHolder: ADD_WORKSPACE_FOLDER_PLACEHOLDER,
      },
    );

    if (!picked) {
      return;
    }

    const folderPath = await resolveWorkspaceFolderPath(picked, rootPath, deps);
    if (!folderPath) {
      return;
    }

    const result = await deps.addFolderToWorkspace(
      workspaceFilePath,
      folderPath,
    );

    if (result === "alreadyExists") {
      await deps.showInformationMessage(
        `Folder is already in the workspace: ${folderPath}`,
      );
    }
  } catch (error) {
    await deps.showErrorMessage(toErrorMessage(error));
  }
}

export async function createWorkspace(
  deps: CreateWorkspaceDependencies,
): Promise<void> {
  const rootPaths = getConfiguredRootPaths(deps.workspaceRoots);
  if (rootPaths.length === 0) {
    await deps.showInformationMessage(
      "Set workspaceActions.workspaceRoots before using this command.",
    );
    return;
  }

  try {
    const rootPath = await resolveWorkspaceRoot(rootPaths, deps);
    if (!rootPath) {
      return;
    }

    if (!deps.pathExists(rootPath)) {
      await deps.showErrorMessage(
        `Configured workspace root does not exist: ${rootPath}`,
      );
      return;
    }

    const workspaceName = await promptForWorkspaceName(deps);
    if (!workspaceName) {
      return;
    }

    const workspaceFolderPath = path.join(rootPath, workspaceName);
    const workspaceFilePath = path.join(
      workspaceFolderPath,
      `${workspaceName}.code-workspace`,
    );

    if (deps.pathExists(workspaceFolderPath)) {
      await deps.showWarningMessage(
        `Workspace already exists: ${workspaceFolderPath}`,
      );
      return;
    }

    await deps.createDirectory(workspaceFolderPath);
    await deps.writeFile(workspaceFilePath, toNewWorkspaceFileContent());
    void deps.showInformationMessage(
      `Created workspace: ${workspaceFilePath}`,
    );
    await deps.openWorkspace(workspaceFilePath);
  } catch (error) {
    await deps.showErrorMessage(toCreateWorkspaceErrorMessage(error));
  }
}

export async function addWorkspaceFolderFromUrl(
  deps: AddWorkspaceFolderFromUrlDependencies,
): Promise<void> {
  const workspaceFilePath = await requireWorkspaceFilePath(deps);
  if (!workspaceFilePath) {
    return;
  }

  const value = await deps.showInputBox({
    placeHolder: "https://github.com/owner/repo/issues/123",
    prompt: "Enter a GitHub issue or pull request URL",
  });

  if (value === undefined) {
    return;
  }

  const trimmedUrl = value.trim();
  if (trimmedUrl.length === 0) {
    await deps.showErrorMessage("GitHub issue or pull request URL is required.");
    return;
  }

  const metadata = parseGitHubIssueOrPullRequestUrl(trimmedUrl);
  if (!metadata) {
    await deps.showErrorMessage(
      "Enter a GitHub issue or pull request URL.",
    );
    return;
  }

  try {
    const createdFolder = await deps.createWorkspaceFolderFromUrl(metadata);
    const result = await deps.addFolderToWorkspace(
      workspaceFilePath,
      createdFolder.folderPath,
      createdFolder.metadata,
    );

    if (result === "alreadyExists") {
      await deps.showInformationMessage(
        `Folder is already in the workspace: ${createdFolder.folderPath}`,
      );
      return;
    }

    await deps.showInformationMessage(
      `Added workspace folder from URL: ${createdFolder.folderPath}`,
    );
  } catch (error) {
    await deps.showErrorMessage(toAddWorkspaceFolderFromUrlErrorMessage(error));
  }
}

async function buildFolderStateMap(
  folders: readonly WorkspaceFolderLike[],
  getFolderUiState: CopyWorkspaceFolderPathsDependencies["getFolderUiState"],
): Promise<Map<string, FolderUiState>> {
  const stateEntries: Array<readonly [string, FolderUiState]> = await Promise.all(
    folders.map(async (folder) => [
      folder.uri.fsPath,
      await getFolderUiState(folder),
    ] as const),
  );

  return new Map<string, FolderUiState>(stateEntries);
}

async function buildCleanupCandidateMap(
  folders: readonly WorkspaceFolderLike[],
  inspectWorkspaceFolder: CopyWorkspaceFolderPathsDependencies["inspectWorkspaceFolder"],
): Promise<Map<string, WorkspaceCleanupCandidate>> {
  const entries = await Promise.all(
    folders.map(async (folder) => {
      const candidate = await inspectWorkspaceFolder(folder);
      return [folder.uri.fsPath, candidate] as const;
    }),
  );

  return new Map(
    entries.filter(
      (
        entry,
      ): entry is readonly [string, WorkspaceCleanupCandidate] =>
        entry[1] !== undefined,
    ),
  );
}

async function buildLinkTargetMap(
  folders: readonly WorkspaceFolderLike[],
  resolveWorkspaceFolderLink: CopyWorkspaceFolderPathsDependencies["resolveWorkspaceFolderLink"],
): Promise<Map<string, WorkspaceFolderLinkTarget>> {
  const entries = await Promise.all(
    folders.map(async (folder) => {
      const linkTarget = await resolveWorkspaceFolderLink(folder);
      return [folder.uri.fsPath, linkTarget] as const;
    }),
  );

  return new Map(
    entries.filter(
      (
        entry,
      ): entry is readonly [string, WorkspaceFolderLinkTarget] =>
        entry[1] !== undefined,
    ),
  );
}

function toWorkspaceFolderPaths(
  folders: readonly WorkspaceFolderLike[],
): string[] {
  return folders.map((folder) => folder.uri.fsPath);
}

async function enrichPickedFolderItem(
  picked: WorkspaceFolderQuickPickItem,
  loadFolderItems: () => Promise<readonly WorkspaceFolderQuickPickItem[]>,
): Promise<WorkspaceFolderQuickPickItem> {
  const loadedItems = await loadFolderItems();
  return (
    loadedItems.find(
      (item) => item.folder.uri.fsPath === picked.folder.uri.fsPath,
    ) ?? picked
  );
}

function toSelectedCleanupCandidates(
  pickedItems: readonly QuickPickItemLike[],
): WorkspaceCleanupCandidate[] {
  return pickedItems
    .map((item) => {
      if (item.cleanupCandidate) {
        return item.cleanupCandidate;
      }

      if (item.folderState?.isGitWorktree) {
        return {
          kind: "worktree" as const,
          folderName: item.folder.name,
          folderPath: item.folder.uri.fsPath,
          isDirty: item.folderState.hasGitChanges,
        };
      }

      return {
        kind: "folder" as const,
        folderName: item.folder.name,
        folderPath: item.folder.uri.fsPath,
      };
    })
    .filter(
      (candidate): candidate is WorkspaceCleanupCandidate =>
        candidate !== undefined,
    );
}

function toWorkspaceFolderLabel(
  folder: WorkspaceFolderLike,
  state: FolderUiState | undefined,
  cleanupCandidate: WorkspaceCleanupCandidate | undefined,
  hasRemoteLink: boolean,
): string {
  const icons = getWorkspaceFolderIcons(state, cleanupCandidate, hasRemoteLink);
  if (icons.length === 0) {
    return folder.name;
  }

  return `${folder.name}${STATUS_ICON_SEPARATOR}${icons.join(" ")}`;
}

function getWorkspaceFolderIcons(
  state: FolderUiState | undefined,
  cleanupCandidate: WorkspaceCleanupCandidate | undefined,
  hasRemoteLink: boolean,
): string[] {
  return deduplicateIcons([
    hasRemoteLink ? REMOTE_LINK_ICON : undefined,
    cleanupCandidate ? getCleanupStateIcon(cleanupCandidate) : undefined,
    state?.remoteBranchMoved ? REMOTE_BRANCH_MOVED_ICON : undefined,
    state?.baseBranchMoved ? BASE_BRANCH_MOVED_ICON : undefined,
    state?.hasGitChanges ? GIT_CHANGES_ICON : undefined,
    hasDirtyFolderState(state, cleanupCandidate) ? DIRTY_EDITORS_ICON : undefined,
  ]);
}

function hasMissingCleanupCandidate(
  cleanupCandidates: readonly WorkspaceCleanupCandidate[],
): boolean {
  return cleanupCandidates.some((candidate) => candidate.kind === "missing");
}

function canPullRemoteBranches(
  selectedFolderStates: readonly (FolderUiState | undefined)[],
  cleanupCandidates: readonly WorkspaceCleanupCandidate[],
): boolean {
  return (
    !hasMissingCleanupCandidate(cleanupCandidates) &&
    selectedFolderStates.length > 0 &&
    selectedFolderStates.every((state) => state?.hasRemoteBranchTracking === true)
  );
}

function toAlwaysVisibleWorkspaceFolderActions(): WorkspaceFolderActionQuickPickItem[] {
  const definitions: readonly WorkspaceFolderActionDefinition[] = [
    {
      label: "[T] Send to Terminal",
      action: "sendToTerminal",
    },
    {
      label: "[C] Copy Paths",
      action: "copyPaths",
    },
    {
      label: "[O] Open PR Or Issue Links",
      action: "openLinks",
    },
  ];

  return definitions.map((definition) =>
    toWorkspaceFolderActionQuickPickItem(
      definition.label,
      definition.action,
    ),
  );
}

function toWorkspaceFolderActionQuickPickItem(
  label: string,
  action: WorkspaceFolderActionKind,
): WorkspaceFolderActionQuickPickItem {
  return { label, action };
}

function canLinkWorkspaceFolderToGitHub(
  selectedFolders: readonly WorkspaceFolderLike[],
  hasWorkspaceFile: boolean,
): boolean {
  return hasWorkspaceFile && selectedFolders.length === 1;
}

function canRevealInExplorer(
  selectedFolders: readonly WorkspaceFolderLike[],
  cleanupCandidates: readonly WorkspaceCleanupCandidate[],
): boolean {
  return selectedFolders.length === 1 && !hasMissingCleanupCandidate(cleanupCandidates);
}

function canPullBaseRepositories(
  selectedFolderStates: readonly (FolderUiState | undefined)[],
  cleanupCandidates: readonly WorkspaceCleanupCandidate[],
): boolean {
  return (
    !hasMissingCleanupCandidate(cleanupCandidates) &&
    selectedFolderStates.length > 0 &&
    selectedFolderStates.every((state) => state?.isGitWorktree === true)
  );
}

function canRebaseOntoBaseBranch(
  selectedFolderStates: readonly (FolderUiState | undefined)[],
  cleanupCandidates: readonly WorkspaceCleanupCandidate[],
): boolean {
  return (
    !hasMissingCleanupCandidate(cleanupCandidates) &&
    selectedFolderStates.length === 1 &&
    selectedFolderStates[0]?.baseBranchMoved === true
  );
}

function canRemoveFromWorkspace(
  selectedFolders: readonly WorkspaceFolderLike[],
  hasWorkspaceFile: boolean,
): boolean {
  return hasWorkspaceFile && selectedFolders.length > 0;
}

async function removeWorkspaceCleanupCandidates(
  candidates: readonly WorkspaceCleanupCandidate[],
  deps: Pick<
    CopyWorkspaceFolderPathsDependencies,
    | "workspaceFilePath"
    | "confirmRemoval"
    | "removeWorktree"
    | "removeFolderFromWorkspace"
    | "showInformationMessage"
    | "showWarningMessage"
    | "showErrorMessage"
  >,
): Promise<void> {
  if (candidates.length === 0) {
    return;
  }

  const dirtyCandidates = candidates.filter(
    (
      candidate,
    ): candidate is PrWorktreeCandidate | IssueWorktreeCandidate | GenericWorktreeCandidate =>
      isDirtyCleanupCandidate(candidate),
  );
  if (dirtyCandidates.length > 0) {
    await deps.showWarningMessage(
      `Worktrees have uncommitted changes: ${dirtyCandidates
        .map((candidate) => candidate.folderName)
        .join(", ")}`,
    );
    return;
  }

  const confirmed = await deps.confirmRemoval(
    toRemovalConfirmationMessageForCandidates(candidates),
  );
  if (!confirmed) {
    return;
  }

  try {
    for (const candidate of candidates) {
      if (candidate.kind !== "missing" && candidate.kind !== "folder") {
        await deps.removeWorktree(candidate.folderPath);
      }

      if (deps.workspaceFilePath) {
        await deps.removeFolderFromWorkspace(
          deps.workspaceFilePath,
          candidate.folderPath,
        );
      }
    }

    await deps.showInformationMessage(
      toCleanupSuccessMessage(candidates),
    );
  } catch (error) {
    await deps.showErrorMessage(toCleanupErrorMessage(error));
  }
}

async function resolveWorkspaceFolderPath(
  picked: AddWorkspaceFolderQuickPickItem,
  rootPath: string,
  deps: AddWorkspaceFolderDependencies,
): Promise<string | undefined> {
  if (picked.itemKind === "folder" && picked.candidate) {
    return picked.candidate.fsPath;
  }

  const value = await deps.showInputBox({
    placeHolder: "new-folder-name",
    prompt: "Enter a name for the new folder",
  });

  if (value === undefined) {
    return undefined;
  }

  const folderName = value.trim();
  if (folderName.length === 0) {
    await deps.showWarningMessage("Folder name is required.");
    return undefined;
  }

  const folderPath = path.join(rootPath, folderName);
  if (deps.pathExists(folderPath)) {
    await deps.showWarningMessage(
      `Folder already exists: ${folderName}`,
    );
    return undefined;
  }

  await deps.createDirectory(folderPath);
  return folderPath;
}

async function resolveWorkspaceFolderRoot(
  rootPaths: readonly string[],
  deps: AddWorkspaceFolderDependencies,
): Promise<string | undefined> {
  return resolveWorkspaceRoot(rootPaths, deps);
}

async function resolveWorkspaceRoot(
  rootPaths: readonly string[],
  deps: Pick<CreateWorkspaceDependencies, "showRootQuickPick">,
): Promise<string | undefined> {
  if (rootPaths.length === 1) {
    return rootPaths[0];
  }

  const picked = await deps.showRootQuickPick(
    toWorkspaceFolderRootQuickPickItems(rootPaths),
    {
      placeHolder: CHOOSE_WORKSPACE_FOLDER_ROOT_PLACEHOLDER,
    },
  );

  return picked?.rootPath;
}

async function promptForWorkspaceName(
  deps: Pick<CreateWorkspaceDependencies, "showInputBox" | "showWarningMessage">,
): Promise<string | undefined> {
  const value = await deps.showInputBox({
    placeHolder: CREATE_WORKSPACE_NAME_PLACEHOLDER,
    prompt: "Enter a name for the new workspace",
  });

  if (value === undefined) {
    return undefined;
  }

  const workspaceName = value.trim();
  if (workspaceName.length === 0) {
    await deps.showWarningMessage("Workspace name is required.");
    return undefined;
  }

  if (!isValidWorkspaceName(workspaceName)) {
    await deps.showWarningMessage(
      "Workspace name cannot contain path separators.",
    );
    return undefined;
  }

  return workspaceName;
}

export function toNewWorkspaceFileContent(): string {
  return `${JSON.stringify(
    {
      folders: [
        {
          path: ".",
        },
      ],
      settings: {},
    },
    undefined,
    2,
  )}\n`;
}

function isValidWorkspaceName(workspaceName: string): boolean {
  return (
    workspaceName !== "." &&
    workspaceName !== ".." &&
    !workspaceName.includes("/") &&
    !workspaceName.includes("\\")
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Failed to add a workspace folder.";
}

function toAddWorkspaceFolderFromUrlErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Failed to add a workspace folder from URL.";
}

function toCreateWorkspaceErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Failed to create a workspace.";
}

function toCleanupBadge(candidate: WorkspaceCleanupCandidate): string {
  return getCleanupStateIcon(candidate) ?? "";
}

async function openWorkspaceFolderLinks(
  selectedFolders: readonly WorkspaceFolderLike[],
  deps: Pick<
    CopyWorkspaceFolderPathsDependencies,
    | "resolveWorkspaceFolderLink"
    | "openExternalUrls"
    | "showInformationMessage"
  >,
): Promise<void> {
  const targets = (
    await Promise.all(
      selectedFolders.map((folder) => deps.resolveWorkspaceFolderLink(folder)),
    )
  ).filter(
    (target): target is WorkspaceFolderLinkTarget => target !== undefined,
  );

  if (targets.length === 0) {
    await deps.showInformationMessage(
      "No PR or issue links were found for the selected folders.",
    );
    return;
  }

  await deps.openExternalUrls(targets.map((target) => target.url));

  const skippedCount = selectedFolders.length - targets.length;
  if (skippedCount === 0) {
    await deps.showInformationMessage(
      `Opened ${targets.length} PR or issue link${targets.length === 1 ? "" : "s"}.`,
    );
    return;
  }

  await deps.showInformationMessage(
    `Opened ${targets.length} link${targets.length === 1 ? "" : "s"}, skipped ${skippedCount} folder${skippedCount === 1 ? "" : "s"}.`,
  );
}

function toRemovalConfirmationMessage(
  candidate: WorkspaceCleanupCandidate,
): string {
  if (candidate.kind === "missing") {
    return `Remove missing workspace folder entry for ${candidate.folderName}?`;
  }

  if (candidate.kind === "issue") {
    return `Remove worktree for ${candidate.folderName} (closed issue #${candidate.issueNumber})?`;
  }

  if (candidate.kind === "worktree") {
    return `Remove worktree for ${candidate.folderName}?`;
  }

  if (candidate.kind === "folder") {
    return `Remove ${candidate.folderName} from the workspace?`;
  }

  return `Remove worktree for ${candidate.folderName} (${candidate.prState} PR #${candidate.prNumber})?`;
}

function toRemovalConfirmationMessageForCandidates(
  candidates: readonly WorkspaceCleanupCandidate[],
): string {
  if (candidates.length === 1) {
    return toRemovalConfirmationMessage(candidates[0]!);
  }

  const missingCount = candidates.filter(
    (candidate) => candidate.kind === "missing",
  ).length;
  const folderCount = candidates.filter(
    (candidate) => candidate.kind === "folder",
  ).length;
  const worktreeCount = candidates.length - missingCount - folderCount;
  const parts: string[] = [];

  if (worktreeCount > 0) {
    parts.push(`${worktreeCount} worktree${worktreeCount === 1 ? "" : "s"}`);
  }

  if (folderCount > 0) {
    parts.push(`${folderCount} folder${folderCount === 1 ? "" : "s"}`);
  }

  if (missingCount > 0) {
    parts.push(
      `${missingCount} missing entr${missingCount === 1 ? "y" : "ies"}`,
    );
  }

  return `Remove ${parts.join(" and ")} from the workspace?`;
}

function toCleanupSuccessMessage(
  candidates: readonly WorkspaceCleanupCandidate[],
): string {
  if (candidates.length === 1) {
    const [candidate] = candidates;
    return candidate.kind === "missing"
      ? `Removed missing workspace folder: ${candidate.folderPath}`
      : candidate.kind === "folder"
        ? `Removed folder from workspace: ${candidate.folderPath}`
      : `Removed worktree: ${candidate.folderPath}`;
  }

  const missingCount = candidates.filter(
    (candidate) => candidate.kind === "missing",
  ).length;
  const folderCount = candidates.filter(
    (candidate) => candidate.kind === "folder",
  ).length;
  const worktreeCount = candidates.length - missingCount - folderCount;
  const parts: string[] = [];

  if (worktreeCount > 0) {
    parts.push(`removed ${worktreeCount} worktree${worktreeCount === 1 ? "" : "s"}`);
  }

  if (folderCount > 0) {
    parts.push(`removed ${folderCount} folder${folderCount === 1 ? "" : "s"} from workspace`);
  }

  if (missingCount > 0) {
    parts.push(
      `removed ${missingCount} missing entr${missingCount === 1 ? "y" : "ies"}`,
    );
  }

  return `${capitalize(parts.join(" and "))}.`;
}

function toCleanupErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Failed to remove selected worktrees.";
}

function capitalize(value: string): string {
  if (value.length === 0) {
    return value;
  }

  return value[0]!.toUpperCase() + value.slice(1);
}

function getCleanupStateIcon(candidate: WorkspaceCleanupCandidate): string | undefined {
  if (candidate.kind === "missing") {
    return "$(warning)";
  }

  if (candidate.kind === "issue") {
    return COMPLETED_REMOTE_WORK_ICON;
  }

  if (candidate.kind === "folder") {
    return undefined;
  }

  if (candidate.kind === "worktree") {
    return undefined;
  }

  return candidate.prState === "merged"
    ? COMPLETED_REMOTE_WORK_ICON
    : CLOSED_REMOTE_WORK_ICON;
}

function isDirtyCleanupCandidate(
  candidate: WorkspaceCleanupCandidate | undefined,
): candidate is PrWorktreeCandidate | IssueWorktreeCandidate | GenericWorktreeCandidate {
  return (
    candidate !== undefined &&
    candidate.kind !== "missing" &&
    candidate.kind !== "folder" &&
    candidate.isDirty
  );
}

function hasDirtyFolderState(
  state: FolderUiState | undefined,
  cleanupCandidate: WorkspaceCleanupCandidate | undefined,
): boolean {
  return isDirtyCleanupCandidate(cleanupCandidate) || (state?.dirtyEditors ?? 0) > 0;
}

function deduplicateIcons(icons: readonly (string | undefined)[]): string[] {
  return [...new Set(icons)].filter(
    (icon): icon is string => icon !== undefined && icon.length > 0,
  );
}

function getConfiguredRootPaths(
  rootPaths: readonly string[] | undefined,
): string[] {
  return (rootPaths ?? [])
    .map((rootPath) => rootPath.trim())
    .filter((rootPath) => rootPath.length > 0);
}

async function requireWorkspaceFilePath(
  deps: Pick<
    AddWorkspaceFolderDependencies | AddWorkspaceFolderFromUrlDependencies,
    "workspaceFilePath" | "showInformationMessage"
  >,
): Promise<string | undefined> {
  if (deps.workspaceFilePath) {
    return deps.workspaceFilePath;
  }

  await deps.showInformationMessage(
    "The current window must use a saved .code-workspace file.",
  );

  return undefined;
}
