import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";
import {
  ADD_LOCAL_WORKTREE_FROM_GITHUB_URL_COMMAND,
  ADD_WORKSPACE_FOLDER_COMMAND,
  COPY_WORKSPACE_FOLDER_PATHS_COMMAND,
  addWorkspaceFolderFromUrl,
  addWorkspaceFolder,
  copyWorkspaceFolderPaths,
  findWorkspaceFolderByMnemonic,
  findWorkspaceFolderActionByMnemonic,
  type MissingWorkspaceFolderCandidate,
  type PrWorktreeCandidate,
  type WorkspaceCleanupCandidate,
  type WorkspaceFolderActionQuickPickItem,
  type WorkspaceFolderCandidate,
  type WorkspaceFolderLinkTarget,
  type WorkspaceFolderQuickPickItem,
  type WorkspaceFolderLike,
} from "./commands";
import {
  buildFolderStatusSummaries,
  createEmptyFolderStatusSummary,
  REFRESH_STATUS_CONCURRENCY,
  refreshBaseBranchForRepositories,
  toFolderUiState,
  type GitRepositoryLike,
} from "./folderStatus";
import {
  addAbsoluteFolderToWorkspaceFileContent,
  getWorkspaceFolderLinkMetadataByPath,
  removeFolderFromWorkspaceFileContent,
} from "./workspaceFile";
import {
  parseGitHubIssueOrPullRequestUrl,
  type IssueSummary,
  type PullRequestSummary,
  toWorkspaceFolderRemoteLinkMetadataFromIssue,
  toWorkspaceFolderRemoteLinkMetadataFromPullRequest,
  type WorkspaceFolderRemoteLinkMetadata,
} from "./prCleanup";
import {
  formatPullRemoteBranchFailure,
  toPullSuccessSummary,
} from "./pullRemote";
import {
  formatRebaseFailure,
  toRebaseSuccessMessage,
} from "./rebaseBase";
import { toRefreshStatusMessage } from "./refreshStatus";
import {
  isSuccessfulConcurrencyResult,
  runSettledWithConcurrency,
} from "./concurrency";

interface GitApiLike {
  repositories: readonly GitRepositoryLike[];
}

interface GitExtensionExports {
  enabled: boolean;
  getAPI(version: 1): GitApiLike;
}

const REFRESH_STATUS_COMMAND =
  "workspace-actions.refreshStatus";
const BASE_BRANCH_CONFIG_KEY = "workspaceActions.baseBranch";
const WORKSPACE_FOLDER_ROOTS_CONFIG_KEY =
  "workspaceActions.workspaceFolderRoots";
const EMPTY_FOLDER_UI_STATE = toFolderUiState(createEmptyFolderStatusSummary());
const WORKSPACE_ACTIONS_TERMINAL_NAME = "Workspace Actions";
const PR_WORKTREE_CACHE_TTL_MS = 60_000;
const execFileAsync = promisify(execFile);
const prWorktreeInspectionCache = new Map<string, CachedPrWorktreeInspection>();
const NO_PR_WORKTREE_CACHE = Symbol("no-pr-worktree-cache");

interface CachedPrWorktreeInspection {
  value: WorkspaceCleanupCandidate | undefined;
  expiresAt: number;
}

async function getGitRepositories(): Promise<readonly GitRepositoryLike[]> {
  const gitExtension =
    vscode.extensions.getExtension<GitExtensionExports>("vscode.git");

  if (!gitExtension) {
    return [];
  }

  const gitExports = gitExtension.isActive
    ? gitExtension.exports
    : await gitExtension.activate();

  if (!gitExports?.enabled) {
    return [];
  }

  return gitExports.getAPI(1).repositories;
}

function getDirtyDocumentFolderPaths(): string[] {
  return vscode.workspace.textDocuments
    .filter((document) => document.isDirty)
    .map((document) => vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath)
    .filter((folderPath): folderPath is string => folderPath !== undefined);
}

function getBaseBranch(): string {
  return vscode.workspace
    .getConfiguration()
    .get<string>(BASE_BRANCH_CONFIG_KEY, "main");
}

function getWorkspaceFolderRoots(): readonly string[] {
  return vscode.workspace
    .getConfiguration()
    .get<string[]>(WORKSPACE_FOLDER_ROOTS_CONFIG_KEY, []);
}

function getOrCreateTerminal(): vscode.Terminal {
  return (
    vscode.window.activeTerminal ??
    vscode.window.createTerminal(WORKSPACE_ACTIONS_TERMINAL_NAME)
  );
}

function showWorkspaceFolderQuickPick(
  items: readonly WorkspaceFolderQuickPickItem[],
  placeHolder: string,
  loadItems?: (
    updateItems: (items: readonly WorkspaceFolderQuickPickItem[]) => void,
  ) => Promise<void>,
): Promise<WorkspaceFolderQuickPickItem | undefined> {
  return new Promise((resolve) => {
    const quickPick = vscode.window.createQuickPick<WorkspaceFolderQuickPickItem>();
    let settled = false;

    const settle = (value: WorkspaceFolderQuickPickItem | undefined) => {
      if (settled) {
        return;
      }

      settled = true;
      quickPick.dispose();
      resolve(value);
    };

    quickPick.items = items;
    quickPick.title = placeHolder;
    quickPick.placeholder = placeHolder;
    quickPick.matchOnDescription = false;
    quickPick.matchOnDetail = false;
    const changeDisposable = quickPick.onDidChangeValue((value) => {
      const item = findWorkspaceFolderByMnemonic(quickPick.items, value);
      if (!item) {
        return;
      }

      quickPick.value = "";
      quickPick.activeItems = [item];
      settle(item);
    });

    quickPick.onDidAccept(() => {
      settle(quickPick.activeItems[0]);
    });

    quickPick.onDidHide(() => {
      changeDisposable.dispose();
      settle(undefined);
    });

    quickPick.show();

    if (loadItems) {
      quickPick.busy = true;
      void loadItems((nextItems) => {
        if (settled) {
          return;
        }

        const previouslySelectedPaths = new Set(
          quickPick.activeItems.map((item) => item.folder.uri.fsPath),
        );
        const previousActivePath =
          quickPick.activeItems[0]?.folder.uri.fsPath;

        quickPick.items = nextItems;

        if (previousActivePath) {
          const nextActiveItem = nextItems.find(
            (item) => item.folder.uri.fsPath === previousActivePath,
          );
          if (nextActiveItem) {
            quickPick.activeItems = [nextActiveItem];
          }
        }

        quickPick.busy = false;
      }).catch(() => {
        if (!settled) {
          quickPick.busy = false;
        }
      });
    }
  });
}

function showWorkspaceFolderActionQuickPick(
  items: readonly WorkspaceFolderActionQuickPickItem[],
  placeHolder: string,
): Promise<WorkspaceFolderActionQuickPickItem | undefined> {
  return new Promise((resolve) => {
    const quickPick = vscode.window.createQuickPick<WorkspaceFolderActionQuickPickItem>();
    let settled = false;

    const settle = (value: WorkspaceFolderActionQuickPickItem | undefined) => {
      if (settled) {
        return;
      }

      settled = true;
      quickPick.dispose();
      resolve(value);
    };

    quickPick.items = items;
    quickPick.title = placeHolder;
    quickPick.placeholder = placeHolder;
    quickPick.matchOnDescription = false;
    quickPick.matchOnDetail = false;

    const changeDisposable = quickPick.onDidChangeValue((value) => {
      const item = findWorkspaceFolderActionByMnemonic(items, value);
      if (!item) {
        return;
      }

      quickPick.value = "";
      quickPick.activeItems = [item];
      settle(item);
    });

    quickPick.onDidAccept(() => {
      settle(quickPick.activeItems[0]);
    });

    quickPick.onDidHide(() => {
      changeDisposable.dispose();
      settle(undefined);
    });

    quickPick.show();
  });
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(ADD_WORKSPACE_FOLDER_COMMAND, async () => {
      await addWorkspaceFolder({
        workspaceFilePath: vscode.workspace.workspaceFile?.fsPath,
        workspaceFolderRoots: getWorkspaceFolderRoots(),
        pathExists: (fsPath) => fs.existsSync(fsPath),
        listWorkspaceFolderCandidates: async (rootPath) =>
          listWorkspaceFolderCandidates(rootPath),
        showRootQuickPick: (items, options) =>
          vscode.window.showQuickPick(items, options),
        showFolderQuickPick: (items, options) =>
          vscode.window.showQuickPick(items, options),
        showInputBox: (options) => vscode.window.showInputBox(options),
        createDirectory: async (fsPath) => {
          await fs.promises.mkdir(fsPath, { recursive: false });
        },
        addFolderToWorkspace: async (workspaceFilePath, folderPath) =>
          addFolderToCurrentWorkspace(workspaceFilePath, folderPath),
        showInformationMessage: (message) =>
          vscode.window.showInformationMessage(message),
        showWarningMessage: (message) =>
          vscode.window.showWarningMessage(message),
        showErrorMessage: (message) =>
          vscode.window.showErrorMessage(message),
      });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(ADD_LOCAL_WORKTREE_FROM_GITHUB_URL_COMMAND, async () => {
      await addWorkspaceFolderFromUrl({
        workspaceFilePath: vscode.workspace.workspaceFile?.fsPath,
        showInputBox: (options) => vscode.window.showInputBox(options),
        createWorkspaceFolderFromUrl: async (metadata) =>
          createWorkspaceFolderFromUrl(metadata),
        addFolderToWorkspace: async (workspaceFilePath, folderPath, metadata) =>
          addFolderToCurrentWorkspace(workspaceFilePath, folderPath, metadata),
        showInformationMessage: (message) =>
          vscode.window.showInformationMessage(message),
        showErrorMessage: (message) =>
          vscode.window.showErrorMessage(message),
      });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COPY_WORKSPACE_FOLDER_PATHS_COMMAND, async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const workspaceFolderLinks = await getWorkspaceFolderLinkMetadataMap(
        vscode.workspace.workspaceFile?.fsPath,
      );
      const folderUiStates = await getWorkspaceFolderUiStates(
        workspaceFolders ?? [],
      );

      await copyWorkspaceFolderPaths({
        workspaceFolders,
        getFolderUiState: async (folder) =>
          folderUiStates.get(folder.uri.fsPath) ?? EMPTY_FOLDER_UI_STATE,
        inspectWorkspaceFolder: async (folder) =>
          inspectWorkspaceFolderForPrCleanup(
            folder,
            workspaceFolderLinks.get(path.resolve(folder.uri.fsPath)),
          ),
        showQuickPick: (items, options) =>
          showWorkspaceFolderQuickPick(
            items,
            options.placeHolder,
            options.loadItems,
          ),
        showActionQuickPick: (items, options) =>
          showWorkspaceFolderActionQuickPick(items, options.placeHolder),
        resolveWorkspaceFolderLink: async (folder) =>
          resolveWorkspaceFolderLink(
            workspaceFolderLinks.get(path.resolve(folder.uri.fsPath)),
          ),
        linkWorkspaceFolderToGitHub: async (folder) =>
          linkWorkspaceFolderToGitHub(
            vscode.workspace.workspaceFile?.fsPath,
            folder,
          ),
        showInformationMessage: (message) =>
          vscode.window.showInformationMessage(message),
        showWarningMessage: (message) =>
          vscode.window.showWarningMessage(message),
        showErrorMessage: (message) =>
          vscode.window.showErrorMessage(message),
        sendTextToTerminal: async (text) => sendTextToWorkspaceTerminal(text),
        copyText: async (text) => vscode.env.clipboard.writeText(text),
        openExternalUrls: async (urls) => {
          for (const url of urls) {
            await vscode.env.openExternal(vscode.Uri.parse(url));
          }
        },
        revealPath: async (fsPath) => {
          await vscode.commands.executeCommand(
            "revealInExplorer",
            vscode.Uri.file(fsPath),
          );
        },
        pullRemoteBranches: async (folderPaths) => {
          await pullRemoteBranches(folderPaths);
        },
        pullBaseRepositories: async (folderPaths) => {
          await pullBaseRepositories(folderPaths);
        },
        rebaseOntoBaseBranch: async (folderPath) => {
          await rebaseOntoBaseBranch(folderPath);
        },
        workspaceFilePath: vscode.workspace.workspaceFile?.fsPath,
        confirmRemoval: async (message) => {
          const removeLabel = "Remove";
          const picked = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            removeLabel,
          );

          return picked === removeLabel;
        },
        removeWorktree: async (folderPath) => {
          await removeGitWorktree(folderPath);
        },
        removeFolderFromWorkspace: async (workspaceFilePath, folderPath) => {
          await removeFolderFromCurrentWorkspace(workspaceFilePath, folderPath);
        },
      });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(REFRESH_STATUS_COMMAND, async () => {
      const baseBranch = getBaseBranch();
      const repositories = await getGitRepositories();
      const gitRefreshResult = await refreshBaseBranchForRepositories(
        repositories,
        baseBranch,
      );

      const workspaceFilePath = vscode.workspace.workspaceFile?.fsPath;
      let refreshedRemoteStatuses: number | undefined;

      try {
        if (workspaceFilePath) {
          const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
          const metadataMap = await getWorkspaceFolderLinkMetadataMap(workspaceFilePath);
          const linkedFolders = workspaceFolders
            .map((folder) => ({
              folder,
              metadata: metadataMap.get(path.resolve(folder.uri.fsPath)),
            }))
            .filter(
              (entry): entry is {
                folder: vscode.WorkspaceFolder;
                metadata: WorkspaceFolderRemoteLinkMetadata;
              } => entry.metadata !== undefined,
            );

          if (linkedFolders.length > 0) {
            refreshedRemoteStatuses = await refreshWorkspaceFolderRemoteStatuses(
              workspaceFilePath,
              linkedFolders,
            );
          } else {
            refreshedRemoteStatuses = 0;
          }
        }
      } catch (error) {
        await vscode.window.showErrorMessage(toExtensionErrorMessage(error));
        return;
      }

      const message = toRefreshStatusMessage(baseBranch, {
        attemptedGitRepositories: gitRefreshResult.attempted,
        refreshedGitRepositories: gitRefreshResult.refreshed,
        refreshedRemoteStatuses,
      });

      if (!message) {
        await vscode.window.showInformationMessage(
          "No Git repositories with fetch remotes or linked workspace folders were found.",
        );
        return;
      }

      await vscode.window.showInformationMessage(message);
    }),
  );
}

export function deactivate(): void {}

async function resolveWorkspaceFolderLink(
  metadata: WorkspaceFolderRemoteLinkMetadata | undefined,
): Promise<WorkspaceFolderLinkTarget | undefined> {
  if (!metadata) {
    return undefined;
  }

  return {
    kind: metadata.kind,
    url: metadata.url,
  };
}

async function inspectWorkspaceFolderForPrCleanup(
  folder: WorkspaceFolderLike,
  metadata: WorkspaceFolderRemoteLinkMetadata | undefined,
): Promise<WorkspaceCleanupCandidate | undefined> {
  const folderPath = folder.uri.fsPath;
  const cached = getCachedPrWorktreeInspection(folder.uri.fsPath);
  if (cached !== NO_PR_WORKTREE_CACHE) {
    return cached;
  }

  if (!fs.existsSync(folderPath)) {
    const missingCandidate: MissingWorkspaceFolderCandidate = {
      kind: "missing",
      folderName: folder.name,
      folderPath,
    };
    setCachedPrWorktreeInspection(folderPath, missingCandidate);
    return missingCandidate;
  }

  if (!metadata) {
    setCachedPrWorktreeInspection(folder.uri.fsPath, undefined);
    return undefined;
  }

  try {
    const statusOutput = await runCommand("git", [
      "-C",
      folderPath,
      "status",
      "--porcelain",
    ]);
    const isDirty = statusOutput.trim().length > 0;

    const branchName = (await runCommand("git", [
      "-C",
      folderPath,
      "branch",
      "--show-current",
    ])).trim();

    if (metadata.kind === "issue") {
      if (metadata.status !== "closed") {
        setCachedPrWorktreeInspection(folder.uri.fsPath, undefined);
        return undefined;
      }

      const candidate: WorkspaceCleanupCandidate = {
        kind: "issue",
        folderName: folder.name,
        folderPath,
        branchName,
        issueNumber: metadata.number,
        issueTitle: metadata.title ?? `Issue #${metadata.number}`,
        issueUrl: metadata.url,
        isDirty,
      };

      setCachedPrWorktreeInspection(folder.uri.fsPath, candidate);
      return candidate;
    }

    if (metadata.status !== "merged" && metadata.status !== "closed") {
      setCachedPrWorktreeInspection(folder.uri.fsPath, undefined);
      return undefined;
    }

    const candidate: PrWorktreeCandidate = {
      kind: "pr",
      folderName: folder.name,
      folderPath,
      branchName,
      prNumber: metadata.number,
      prTitle: metadata.title ?? `Pull Request #${metadata.number}`,
      prUrl: metadata.url,
      prState: metadata.status,
      isDirty,
    };

    setCachedPrWorktreeInspection(folder.uri.fsPath, candidate);
    return candidate;
  } catch {
    setCachedPrWorktreeInspection(folder.uri.fsPath, undefined);
    return undefined;
  }
}

async function listWorkspaceFolderCandidates(
  rootPath: string,
): Promise<readonly WorkspaceFolderCandidate[]> {
  const entries = await fs.promises.readdir(rootPath, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());

  const candidates = await Promise.all(
    directories.map(async (entry) => {
      const folderPath = path.join(rootPath, entry.name);
      const stats = await fs.promises.stat(folderPath);

      return {
        name: entry.name,
        fsPath: folderPath,
        updatedAt: stats.mtimeMs,
      } satisfies WorkspaceFolderCandidate;
    }),
  );

  return candidates.sort((left, right) => right.updatedAt - left.updatedAt);
}

async function viewPullRequestByNumber(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestSummary | undefined> {
  const output = await runCommand("gh", [
    "pr",
    "view",
    String(prNumber),
    "--repo",
    `${owner}/${repo}`,
    "--json",
    "number,title,state,mergedAt,url,updatedAt,headRefName,headRepositoryOwner,headRepository",
  ]);

  return JSON.parse(output) as PullRequestSummary;
}

async function viewIssueByNumber(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<IssueSummary | undefined> {
  const output = await runCommand("gh", [
    "issue",
    "view",
    String(issueNumber),
    "--repo",
    `${owner}/${repo}`,
    "--json",
    "number,title,state,url,closedAt",
  ]);

  return JSON.parse(output) as IssueSummary;
}

async function getWorkspaceFolderLinkMetadataMap(
  workspaceFilePath: string | undefined,
): Promise<Map<string, WorkspaceFolderRemoteLinkMetadata>> {
  if (!workspaceFilePath) {
    return new Map();
  }

  const workspaceFileUri = vscode.Uri.file(workspaceFilePath);
  const document = await vscode.workspace.openTextDocument(workspaceFileUri);
  return getWorkspaceFolderLinkMetadataByPath(
    document.getText(),
    workspaceFilePath,
  );
}

async function refreshWorkspaceFolderRemoteStatuses(
  workspaceFilePath: string,
  linkedFolders: readonly {
    folder: WorkspaceFolderLike;
    metadata: WorkspaceFolderRemoteLinkMetadata;
  }[],
): Promise<number> {
  const workspaceFileUri = vscode.Uri.file(workspaceFilePath);
  const document = await vscode.workspace.openTextDocument(workspaceFileUri);
  const originalContent = document.getText();
  let nextContent = originalContent;
  const refreshedEntries = await runSettledWithConcurrency(
    linkedFolders,
    REFRESH_STATUS_CONCURRENCY,
    async ({ folder, metadata }) => ({
      folder,
      metadata: await refreshWorkspaceFolderRemoteLinkMetadata(metadata),
    }),
  );
  const failedEntry = refreshedEntries.find(
    (entry) => !isSuccessfulConcurrencyResult(entry),
  );

  if (failedEntry) {
    throw failedEntry.error;
  }

  for (const entry of refreshedEntries.filter(isSuccessfulConcurrencyResult)) {
    const { folder, metadata } = entry.value;
    const updated = addAbsoluteFolderToWorkspaceFileContent(
      nextContent,
      workspaceFilePath,
      folder.uri.fsPath,
      metadata,
    );
    nextContent = updated.content;
    clearCachedPrWorktreeInspection(folder.uri.fsPath);
  }

  if (nextContent !== originalContent) {
    await saveWorkspaceFileDocument(document, nextContent);
  }

  return refreshedEntries.length;
}

async function refreshWorkspaceFolderRemoteLinkMetadata(
  metadata: WorkspaceFolderRemoteLinkMetadata,
): Promise<WorkspaceFolderRemoteLinkMetadata> {
  if (metadata.kind === "pr") {
    const pullRequest = await viewPullRequestByNumber(
      metadata.owner,
      metadata.repo,
      metadata.number,
    );
    if (!pullRequest) {
      throw new Error(`Could not load pull request #${metadata.number}.`);
    }
    return toWorkspaceFolderRemoteLinkMetadataFromPullRequest(
      metadata,
      pullRequest,
    );
  }

  const issue = await viewIssueByNumber(
    metadata.owner,
    metadata.repo,
    metadata.number,
  );
  if (!issue) {
    throw new Error(`Could not load issue #${metadata.number}.`);
  }
  return toWorkspaceFolderRemoteLinkMetadataFromIssue(metadata, issue);
}

async function linkWorkspaceFolderToGitHub(
  workspaceFilePath: string | undefined,
  folder: WorkspaceFolderLike,
): Promise<void> {
  if (!workspaceFilePath) {
    await vscode.window.showInformationMessage(
      "The current window must use a saved .code-workspace file.",
    );
    return;
  }

  const metadata = await promptForGitHubLinkMetadata(
    `Enter a GitHub issue or pull request URL for ${folder.name}`,
  );
  if (!metadata) {
    return;
  }

  try {
    await upsertWorkspaceFolderRemoteLinkMetadata(
      workspaceFilePath,
      folder,
      metadata,
    );
    await vscode.window.showInformationMessage(
      `Linked workspace folder to GitHub: ${folder.name}`,
    );
  } catch (error) {
    await vscode.window.showErrorMessage(toExtensionErrorMessage(error));
  }
}

async function promptForGitHubLinkMetadata(
  prompt: string,
): Promise<WorkspaceFolderRemoteLinkMetadata | undefined> {
  const value = await vscode.window.showInputBox({
    placeHolder: "https://github.com/owner/repo/issues/123",
    prompt,
  });

  if (value === undefined) {
    return undefined;
  }

  const trimmedUrl = value.trim();
  if (trimmedUrl.length === 0) {
    await vscode.window.showErrorMessage(
      "GitHub issue or pull request URL is required.",
    );
    return undefined;
  }

  const metadata = parseGitHubIssueOrPullRequestUrl(trimmedUrl);
  if (!metadata) {
    await vscode.window.showErrorMessage(
      "Enter a GitHub issue or pull request URL.",
    );
    return undefined;
  }

  return metadata;
}

async function upsertWorkspaceFolderRemoteLinkMetadata(
  workspaceFilePath: string,
  folder: WorkspaceFolderLike,
  metadata: WorkspaceFolderRemoteLinkMetadata,
): Promise<void> {
  const refreshedMetadata = await refreshWorkspaceFolderRemoteLinkMetadata(
    metadata,
  );
  if (refreshedMetadata.kind === "pr" && fs.existsSync(folder.uri.fsPath)) {
    await configureExistingPullRequestTracking(folder.uri.fsPath, refreshedMetadata);
  }
  await addFolderToCurrentWorkspace(
    workspaceFilePath,
    folder.uri.fsPath,
    refreshedMetadata,
  );
  clearCachedPrWorktreeInspection(folder.uri.fsPath);
}

async function createWorkspaceFolderFromUrl(
  metadata: WorkspaceFolderRemoteLinkMetadata,
): Promise<{
  folderPath: string;
  metadata: WorkspaceFolderRemoteLinkMetadata;
}> {
  const refreshedMetadata = await refreshWorkspaceFolderRemoteLinkMetadata(metadata);
  const repoPath = await resolveLocalRepositoryPath(metadata);
  const folderName = `${metadata.repo}-${metadata.kind === "pr" ? "pr" : "is"}-${metadata.number}`;
  const folderPath = path.join(path.dirname(repoPath), folderName);

  if (fs.existsSync(folderPath)) {
    throw new Error(`Worktree folder already exists: ${folderPath}`);
  }

  if (metadata.kind === "pr") {
    const branchName = `pr/${metadata.number}`;
    await createPullRequestTrackingWorktree(
      repoPath,
      folderPath,
      branchName,
      metadata,
    );
  } else {
    const branchName = `jake/issue-${metadata.number}`;
    await runCommand("git", [
      "-C",
      repoPath,
      "fetch",
      "origin",
      "main",
    ]);
    await createWorktreeFromBranch(
      repoPath,
      folderPath,
      branchName,
      "origin/main",
    );
  }

  return {
    folderPath,
    metadata: refreshedMetadata,
  };
}

async function createWorktreeFromBranch(
  repoPath: string,
  folderPath: string,
  branchName: string,
  startPoint: string,
): Promise<void> {
  const branchExists = await gitBranchExists(repoPath, branchName);
  const args = ["-C", repoPath, "worktree", "add"];

  if (!branchExists) {
    args.push("-b", branchName);
    args.push(folderPath, startPoint);
  } else {
    args.push(folderPath, branchName);
  }

  await runCommand("git", args);
}

async function createPullRequestTrackingWorktree(
  repoPath: string,
  folderPath: string,
  branchName: string,
  metadata: WorkspaceFolderRemoteLinkMetadata,
): Promise<void> {
  const pullRequest = await viewPullRequestByNumber(
    metadata.owner,
    metadata.repo,
    metadata.number,
  );
  if (!pullRequest) {
    throw new Error(`Could not load pull request #${metadata.number}.`);
  }

  const upstream = await ensurePullRequestUpstream(repoPath, metadata, pullRequest);
  await runCommand("git", [
    "-C",
    repoPath,
    "fetch",
    upstream.remoteName,
    upstream.headRefName,
  ]);
  await createWorktreeFromBranch(
    repoPath,
    folderPath,
    branchName,
    upstream.remoteRef,
  );
  await runCommand("git", [
    "-C",
    folderPath,
    "branch",
    "--set-upstream-to",
    upstream.remoteRef,
    branchName,
  ]);
}

async function configureExistingPullRequestTracking(
  folderPath: string,
  metadata: WorkspaceFolderRemoteLinkMetadata,
): Promise<void> {
  const branchName = (await runCommand("git", [
    "-C",
    folderPath,
    "branch",
    "--show-current",
  ])).trim();

  if (!branchName) {
    throw new Error("Could not determine the current branch for this worktree.");
  }

  const pullRequest = await viewPullRequestByNumber(
    metadata.owner,
    metadata.repo,
    metadata.number,
  );
  if (!pullRequest) {
    throw new Error(`Could not load pull request #${metadata.number}.`);
  }

  const upstream = await ensurePullRequestUpstream(folderPath, metadata, pullRequest);
  await runCommand("git", [
    "-C",
    folderPath,
    "fetch",
    upstream.remoteName,
    upstream.headRefName,
  ]);
  await runCommand("git", [
    "-C",
    folderPath,
    "branch",
    "--set-upstream-to",
    upstream.remoteRef,
    branchName,
  ]);
}

async function ensurePullRequestUpstream(
  repoPath: string,
  metadata: WorkspaceFolderRemoteLinkMetadata,
  pullRequest: PullRequestSummary,
): Promise<{
  remoteName: string;
  headRefName: string;
  remoteRef: string;
}> {
  const headRefName = pullRequest.headRefName?.trim();
  const headOwner = pullRequest.headRepositoryOwner?.login?.trim() || metadata.owner;
  const headRepo = pullRequest.headRepository?.name?.trim() || metadata.repo;

  if (!headRefName) {
    throw new Error(`Pull request #${metadata.number} does not expose a head branch.`);
  }

  const remoteName =
    headOwner === metadata.owner && headRepo === metadata.repo
      ? "origin"
      : await ensureGitRemote(repoPath, headOwner, headRepo, metadata.number);

  return {
    remoteName,
    headRefName,
    remoteRef: `${remoteName}/${headRefName}`,
  };
}

async function gitBranchExists(
  repoPath: string,
  branchName: string,
): Promise<boolean> {
  const result = await runCommand("git", [
    "-C",
    repoPath,
    "branch",
    "--list",
    branchName,
  ]);

  return result.trim().length > 0;
}

async function ensureGitRemote(
  repoPath: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string> {
  const preferredRemoteName = owner;
  const preferredRemoteUrl = `git@github.com:${owner}/${repo}.git`;
  const remoteNames = await listGitRemotes(repoPath);

  if (remoteNames.includes(preferredRemoteName)) {
    const existingUrl = (await runCommand("git", [
      "-C",
      repoPath,
      "remote",
      "get-url",
      preferredRemoteName,
    ])).trim();

    if (existingUrl === preferredRemoteUrl) {
      return preferredRemoteName;
    }
  }

  const fallbackRemoteName = `pr-${prNumber}`;
  if (remoteNames.includes(fallbackRemoteName)) {
    const existingUrl = (await runCommand("git", [
      "-C",
      repoPath,
      "remote",
      "get-url",
      fallbackRemoteName,
    ])).trim();

    if (existingUrl === preferredRemoteUrl) {
      return fallbackRemoteName;
    }

    throw new Error(
      `Remote ${fallbackRemoteName} already exists and points to a different repository.`,
    );
  }

  const remoteName = remoteNames.includes(preferredRemoteName)
    ? fallbackRemoteName
    : preferredRemoteName;

  await runCommand("git", [
    "-C",
    repoPath,
    "remote",
    "add",
    remoteName,
    preferredRemoteUrl,
  ]);

  return remoteName;
}

async function listGitRemotes(repoPath: string): Promise<string[]> {
  const output = await runCommand("git", [
    "-C",
    repoPath,
    "remote",
  ]);

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function addFolderToCurrentWorkspace(
  workspaceFilePath: string,
  folderPath: string,
  metadata?: WorkspaceFolderRemoteLinkMetadata,
): Promise<"added" | "updated" | "alreadyExists"> {
  const normalizedFolderPath = path.resolve(folderPath);
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  const isAlreadyOpen = workspaceFolders.some(
    (folder) => path.resolve(folder.uri.fsPath) === normalizedFolderPath,
  );

  const workspaceFileUri = vscode.Uri.file(workspaceFilePath);
  const document = await vscode.workspace.openTextDocument(workspaceFileUri);
  const originalContent = document.getText();
  const updated = addAbsoluteFolderToWorkspaceFileContent(
    originalContent,
    workspaceFilePath,
    normalizedFolderPath,
    metadata,
  );

  if (updated.content !== originalContent) {
    await saveWorkspaceFileDocument(document, updated.content);
  }

  if (!isAlreadyOpen && updated.result !== "alreadyExists") {
    await waitForWorkspaceFolderToAppear(normalizedFolderPath);
  }

  if (updated.result === "alreadyExists" && isAlreadyOpen) {
    return "alreadyExists";
  }

  return updated.result;
}

async function removeFolderFromCurrentWorkspace(
  workspaceFilePath: string,
  folderPath: string,
): Promise<void> {
  const workspaceFileUri = vscode.Uri.file(workspaceFilePath);
  const document = await vscode.workspace.openTextDocument(workspaceFileUri);
  const originalContent = document.getText();
  const updated = removeFolderFromWorkspaceFileContent(
    originalContent,
    workspaceFilePath,
    folderPath,
  );

  if (!updated.removed || updated.content === originalContent) {
    return;
  }

  await saveWorkspaceFileDocument(document, updated.content);
  await waitForWorkspaceFolderToDisappear(folderPath);
}

async function removeGitWorktree(folderPath: string): Promise<void> {
  const branchName = (
    await runCommand("git", [
      "-C",
      folderPath,
      "branch",
      "--show-current",
    ])
  ).trim();
  const commonDir = (
    await runCommand("git", [
      "-C",
      folderPath,
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ])
  ).trim();

  const mainRepoPath = path.dirname(commonDir);
  await runCommand("git", [
    "-C",
    mainRepoPath,
    "worktree",
    "remove",
    folderPath,
  ]);

  if (branchName) {
    try {
      await runCommand("git", [
        "-C",
        mainRepoPath,
        "branch",
        "-d",
        branchName,
      ]);
    } catch (error) {
      await vscode.window.showWarningMessage(
        `Removed worktree ${path.basename(folderPath)}, but could not delete branch ${branchName}: ${toExtensionErrorMessage(error)}`,
      );
    }
  }

  clearCachedPrWorktreeInspection(folderPath);
}

async function pullRemoteBranches(
  folderPaths: readonly string[],
): Promise<void> {
  const failures: string[] = [];
  let changedCount = 0;
  let unchangedCount = 0;

  for (const folderPath of folderPaths) {
    try {
      const beforeHead = await getHeadCommit(folderPath);
      await runCommand("git", [
        "-C",
        folderPath,
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{upstream}",
      ]);
      await runCommand("git", [
        "-C",
        folderPath,
        "pull",
        "--ff-only",
      ]);
      const afterHead = await getHeadCommit(folderPath);
      if (beforeHead === afterHead) {
        unchangedCount += 1;
      } else {
        changedCount += 1;
      }
    } catch (error) {
      failures.push(formatPullRemoteBranchFailure(folderPath, error));
    }
  }

  if (failures.length === 0) {
    await vscode.window.showInformationMessage(
      toPullSuccessSummary("workspace folder", changedCount, unchangedCount),
    );
    return;
  }

  const succeeded = folderPaths.length - failures.length;
  await vscode.window.showWarningMessage(
    succeeded > 0
      ? `Pulled ${succeeded} folders, ${failures.length} failed: ${failures.join(", ")}`
      : `Failed to pull remote branches: ${failures.join(", ")}`,
  );
}

async function sendTextToWorkspaceTerminal(text: string): Promise<void> {
  const terminal = getOrCreateTerminal();
  terminal.sendText(text, false);
  terminal.show();
}

async function saveWorkspaceFileDocument(
  document: vscode.TextDocument,
  content: string,
): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    fullDocumentRange(document),
    content,
  );

  const didApply = await vscode.workspace.applyEdit(edit);
  if (!didApply) {
    throw new Error("Failed to update the workspace file.");
  }

  const saved = await document.save();
  if (!saved) {
    throw new Error("Failed to save the workspace file.");
  }
}

async function pullBaseRepositories(
  folderPaths: readonly string[],
): Promise<void> {
  const failures: string[] = [];
  let changedCount = 0;
  let unchangedCount = 0;

  for (const folderPath of folderPaths) {
    try {
      const commonDir = (
        await runCommand("git", [
          "-C",
          folderPath,
          "rev-parse",
          "--path-format=absolute",
          "--git-common-dir",
        ])
      ).trim();

      const baseRepoPath = path.dirname(commonDir);
      const beforeHead = await getHeadCommit(baseRepoPath);

      await runCommand("git", [
        "-C",
        baseRepoPath,
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{upstream}",
      ]);
      await runCommand("git", [
        "-C",
        baseRepoPath,
        "pull",
        "--ff-only",
      ]);
      const afterHead = await getHeadCommit(baseRepoPath);
      if (beforeHead === afterHead) {
        unchangedCount += 1;
      } else {
        changedCount += 1;
      }
    } catch (error) {
      failures.push(formatPullRemoteBranchFailure(folderPath, error));
    }
  }

  if (failures.length === 0) {
    await vscode.window.showInformationMessage(
      toPullSuccessSummary("base repository", changedCount, unchangedCount),
    );
    return;
  }

  const summary =
    failures.length === folderPaths.length
      ? `Failed to pull ${failures.length} base repositor${failures.length === 1 ? "y" : "ies"}.`
      : `Pulled ${folderPaths.length - failures.length} base repositor${folderPaths.length - failures.length === 1 ? "y" : "ies"}, ${failures.length} failed.`;

  await vscode.window.showWarningMessage(
    `${summary} ${failures.join(" ")}`,
  );
}

async function rebaseOntoBaseBranch(folderPath: string): Promise<void> {
  const baseBranch = getBaseBranch();

  try {
    const beforeHead = await getHeadCommit(folderPath);
    const baseRef = await resolveBaseBranchRef(folderPath, baseBranch);
    await runCommand("git", [
      "-C",
      folderPath,
      "rebase",
      baseRef,
    ]);
    const afterHead = await getHeadCommit(folderPath);
    await vscode.window.showInformationMessage(
      toRebaseSuccessMessage(baseRef, beforeHead !== afterHead),
    );
  } catch (error) {
    await vscode.window.showWarningMessage(
      formatRebaseFailure(folderPath, error),
    );
  }
}

async function getHeadCommit(repoPath: string): Promise<string> {
  return (
    await runCommand("git", [
      "-C",
      repoPath,
      "rev-parse",
      "HEAD",
    ])
  ).trim();
}

async function resolveBaseBranchRef(
  repoPath: string,
  baseBranch: string,
): Promise<string> {
  const remotes = await listGitRemotes(repoPath);
  const remoteCandidates = remotes.includes("origin")
    ? ["origin", ...remotes.filter((remote) => remote !== "origin")]
    : remotes;

  for (const remote of remoteCandidates) {
    try {
      await runCommand("git", [
        "-C",
        repoPath,
        "fetch",
        remote,
        baseBranch,
      ]);
      return `${remote}/${baseBranch}`;
    } catch {
      continue;
    }
  }

  if (await gitBranchExists(repoPath, baseBranch)) {
    return baseBranch;
  }

  throw new Error(`Could not fetch base branch ${baseBranch}.`);
}

function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
  const lastLine = document.lineAt(document.lineCount - 1);

  return new vscode.Range(
    0,
    0,
    lastLine.lineNumber,
    lastLine.range.end.character,
  );
}

async function waitForWorkspaceFolderToAppear(folderPath: string): Promise<void> {
  const normalizedFolderPath = path.resolve(folderPath);
  const existingFolders = vscode.workspace.workspaceFolders ?? [];
  if (
    existingFolders.some(
      (folder) => path.resolve(folder.uri.fsPath) === normalizedFolderPath,
    )
  ) {
    return;
  }

  await new Promise<void>((resolve) => {
    const disposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const currentFolders = vscode.workspace.workspaceFolders ?? [];
      const found = currentFolders.some(
        (folder) => path.resolve(folder.uri.fsPath) === normalizedFolderPath,
      );

      if (!found) {
        return;
      }

      disposable.dispose();
      resolve();
    });
  });
}

async function waitForWorkspaceFolderToDisappear(folderPath: string): Promise<void> {
  const normalizedFolderPath = path.resolve(folderPath);
  const existingFolders = vscode.workspace.workspaceFolders ?? [];
  if (
    !existingFolders.some(
      (folder) => path.resolve(folder.uri.fsPath) === normalizedFolderPath,
    )
  ) {
    return;
  }

  await new Promise<void>((resolve) => {
    const disposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const currentFolders = vscode.workspace.workspaceFolders ?? [];
      const stillExists = currentFolders.some(
        (folder) => path.resolve(folder.uri.fsPath) === normalizedFolderPath,
      );

      if (stillExists) {
        return;
      }

      disposable.dispose();
      resolve();
    });
  });
}

async function runCommand(
  command: string,
  args: readonly string[],
  cwd?: string,
): Promise<string> {
  const { stdout } = await execFileAsync(command, [...args], {
    cwd,
  });

  return stdout;
}
async function resolveLocalRepositoryPath(
  metadata: WorkspaceFolderRemoteLinkMetadata,
): Promise<string> {
  const rootPaths = getWorkspaceFolderRoots()
    .map((rootPath) => rootPath.trim())
    .filter((rootPath) => rootPath.length > 0);

  if (rootPaths.length === 0) {
    throw new Error(
      "Set workspaceActions.workspaceFolderRoots so Workspace Actions can find local repositories for linked worktrees.",
    );
  }

  const candidates = rootPaths.flatMap((rootPath) =>
    toRepositoryPathCandidates(rootPath, metadata),
  ).filter((candidate, index, values) => values.indexOf(candidate) === index);

  const existingCandidates = candidates.filter(
    (candidate) =>
      fs.existsSync(candidate) && fs.existsSync(path.join(candidate, ".git")),
  );

  if (existingCandidates.length === 0) {
    throw new Error(
      `Could not find a local repository for ${metadata.owner}/${metadata.repo}.`,
    );
  }

  if (existingCandidates.length === 1) {
    return existingCandidates[0]!;
  }

  const ownerMatches = existingCandidates.filter((candidate) =>
    candidate.includes(`/${metadata.owner}/`),
  );
  if (ownerMatches.length === 1) {
    return ownerMatches[0]!;
  }

  throw new Error(
    `Multiple local repositories matched ${metadata.owner}/${metadata.repo}: ${existingCandidates.join(", ")}`,
  );
}

function toRepositoryPathCandidates(
  rootPath: string,
  metadata: WorkspaceFolderRemoteLinkMetadata,
): string[] {
  const candidates = [path.join(rootPath, metadata.repo)];
  if (!rootPath.includes(`/${metadata.owner}`)) {
    candidates.push(path.join(rootPath, metadata.owner, metadata.repo));
  }

  return candidates;
}

function getCachedPrWorktreeInspection(
  folderPath: string,
): WorkspaceCleanupCandidate | undefined | typeof NO_PR_WORKTREE_CACHE {
  const cacheKey = path.resolve(folderPath);
  const cached = prWorktreeInspectionCache.get(cacheKey);

  if (!cached) {
    return NO_PR_WORKTREE_CACHE;
  }

  if (cached.expiresAt <= Date.now()) {
    prWorktreeInspectionCache.delete(cacheKey);
    return NO_PR_WORKTREE_CACHE;
  }

  return cached.value;
}

function setCachedPrWorktreeInspection(
  folderPath: string,
  value: WorkspaceCleanupCandidate | undefined,
): void {
  prWorktreeInspectionCache.set(path.resolve(folderPath), {
    value,
    expiresAt: Date.now() + PR_WORKTREE_CACHE_TTL_MS,
  });
}

function clearCachedPrWorktreeInspection(folderPath: string): void {
  prWorktreeInspectionCache.delete(path.resolve(folderPath));
}

function toExtensionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Workspace Actions failed.";
}

async function getWorkspaceFolderUiStates(
  workspaceFolders: readonly vscode.WorkspaceFolder[],
): Promise<Map<string, ReturnType<typeof toFolderUiState>>> {
  const baseBranch = getBaseBranch();
  const folderSummaries = await buildFolderStatusSummaries(
    workspaceFolders,
    await getGitRepositories(),
    getDirtyDocumentFolderPaths(),
    baseBranch,
  );

  return new Map(
    [...folderSummaries.entries()].map(([folderPath, summary]) => [
      folderPath,
      {
        ...toFolderUiState(summary),
        isGitWorktree: isLinkedGitWorktree(folderPath),
      },
    ]),
  );
}

function isLinkedGitWorktree(folderPath: string): boolean {
  try {
    return fs.statSync(path.join(folderPath, ".git")).isFile();
  } catch {
    return false;
  }
}
