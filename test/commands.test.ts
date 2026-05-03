import test from "node:test";
import assert from "node:assert/strict";
import {
  addWorkspaceFolderFromUrl,
  addWorkspaceFolder,
  createWorkspace,
  copyWorkspaceFolderPaths,
  findWorkspaceFolderByMnemonic,
  findWorkspaceFolderActionByMnemonic,
  getWorkspaceFolderActionMnemonic,
  removeClosedOrMergedPrWorktrees,
  toAddWorkspaceFolderQuickPickItems,
  toPrWorktreeQuickPickItems,
  toQuickPickItems,
  toWorkspaceFolderActionQuickPickItems,
  toNewWorkspaceFileContent,
  toWorkspaceFolderRootQuickPickItems,
  type CopyWorkspaceFolderPathsDependencies,
  type CreateWorkspaceDependencies,
  type IssueWorktreeCandidate,
  type MissingWorkspaceFolderCandidate,
  type PrWorktreeCandidate,
  type WorkspaceFolderCandidate,
  type FolderUiState,
  type WorkspaceFolderLinkTarget,
  type WorkspaceFolderLike,
} from "../src/commands";

function createFolder(
  name: string,
  fsPath: string,
): WorkspaceFolderLike {
  return {
    name,
    uri: {
      fsPath,
    },
  };
}

function createFolderCandidate(
  name: string,
  fsPath: string,
  updatedAt: number,
): WorkspaceFolderCandidate {
  return {
    name,
    fsPath,
    updatedAt,
  };
}

function createPrWorktreeCandidate(
  overrides: Partial<PrWorktreeCandidate> = {},
): PrWorktreeCandidate {
  return {
    kind: "pr",
    folderName: "api",
    folderPath: "/worktrees/api",
    branchName: "feature/api",
    prNumber: 42,
    prTitle: "Close stale API branch",
    prUrl: "https://github.com/example/repo/pull/42",
    prState: "merged",
    isDirty: false,
    ...overrides,
  };
}

function createMissingWorkspaceFolderCandidate(
  overrides: Partial<MissingWorkspaceFolderCandidate> = {},
): MissingWorkspaceFolderCandidate {
  return {
    kind: "missing",
    folderName: "old-api",
    folderPath: "/worktrees/old-api",
    ...overrides,
  };
}

function createIssueWorktreeCandidate(
  overrides: Partial<IssueWorktreeCandidate> = {},
): IssueWorktreeCandidate {
  return {
    kind: "issue",
    folderName: "piglet-issue-1687",
    folderPath: "/worktrees/piglet-issue-1687",
    branchName: "issue-1687",
    issueNumber: 1687,
    issueTitle: "Support full-chain CA bundles",
    issueUrl: "https://github.com/example/repo/issues/1687",
    isDirty: false,
    ...overrides,
  };
}

function createCopyWorkspaceFolderPathsDependencies(
  overrides: Partial<CopyWorkspaceFolderPathsDependencies> = {},
): CopyWorkspaceFolderPathsDependencies {
  return {
    workspaceFolders: [],
    workspaceFilePath: "/workspace/home.code-workspace",
    getFolderUiState: async () => ({
      isGitWorktree: false,
      hasGitChanges: false,
      hasRemoteBranchTracking: false,
      remoteBranchMoved: false,
      baseBranchMoved: false,
      dirtyEditors: 0,
    }),
    inspectWorkspaceFolder: async () => undefined,
    showQuickPick: async () => undefined,
    showActionQuickPick: async () => undefined,
    resolveWorkspaceFolderLink: async () => undefined,
    linkWorkspaceFolderToGitHub: async () => undefined,
    sendTextToTerminal: async () => undefined,
    copyText: async () => undefined,
    openExternalUrls: async () => undefined,
    revealPath: async () => undefined,
    pullRemoteBranches: async () => undefined,
    pullBaseRepositories: async () => undefined,
    rebaseOntoBaseBranch: async () => undefined,
    confirmRemoval: async () => false,
    removeWorktree: async () => undefined,
    removeFolderFromWorkspace: async () => undefined,
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    ...overrides,
  };
}

function createCreateWorkspaceDependencies(
  overrides: Partial<CreateWorkspaceDependencies> = {},
): CreateWorkspaceDependencies {
  return {
    workspaceRoots: ["/workspaces"],
    pathExists: (fsPath) => fsPath === "/workspaces",
    showRootQuickPick: async () => undefined,
    showInputBox: async () => undefined,
    createDirectory: async () => undefined,
    writeFile: async () => undefined,
    openWorkspace: async () => undefined,
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    ...overrides,
  };
}

function createWorkspaceLinkMetadata(
  overrides: Partial<{
    kind: "pr" | "issue";
    owner: string;
    repo: string;
    number: number;
    url: string;
  }> = {},
) {
  return {
    kind: "issue" as const,
    owner: "aicers",
    repo: "piglet",
    number: 1735,
    url: "https://github.com/aicers/piglet/issues/1735",
    ...overrides,
  };
}

test("toQuickPickItems appends status icons after the folder name", () => {
  const folder = createFolder("home", "/workspace/home");
  const states = new Map<string, FolderUiState>([
    [
      folder.uri.fsPath,
      {
        isGitWorktree: false,
        hasGitChanges: true,
        hasRemoteBranchTracking: false,
        remoteBranchMoved: false,
        baseBranchMoved: true,
        dirtyEditors: 0,
      },
    ],
  ]);

  const items = toQuickPickItems([folder], states);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.label, "[A] home   $(git-pull-request-draft) $(diff-modified)");
  assert.equal(items[0]?.folder, folder);
});

test("toQuickPickItems shows plain labels for normal folders", () => {
  const folder = createFolder("home", "/workspace/home");

  const items = toQuickPickItems([folder], new Map());

  assert.equal(items[0]?.label, "[A] home");
});

test("toQuickPickItems adds an unsaved icon when needed", () => {
  const folder = createFolder("home", "/workspace/home");
  const states = new Map<string, FolderUiState>([
    [
      folder.uri.fsPath,
      {
        isGitWorktree: false,
        hasGitChanges: false,
        hasRemoteBranchTracking: false,
        remoteBranchMoved: false,
        baseBranchMoved: false,
        dirtyEditors: 2,
      },
    ],
  ]);

  const items = toQuickPickItems([folder], states);

  assert.equal(items[0]?.label, "[A] home   $(primitive-dot)");
});

test("toQuickPickItems prepends cleanup badges before other folder state icons", () => {
  const folder = createFolder("api", "/worktrees/api");
  const states = new Map<string, FolderUiState>([
    [
      folder.uri.fsPath,
      {
        isGitWorktree: true,
        hasGitChanges: true,
        hasRemoteBranchTracking: false,
        remoteBranchMoved: false,
        baseBranchMoved: false,
        dirtyEditors: 0,
      },
    ],
  ]);
  const cleanupCandidates = new Map([
    [folder.uri.fsPath, createPrWorktreeCandidate()],
  ]);

  const items = toQuickPickItems([folder], states, cleanupCandidates);

  assert.equal(items[0]?.label, "[A] api   $(pass-filled) $(diff-modified)");
});

test("toQuickPickItems adds a cloud badge when a remote PR or issue link exists", () => {
  const folder = createFolder("api", "/worktrees/api");
  const linkTargets = new Map<string, WorkspaceFolderLinkTarget>([
    [folder.uri.fsPath, { kind: "pr", url: "https://github.com/example/repo/pull/42" }],
  ]);

  const items = toQuickPickItems([folder], new Map(), new Map(), linkTargets);

  assert.equal(items[0]?.label, "[A] api   $(cloud)");
});

test("toQuickPickItems shows cleanup and cloud badges together", () => {
  const folder = createFolder("piglet-issue-1687", "/worktrees/piglet-issue-1687");
  const cleanupCandidates = new Map([
    [folder.uri.fsPath, createIssueWorktreeCandidate()],
  ]);
  const linkTargets = new Map<string, WorkspaceFolderLinkTarget>([
    [folder.uri.fsPath, { kind: "issue", url: "https://github.com/example/repo/issues/1687" }],
  ]);

  const items = toQuickPickItems(
    [folder],
    new Map(),
    cleanupCandidates,
    linkTargets,
  );

  assert.equal(items[0]?.label, "[A] piglet-issue-1687   $(cloud) $(pass-filled)");
});

test("toQuickPickItems keeps remote status icons ordered and deduplicates dirty badges", () => {
  const folder = createFolder("piglet-issue-1687", "/worktrees/piglet-issue-1687");
  const states = new Map<string, FolderUiState>([
    [
      folder.uri.fsPath,
      {
        isGitWorktree: true,
        hasGitChanges: true,
        hasRemoteBranchTracking: false,
        remoteBranchMoved: true,
        baseBranchMoved: true,
        dirtyEditors: 2,
      },
    ],
  ]);
  const cleanupCandidates = new Map([
    [folder.uri.fsPath, createIssueWorktreeCandidate({ isDirty: true })],
  ]);
  const linkTargets = new Map<string, WorkspaceFolderLinkTarget>([
    [folder.uri.fsPath, { kind: "issue", url: "https://github.com/example/repo/issues/1687" }],
  ]);

  const items = toQuickPickItems(
    [folder],
    states,
    cleanupCandidates,
    linkTargets,
  );

  assert.equal(
    items[0]?.label,
    "[A] piglet-issue-1687   $(cloud) $(pass-filled) $(cloud-download) $(git-pull-request-draft) $(diff-modified) $(primitive-dot)",
  );
});

test("toQuickPickItems assigns folder mnemonics in the expected order", () => {
  const folders = "asdfghjkl;qwertyuiopzxcvbnm,."
    .split("")
    .map((_, index) =>
      createFolder(`folder-${index + 1}`, `/workspaces/folder-${index + 1}`),
    );

  const items = toQuickPickItems(folders, new Map());

  assert.deepEqual(
    items.map((item) => item.mnemonic),
    "asdfghjkl;qwertyuiopzxcvbnm,.".split(""),
  );
});

test("findWorkspaceFolderByMnemonic matches a single typed letter", () => {
  const items = toQuickPickItems(
    [
      createFolder("home", "/workspace/home"),
      createFolder("dotfiles", "/dotfiles"),
    ],
    new Map(),
  );

  assert.equal(findWorkspaceFolderByMnemonic(items, "a")?.folder.name, "home");
  assert.equal(findWorkspaceFolderByMnemonic(items, "S")?.folder.name, "dotfiles");
  assert.equal(findWorkspaceFolderByMnemonic(items, "as"), undefined);
});

test("toAddWorkspaceFolderQuickPickItems keeps the create option first and sorts by updated time", () => {
  const oldFolder = createFolderCandidate(
    "old",
    "/root/old",
    10,
  );
  const newFolder = createFolderCandidate(
    "new",
    "/root/new",
    20,
  );

  const items = toAddWorkspaceFolderQuickPickItems([oldFolder, newFolder]);

  assert.deepEqual(
    items.map((item) => item.label),
    ["$(add) Create New Folder...", "new", "old"],
  );
  assert.equal(items[1]?.detail, "/root/new");
  assert.equal(items[2]?.detail, "/root/old");
});

test("toWorkspaceFolderRootQuickPickItems shows basename labels with full root paths", () => {
  const items = toWorkspaceFolderRootQuickPickItems([
    "/workspace",
    "/sandboxes",
  ]);

  assert.deepEqual(
    items.map((item) => ({ label: item.label, detail: item.detail })),
    [
      {
        label: "workspace",
        detail: "/workspace",
      },
      {
        label: "sandboxes",
        detail: "/sandboxes",
      },
    ],
  );
});

test("toPrWorktreeQuickPickItems shows PR state badges in a single-line label", () => {
  const items = toPrWorktreeQuickPickItems([
    createPrWorktreeCandidate(),
    createPrWorktreeCandidate({
      folderName: "web",
      folderPath: "/worktrees/web",
      prState: "closed",
      isDirty: true,
      prNumber: 8,
      prTitle: "Close web branch",
      branchName: "feature/web",
    }),
  ]);

  assert.deepEqual(
    items.map((item) => item.label),
    ["api   $(pass-filled)", "web   $(circle-slash)"],
  );
  assert.equal(items[0]?.detail, undefined);
  assert.equal(items[1]?.detail, undefined);
});

test("toPrWorktreeQuickPickItems shows a warning badge for missing folders", () => {
  const items = toPrWorktreeQuickPickItems([
    createMissingWorkspaceFolderCandidate(),
  ]);

  assert.deepEqual(
    items.map((item) => item.label),
    ["old-api   $(warning)"],
  );
  assert.equal(items[0]?.detail, undefined);
});

test("toPrWorktreeQuickPickItems shows an issue badge for closed issue worktrees", () => {
  const items = toPrWorktreeQuickPickItems([
    createIssueWorktreeCandidate({ isDirty: true }),
  ]);

  assert.deepEqual(
    items.map((item) => item.label),
    ["piglet-issue-1687   $(pass-filled)"],
  );
});

test("toWorkspaceFolderActionQuickPickItems shows the expected actions for multiple existing folders", () => {
  const items = toWorkspaceFolderActionQuickPickItems(
    [
      createFolder("home", "/workspace/home"),
      createFolder("dotfiles", "/dotfiles"),
    ],
    [
      {
        isGitWorktree: false,
        hasGitChanges: false,
        hasRemoteBranchTracking: true,
        remoteBranchMoved: false,
        baseBranchMoved: false,
        dirtyEditors: 0,
      },
      {
        isGitWorktree: false,
        hasGitChanges: false,
        hasRemoteBranchTracking: true,
        remoteBranchMoved: false,
        baseBranchMoved: false,
        dirtyEditors: 0,
      },
    ],
    [],
  );

  assert.deepEqual(
    items.map((item) => item.action),
    [
      "sendToTerminal",
      "copyPaths",
      "openLinks",
      "pullRemoteBranch",
      "removeCleanupItems",
    ],
  );
  assert.deepEqual(
    items.map((item) => item.label),
    [
      "[T] Send to Terminal",
      "[C] Copy Paths",
      "[O] Open PR Or Issue Links",
      "[P] Pull Remote Branch",
      "[D] Remove From Workspace",
    ],
  );
  assert(items.every((item) => item.detail === undefined));
});

test("toWorkspaceFolderActionQuickPickItems shows reveal for a single folder and remove for cleanup-only selections", () => {
  const items = toWorkspaceFolderActionQuickPickItems(
    [createFolder("api", "/worktrees/api")],
    [
      {
        isGitWorktree: false,
        hasGitChanges: false,
        hasRemoteBranchTracking: true,
        remoteBranchMoved: false,
        baseBranchMoved: false,
        dirtyEditors: 0,
      },
    ],
    [createPrWorktreeCandidate()],
  );

  assert.deepEqual(
    items.map((item) => item.action),
    [
      "sendToTerminal",
      "copyPaths",
      "openLinks",
      "linkToGitHub",
      "pullRemoteBranch",
      "revealInExplorer",
      "removeCleanupItems",
    ],
  );
});

test("toWorkspaceFolderActionQuickPickItems hides reveal and pull for missing folders", () => {
  const items = toWorkspaceFolderActionQuickPickItems(
    [createFolder("old-api", "/worktrees/old-api")],
    [
      {
        isGitWorktree: false,
        hasGitChanges: false,
        hasRemoteBranchTracking: true,
        remoteBranchMoved: false,
        baseBranchMoved: false,
        dirtyEditors: 0,
      },
    ],
    [createMissingWorkspaceFolderCandidate()],
  );

  assert.deepEqual(
    items.map((item) => item.action),
    [
      "sendToTerminal",
      "copyPaths",
      "openLinks",
      "linkToGitHub",
      "removeCleanupItems",
    ],
  );
});

test("toWorkspaceFolderActionQuickPickItems still shows remove for mixed cleanup and normal folders", () => {
  const items = toWorkspaceFolderActionQuickPickItems(
    [
      createFolder("api", "/worktrees/api"),
      createFolder("home", "/workspace/home"),
    ],
    [
      {
        isGitWorktree: true,
        hasGitChanges: false,
        hasRemoteBranchTracking: true,
        remoteBranchMoved: false,
        baseBranchMoved: false,
        dirtyEditors: 0,
      },
      {
        isGitWorktree: false,
        hasGitChanges: false,
        hasRemoteBranchTracking: true,
        remoteBranchMoved: false,
        baseBranchMoved: false,
        dirtyEditors: 0,
      },
    ],
    [createPrWorktreeCandidate()],
  );

  assert.deepEqual(
    items.map((item) => item.action),
    [
      "sendToTerminal",
      "copyPaths",
      "openLinks",
      "pullRemoteBranch",
      "removeCleanupItems",
    ],
  );
});

test("toWorkspaceFolderActionQuickPickItems hides Link to GitHub without a workspace file", () => {
  const items = toWorkspaceFolderActionQuickPickItems(
    [createFolder("home", "/workspace/home")],
    [
      {
        isGitWorktree: false,
        hasGitChanges: false,
        hasRemoteBranchTracking: true,
        remoteBranchMoved: false,
        baseBranchMoved: false,
        dirtyEditors: 0,
      },
    ],
    [],
    false,
  );

  assert.deepEqual(
    items.map((item) => item.action),
    ["sendToTerminal", "copyPaths", "openLinks", "pullRemoteBranch", "revealInExplorer"],
  );
});

test("toWorkspaceFolderActionQuickPickItems hides Pull Remote Branch without upstream tracking", () => {
  const items = toWorkspaceFolderActionQuickPickItems(
    [createFolder("piglet-pr-1724", "/worktrees/piglet-pr-1724")],
    [
      {
        isGitWorktree: true,
        hasGitChanges: false,
        hasRemoteBranchTracking: false,
        remoteBranchMoved: false,
        baseBranchMoved: true,
        dirtyEditors: 0,
      },
    ],
    [],
  );

  assert.deepEqual(
    items.map((item) => item.action),
    [
      "sendToTerminal",
      "copyPaths",
      "openLinks",
      "linkToGitHub",
      "pullBaseRepository",
      "rebaseOntoBaseBranch",
      "revealInExplorer",
      "removeCleanupItems",
    ],
  );
});

test("toWorkspaceFolderActionQuickPickItems hides Pull Base Repository for normal folders", () => {
  const items = toWorkspaceFolderActionQuickPickItems(
    [createFolder("home", "/workspace/home")],
    [
      {
        isGitWorktree: false,
        hasGitChanges: false,
        hasRemoteBranchTracking: true,
        remoteBranchMoved: false,
        baseBranchMoved: false,
        dirtyEditors: 0,
      },
    ],
    [],
  );

  assert.equal(
    items.some((item) => item.action === "pullBaseRepository"),
    false,
  );
});

test("toWorkspaceFolderActionQuickPickItems hides Rebase onto Base Branch when the base branch has not moved", () => {
  const items = toWorkspaceFolderActionQuickPickItems(
    [createFolder("feature-scratch", "/worktrees/feature-scratch")],
    [
      {
        isGitWorktree: true,
        hasGitChanges: false,
        hasRemoteBranchTracking: true,
        remoteBranchMoved: false,
        baseBranchMoved: false,
        dirtyEditors: 0,
      },
    ],
    [],
  );

  assert.equal(
    items.some((item) => item.action === "rebaseOntoBaseBranch"),
    false,
  );
});

test("toWorkspaceFolderActionQuickPickItems shows remove for a regular worktree", () => {
  const items = toWorkspaceFolderActionQuickPickItems(
    [createFolder("feature-scratch", "/worktrees/feature-scratch")],
    [
      {
        isGitWorktree: true,
        hasGitChanges: false,
        hasRemoteBranchTracking: false,
        remoteBranchMoved: false,
        baseBranchMoved: false,
        dirtyEditors: 0,
      },
    ],
    [],
  );

  assert.deepEqual(
    items.map((item) => item.action),
    [
      "sendToTerminal",
      "copyPaths",
      "openLinks",
      "linkToGitHub",
      "pullBaseRepository",
      "revealInExplorer",
      "removeCleanupItems",
    ],
  );
});

test("getWorkspaceFolderActionMnemonic extracts the leading mnemonic", () => {
  const [item] = toWorkspaceFolderActionQuickPickItems(
    [createFolder("home", "/workspace/home")],
    [
      {
        isGitWorktree: false,
        hasGitChanges: false,
        hasRemoteBranchTracking: true,
        remoteBranchMoved: false,
        baseBranchMoved: false,
        dirtyEditors: 0,
      },
    ],
    [],
  );

  assert.equal(getWorkspaceFolderActionMnemonic(item!), "t");
});

test("findWorkspaceFolderActionByMnemonic matches a single typed letter", () => {
  const items = toWorkspaceFolderActionQuickPickItems(
    [createFolder("feature-scratch", "/worktrees/feature-scratch")],
    [
      {
        isGitWorktree: true,
        hasGitChanges: false,
        hasRemoteBranchTracking: true,
        remoteBranchMoved: false,
        baseBranchMoved: true,
        dirtyEditors: 0,
      },
    ],
    [],
  );

  assert.equal(
    findWorkspaceFolderActionByMnemonic(items, "p")?.action,
    "pullRemoteBranch",
  );
  assert.equal(
    findWorkspaceFolderActionByMnemonic(items, "b")?.action,
    "pullBaseRepository",
  );
  assert.equal(
    findWorkspaceFolderActionByMnemonic(items, "m")?.action,
    "rebaseOntoBaseBranch",
  );
  assert.equal(findWorkspaceFolderActionByMnemonic(items, "P")?.action, "pullRemoteBranch");
  assert.equal(findWorkspaceFolderActionByMnemonic(items, "pt"), undefined);
});

test("copyWorkspaceFolderPaths shows a message when no folders are open", async () => {
  const messages: string[] = [];
  const terminalWrites: string[] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: undefined,
    sendTextToTerminal: async (text) => {
      terminalWrites.push(text);
    },
    showInformationMessage: async (message) => {
      messages.push(message);
      return undefined;
    },
  }));

  assert.deepEqual(messages, ["No workspace folders are open."]);
  assert.deepEqual(terminalWrites, []);
});

test("copyWorkspaceFolderPaths shows the picker even for one workspace folder", async () => {
  const folder = createFolder("home", "/workspace/home");
  const terminalWrites: string[] = [];
  const seenLabels: string[] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [folder],
    showQuickPick: async (items) => {
      seenLabels.push(...items.map((item) => item.label));
      return items[0];
    },
    showActionQuickPick: async (items) => items[0],
    sendTextToTerminal: async (text) => {
      terminalWrites.push(text);
    },
  }));

  assert.deepEqual(seenLabels, ["[A] home"]);
  assert.deepEqual(terminalWrites, ["/workspace/home"]);
});

test("copyWorkspaceFolderPaths sends every selected folder path to the terminal", async () => {
  const first = createFolder("home", "/workspace/home");
  const second = createFolder("dotfiles", "/dotfiles");
  const terminalWrites: string[] = [];
  const seenLabels: string[] = [];
  const seenOptions: Array<{
    placeHolder: string;
    loadItems?: unknown;
  }> = [];
  const actionLabels: string[] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [first, second],
    getFolderUiState: async (folder) =>
      folder.name === "home"
        ? {
            isGitWorktree: false,
            hasGitChanges: true,
            hasRemoteBranchTracking: true,
            remoteBranchMoved: false,
            baseBranchMoved: true,
            dirtyEditors: 0,
          }
        : {
            isGitWorktree: false,
            hasGitChanges: false,
            hasRemoteBranchTracking: true,
            remoteBranchMoved: false,
            baseBranchMoved: false,
            dirtyEditors: 1,
          },
    showQuickPick: async (items, options) => {
      seenLabels.push(...items.map((item) => item.label));
      seenOptions.push(options);
      return items[1];
    },
    showActionQuickPick: async (items) => {
      actionLabels.push(...items.map((item) => item.label));
      return items[0];
    },
    sendTextToTerminal: async (text) => {
      terminalWrites.push(text);
    },
  }));

  assert.deepEqual(seenLabels, [
    "[A] home",
    "[S] dotfiles",
  ]);
  assert.equal(seenOptions.length, 1);
  assert.equal(seenOptions[0]?.placeHolder, "Choose a workspace folder");
  assert.equal(typeof seenOptions[0]?.loadItems, "function");
  assert.deepEqual(actionLabels, [
    "[T] Send to Terminal",
    "[C] Copy Paths",
    "[O] Open PR Or Issue Links",
    "[L] Link to GitHub",
    "[P] Pull Remote Branch",
    "[R] Reveal in Explorer",
    "[D] Remove From Workspace",
  ]);
  assert.deepEqual(terminalWrites, [
    "/dotfiles",
  ]);
});

test("copyWorkspaceFolderPaths does nothing when the picker is cancelled", async () => {
  const first = createFolder("home", "/workspace/home");
  const second = createFolder("dotfiles", "/dotfiles");
  const terminalWrites: string[] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [first, second],
    showQuickPick: async () => undefined,
    sendTextToTerminal: async (text) => {
      terminalWrites.push(text);
    },
  }));

  assert.deepEqual(terminalWrites, []);
});

test("copyWorkspaceFolderPaths returns to the folder picker when the action picker is cancelled", async () => {
  const folder = createFolder("home", "/workspace/home");
  const terminalWrites: string[] = [];
  const copiedTexts: string[] = [];
  const revealedPaths: string[] = [];
  const pulledSelections: string[][] = [];
  let folderPickerCalls = 0;

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [folder],
    showQuickPick: async (items) => {
      folderPickerCalls += 1;
      return folderPickerCalls === 1 ? items[0] : undefined;
    },
    showActionQuickPick: async () => undefined,
    sendTextToTerminal: async (text) => {
      terminalWrites.push(text);
    },
    copyText: async (text) => {
      copiedTexts.push(text);
    },
    revealPath: async (fsPath) => {
      revealedPaths.push(fsPath);
    },
    pullRemoteBranches: async (folderPaths) => {
      pulledSelections.push([...folderPaths]);
    },
  }));

  assert.deepEqual(terminalWrites, []);
  assert.deepEqual(copiedTexts, []);
  assert.deepEqual(revealedPaths, []);
  assert.deepEqual(pulledSelections, []);
  assert.equal(folderPickerCalls, 2);
});

test("copyWorkspaceFolderPaths copies selected paths when copy action is chosen", async () => {
  const folder = createFolder("home", "/workspace/home");
  const copiedTexts: string[] = [];
  const infoMessages: string[] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [folder],
    showQuickPick: async (items) => items[0],
    showActionQuickPick: async (items) =>
      items.find((item) => item.action === "copyPaths"),
    copyText: async (text) => {
      copiedTexts.push(text);
    },
    showInformationMessage: async (message) => {
      infoMessages.push(message);
      return undefined;
    },
  }));

  assert.deepEqual(copiedTexts, ["/workspace/home"]);
  assert.deepEqual(infoMessages, ["Copied workspace folder paths."]);
});

test("copyWorkspaceFolderPaths links a selected workspace folder to GitHub", async () => {
  const folder = createFolder("home", "/workspace/home");
  const linkedFolders: string[] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [folder],
    showQuickPick: async (items) => items[0],
    showActionQuickPick: async (items) =>
      items.find((item) => item.action === "linkToGitHub"),
    linkWorkspaceFolderToGitHub: async (pickedFolder) => {
      linkedFolders.push(pickedFolder.uri.fsPath);
    },
  }));

  assert.deepEqual(linkedFolders, ["/workspace/home"]);
});

test("copyWorkspaceFolderPaths opens resolved PR or issue links for selected folders", async () => {
  const first = createFolder("api", "/worktrees/api");
  const openedUrls: string[][] = [];
  const infoMessages: string[] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [first],
    showQuickPick: async (items) => items[0],
    showActionQuickPick: async (items) =>
      items.find((item) => item.action === "openLinks"),
    resolveWorkspaceFolderLink: async () => ({
      kind: "pr",
      url: "https://github.com/example/repo/pull/42",
    }),
    openExternalUrls: async (urls) => {
      openedUrls.push([...urls]);
    },
    showInformationMessage: async (message) => {
      infoMessages.push(message);
      return undefined;
    },
  }));

  assert.deepEqual(openedUrls, [[
    "https://github.com/example/repo/pull/42",
  ]]);
  assert.deepEqual(infoMessages, ["Opened 1 PR or issue link."]);
});

test("copyWorkspaceFolderPaths reports when no PR or issue links are found", async () => {
  const folder = createFolder("home", "/workspace/home");
  const openedUrls: string[][] = [];
  const infoMessages: string[] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [folder],
    showQuickPick: async (items) => items[0],
    showActionQuickPick: async (items) =>
      items.find((item) => item.action === "openLinks"),
    resolveWorkspaceFolderLink: async () => undefined,
    openExternalUrls: async (urls) => {
      openedUrls.push([...urls]);
    },
    showInformationMessage: async (message) => {
      infoMessages.push(message);
      return undefined;
    },
  }));

  assert.deepEqual(openedUrls, []);
  assert.deepEqual(infoMessages, [
    "No PR or issue links were found for the selected folders.",
  ]);
});

test("copyWorkspaceFolderPaths reveals a single existing folder when chosen", async () => {
  const folder = createFolder("home", "/workspace/home");
  const revealedPaths: string[] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [folder],
    showQuickPick: async (items) => items[0],
    showActionQuickPick: async (items) =>
      items.find((item) => item.action === "revealInExplorer"),
    revealPath: async (fsPath) => {
      revealedPaths.push(fsPath);
    },
  }));

  assert.deepEqual(revealedPaths, ["/workspace/home"]);
});

test("copyWorkspaceFolderPaths pulls remote branches for every selected folder", async () => {
  const folder = createFolder("home", "/workspace/home");
  const pulledSelections: string[][] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [folder],
    getFolderUiState: async () => ({
      isGitWorktree: false,
      hasGitChanges: false,
      hasRemoteBranchTracking: true,
      remoteBranchMoved: false,
      baseBranchMoved: false,
      dirtyEditors: 0,
    }),
    showQuickPick: async (items) => items[0],
    showActionQuickPick: async (items) =>
      items.find((item) => item.action === "pullRemoteBranch"),
    pullRemoteBranches: async (folderPaths) => {
      pulledSelections.push([...folderPaths]);
    },
  }));

  assert.deepEqual(pulledSelections, [["/workspace/home"]]);
});

test("copyWorkspaceFolderPaths pulls base repositories for selected worktrees", async () => {
  const folder = createFolder("feature-scratch", "/worktrees/feature-scratch");
  const pulledSelections: string[][] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [folder],
    getFolderUiState: async () => ({
      isGitWorktree: true,
      hasGitChanges: false,
      hasRemoteBranchTracking: false,
      remoteBranchMoved: false,
      baseBranchMoved: false,
      dirtyEditors: 0,
    }),
    showQuickPick: async (items) => items[0],
    showActionQuickPick: async (items) =>
      items.find((item) => item.action === "pullBaseRepository"),
    pullBaseRepositories: async (folderPaths) => {
      pulledSelections.push([...folderPaths]);
    },
  }));

  assert.deepEqual(pulledSelections, [["/worktrees/feature-scratch"]]);
});

test("copyWorkspaceFolderPaths rebases a folder onto the base branch", async () => {
  const folder = createFolder("feature-scratch", "/worktrees/feature-scratch");
  const rebasedPaths: string[] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [folder],
    getFolderUiState: async () => ({
      isGitWorktree: true,
      hasGitChanges: false,
      hasRemoteBranchTracking: false,
      remoteBranchMoved: false,
      baseBranchMoved: true,
      dirtyEditors: 0,
    }),
    showQuickPick: async (items) => items[0],
    showActionQuickPick: async (items) =>
      items.find((item) => item.action === "rebaseOntoBaseBranch"),
    rebaseOntoBaseBranch: async (folderPath) => {
      rebasedPaths.push(folderPath);
    },
  }));

  assert.deepEqual(rebasedPaths, ["/worktrees/feature-scratch"]);
});

test("copyWorkspaceFolderPaths removes selected cleanup candidates through the action picker", async () => {
  const folder = createFolder("api", "/worktrees/api");
  const removed: string[] = [];
  const removedFromWorkspace: Array<{ workspaceFilePath: string; folderPath: string }> = [];
  const confirmations: string[] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [folder],
    inspectWorkspaceFolder: async () => createPrWorktreeCandidate(),
    showQuickPick: async (items, options) => {
      let currentItems = items;
      if (options.loadItems) {
        await options.loadItems((nextItems) => {
          currentItems = nextItems;
        });
      }
      return currentItems[0];
    },
    showActionQuickPick: async (items) =>
      items.find((item) => item.action === "removeCleanupItems"),
    confirmRemoval: async (message) => {
      confirmations.push(message);
      return true;
    },
    removeWorktree: async (folderPath) => {
      removed.push(folderPath);
    },
    removeFolderFromWorkspace: async (workspaceFilePath, folderPath) => {
      removedFromWorkspace.push({ workspaceFilePath, folderPath });
    },
  }));

  assert.deepEqual(confirmations, [
    "Remove worktree for api (merged PR #42)?",
  ]);
  assert.deepEqual(removed, ["/worktrees/api"]);
  assert.deepEqual(removedFromWorkspace, [
    {
      workspaceFilePath: "/workspace/home.code-workspace",
      folderPath: "/worktrees/api",
    },
  ]);
});

test("copyWorkspaceFolderPaths removes a regular worktree through the action picker", async () => {
  const folder = createFolder("feature-scratch", "/worktrees/feature-scratch");
  const removed: string[] = [];
  const removedFromWorkspace: Array<{ workspaceFilePath: string; folderPath: string }> = [];
  const confirmations: string[] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [folder],
    getFolderUiState: async () => ({
      isGitWorktree: true,
      hasGitChanges: false,
      hasRemoteBranchTracking: false,
      remoteBranchMoved: false,
      baseBranchMoved: false,
      dirtyEditors: 0,
    }),
    showQuickPick: async (items) => items[0],
    showActionQuickPick: async (items) =>
      items.find((item) => item.action === "removeCleanupItems"),
    confirmRemoval: async (message) => {
      confirmations.push(message);
      return true;
    },
    removeWorktree: async (folderPath) => {
      removed.push(folderPath);
    },
    removeFolderFromWorkspace: async (workspaceFilePath, folderPath) => {
      removedFromWorkspace.push({ workspaceFilePath, folderPath });
    },
  }));

  assert.deepEqual(confirmations, [
    "Remove worktree for feature-scratch?",
  ]);
  assert.deepEqual(removed, ["/worktrees/feature-scratch"]);
  assert.deepEqual(removedFromWorkspace, [
    {
      workspaceFilePath: "/workspace/home.code-workspace",
      folderPath: "/worktrees/feature-scratch",
    },
  ]);
});

test("copyWorkspaceFolderPaths removes a regular folder from the workspace only", async () => {
  const folder = createFolder("home", "/workspace/home");
  const removed: string[] = [];
  const removedFromWorkspace: Array<{ workspaceFilePath: string; folderPath: string }> = [];
  const confirmations: string[] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [folder],
    getFolderUiState: async () => ({
      isGitWorktree: false,
      hasGitChanges: false,
      hasRemoteBranchTracking: true,
      remoteBranchMoved: false,
      baseBranchMoved: false,
      dirtyEditors: 0,
    }),
    showQuickPick: async (items) => items[0],
    showActionQuickPick: async (items) =>
      items.find((item) => item.action === "removeCleanupItems"),
    confirmRemoval: async (message) => {
      confirmations.push(message);
      return true;
    },
    removeWorktree: async (folderPath) => {
      removed.push(folderPath);
    },
    removeFolderFromWorkspace: async (workspaceFilePath, folderPath) => {
      removedFromWorkspace.push({ workspaceFilePath, folderPath });
    },
  }));

  assert.deepEqual(confirmations, [
    "Remove home from the workspace?",
  ]);
  assert.deepEqual(removed, []);
  assert.deepEqual(removedFromWorkspace, [
    {
      workspaceFilePath: "/workspace/home.code-workspace",
      folderPath: "/workspace/home",
    },
  ]);
});

test("copyWorkspaceFolderPaths removes selected closed-issue cleanup candidates through the action picker", async () => {
  const folder = createFolder("piglet-issue-1687", "/worktrees/piglet-issue-1687");
  const removed: string[] = [];
  const confirmations: string[] = [];

  await copyWorkspaceFolderPaths(createCopyWorkspaceFolderPathsDependencies({
    workspaceFolders: [folder],
    inspectWorkspaceFolder: async () => createIssueWorktreeCandidate(),
    showQuickPick: async (items, options) => {
      let currentItems = items;
      if (options.loadItems) {
        await options.loadItems((nextItems) => {
          currentItems = nextItems;
        });
      }
      return currentItems[0];
    },
    showActionQuickPick: async (items) =>
      items.find((item) => item.action === "removeCleanupItems"),
    confirmRemoval: async (message) => {
      confirmations.push(message);
      return true;
    },
    removeWorktree: async (folderPath) => {
      removed.push(folderPath);
    },
  }));

  assert.deepEqual(confirmations, [
    "Remove worktree for piglet-issue-1687 (closed issue #1687)?",
  ]);
  assert.deepEqual(removed, ["/worktrees/piglet-issue-1687"]);
});

test("removeClosedOrMergedPrWorktrees shows a message when no workspace folders are open", async () => {
  const messages: string[] = [];

  await removeClosedOrMergedPrWorktrees({
    workspaceFolders: undefined,
    workspaceFilePath: "/workspace/home.code-workspace",
    inspectWorkspaceFolder: async () => undefined,
    showQuickPick: async () => undefined,
    confirmRemoval: async () => false,
    removeWorktree: async () => undefined,
    removeFolderFromWorkspace: async () => undefined,
    showInformationMessage: async (message) => {
      messages.push(message);
      return undefined;
    },
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(messages, ["No workspace folders are open."]);
});

test("removeClosedOrMergedPrWorktrees shows a message when no removable worktrees are found", async () => {
  const messages: string[] = [];

  await removeClosedOrMergedPrWorktrees({
    workspaceFolders: [createFolder("api", "/worktrees/api")],
    workspaceFilePath: "/workspace/home.code-workspace",
    inspectWorkspaceFolder: async () => undefined,
    showQuickPick: async () => undefined,
    confirmRemoval: async () => false,
    removeWorktree: async () => undefined,
    removeFolderFromWorkspace: async () => undefined,
    showInformationMessage: async (message) => {
      messages.push(message);
      return undefined;
    },
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(messages, [
    "No closed, merged, or missing worktree folders were found.",
  ]);
});

test("removeClosedOrMergedPrWorktrees removes missing workspace folders without removing a worktree", async () => {
  const removed: string[] = [];
  const removedFromWorkspace: Array<{ workspaceFilePath: string; folderPath: string }> = [];
  const confirmations: string[] = [];
  const messages: string[] = [];

  await removeClosedOrMergedPrWorktrees({
    workspaceFolders: [createFolder("old-api", "/worktrees/old-api")],
    workspaceFilePath: "/workspace/home.code-workspace",
    inspectWorkspaceFolder: async () => createMissingWorkspaceFolderCandidate(),
    showQuickPick: async (items) => items[0],
    confirmRemoval: async (message) => {
      confirmations.push(message);
      return true;
    },
    removeWorktree: async (folderPath) => {
      removed.push(folderPath);
    },
    removeFolderFromWorkspace: async (workspaceFilePath, folderPath) => {
      removedFromWorkspace.push({ workspaceFilePath, folderPath });
    },
    showInformationMessage: async (message) => {
      messages.push(message);
      return undefined;
    },
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(removed, []);
  assert.deepEqual(removedFromWorkspace, [
    {
      workspaceFilePath: "/workspace/home.code-workspace",
      folderPath: "/worktrees/old-api",
    },
  ]);
  assert.deepEqual(confirmations, [
    "Remove missing workspace folder entry for old-api?",
  ]);
  assert.deepEqual(messages, [
    "Removed missing workspace folder: /worktrees/old-api",
  ]);
});

test("removeClosedOrMergedPrWorktrees warns instead of removing dirty worktrees", async () => {
  const warnings: string[] = [];
  const removed: string[] = [];

  await removeClosedOrMergedPrWorktrees({
    workspaceFolders: [createFolder("api", "/worktrees/api")],
    workspaceFilePath: "/workspace/home.code-workspace",
    inspectWorkspaceFolder: async () =>
      createPrWorktreeCandidate({ isDirty: true }),
    showQuickPick: async (items) => items[0],
    confirmRemoval: async () => true,
    removeWorktree: async (folderPath) => {
      removed.push(folderPath);
    },
    removeFolderFromWorkspace: async () => undefined,
    showInformationMessage: async () => undefined,
    showWarningMessage: async (message) => {
      warnings.push(message);
      return undefined;
    },
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(warnings, [
    "Worktrees have uncommitted changes: api",
  ]);
  assert.deepEqual(removed, []);
});

test("removeClosedOrMergedPrWorktrees removes the selected worktree and updates the workspace file", async () => {
  const removed: string[] = [];
  const removedFromWorkspace: Array<{ workspaceFilePath: string; folderPath: string }> = [];
  const messages: string[] = [];

  await removeClosedOrMergedPrWorktrees({
    workspaceFolders: [createFolder("api", "/worktrees/api")],
    workspaceFilePath: "/workspace/home.code-workspace",
    inspectWorkspaceFolder: async () => createPrWorktreeCandidate(),
    showQuickPick: async (items) => items[0],
    confirmRemoval: async () => true,
    removeWorktree: async (folderPath) => {
      removed.push(folderPath);
    },
    removeFolderFromWorkspace: async (workspaceFilePath, folderPath) => {
      removedFromWorkspace.push({ workspaceFilePath, folderPath });
    },
    showInformationMessage: async (message) => {
      messages.push(message);
      return undefined;
    },
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(removed, ["/worktrees/api"]);
  assert.deepEqual(removedFromWorkspace, [
    {
      workspaceFilePath: "/workspace/home.code-workspace",
      folderPath: "/worktrees/api",
    },
  ]);
  assert.deepEqual(messages, ["Removed worktree: /worktrees/api"]);
});

test("removeClosedOrMergedPrWorktrees skips workspace file updates when no workspace file is open", async () => {
  const removedFromWorkspace: string[] = [];

  await removeClosedOrMergedPrWorktrees({
    workspaceFolders: [createFolder("api", "/worktrees/api")],
    workspaceFilePath: undefined,
    inspectWorkspaceFolder: async () => createPrWorktreeCandidate(),
    showQuickPick: async (items) => items[0],
    confirmRemoval: async () => true,
    removeWorktree: async () => undefined,
    removeFolderFromWorkspace: async (_workspaceFilePath, folderPath) => {
      removedFromWorkspace.push(folderPath);
    },
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(removedFromWorkspace, []);
});

test("removeClosedOrMergedPrWorktrees stops when removal confirmation is declined", async () => {
  const removed: string[] = [];
  const removedFromWorkspace: string[] = [];

  await removeClosedOrMergedPrWorktrees({
    workspaceFolders: [createFolder("api", "/worktrees/api")],
    workspaceFilePath: "/workspace/home.code-workspace",
    inspectWorkspaceFolder: async () => createPrWorktreeCandidate(),
    showQuickPick: async (items) => items[0],
    confirmRemoval: async () => false,
    removeWorktree: async (folderPath) => {
      removed.push(folderPath);
    },
    removeFolderFromWorkspace: async (_workspaceFilePath, folderPath) => {
      removedFromWorkspace.push(folderPath);
    },
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(removed, []);
  assert.deepEqual(removedFromWorkspace, []);
});

test("addWorkspaceFolder requires a saved workspace file", async () => {
  const messages: string[] = [];

  await addWorkspaceFolder({
    workspaceFilePath: undefined,
    workspaceFolderRoots: ["/root"],
    pathExists: () => true,
    listWorkspaceFolderCandidates: async () => [],
    showRootQuickPick: async () => undefined,
    showFolderQuickPick: async () => undefined,
    showInputBox: async () => undefined,
    createDirectory: async () => undefined,
    addFolderToWorkspace: async () => "added",
    showInformationMessage: async (message) => {
      messages.push(message);
      return undefined;
    },
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(messages, [
    "The current window must use a saved .code-workspace file.",
  ]);
});

test("addWorkspaceFolder requires the workspace folder root setting", async () => {
  const messages: string[] = [];

  await addWorkspaceFolder({
    workspaceFilePath: "/workspace/home.code-workspace",
    workspaceFolderRoots: ["   "],
    pathExists: () => true,
    listWorkspaceFolderCandidates: async () => [],
    showRootQuickPick: async () => undefined,
    showFolderQuickPick: async () => undefined,
    showInputBox: async () => undefined,
    createDirectory: async () => undefined,
    addFolderToWorkspace: async () => "added",
    showInformationMessage: async (message) => {
      messages.push(message);
      return undefined;
    },
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(messages, [
    "Set workspaceActions.workspaceFolderRoots before using this command.",
  ]);
});

test("addWorkspaceFolder shows an error when the configured root does not exist", async () => {
  const errors: string[] = [];

  await addWorkspaceFolder({
    workspaceFilePath: "/workspace/home.code-workspace",
    workspaceFolderRoots: ["/missing"],
    pathExists: () => false,
    listWorkspaceFolderCandidates: async () => [],
    showRootQuickPick: async () => undefined,
    showFolderQuickPick: async () => undefined,
    showInputBox: async () => undefined,
    createDirectory: async () => undefined,
    addFolderToWorkspace: async () => "added",
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async (message) => {
      errors.push(message);
      return undefined;
    },
  });

  assert.deepEqual(errors, [
    "Configured workspace folder root does not exist: /missing",
  ]);
});

test("addWorkspaceFolder adds an existing folder from the picker", async () => {
  const addedFolders: Array<{ workspaceFilePath: string; folderPath: string }> = [];
  const seenLabels: string[] = [];
  const infoMessages: string[] = [];
  let rootPickerCalled = false;

  await addWorkspaceFolder({
    workspaceFilePath: "/workspace/home.code-workspace",
    workspaceFolderRoots: ["/root"],
    pathExists: () => true,
    listWorkspaceFolderCandidates: async () => [
      createFolderCandidate("blog", "/root/blog", 5),
      createFolderCandidate("api", "/root/api", 10),
    ],
    showRootQuickPick: async () => {
      rootPickerCalled = true;
      return undefined;
    },
    showFolderQuickPick: async (items) => {
      seenLabels.push(...items.map((item) => item.label));
      return items[1];
    },
    showInputBox: async () => undefined,
    createDirectory: async () => undefined,
    addFolderToWorkspace: async (workspaceFilePath, folderPath) => {
      addedFolders.push({ workspaceFilePath, folderPath });
      return "added";
    },
    showInformationMessage: async (message) => {
      infoMessages.push(message);
      return undefined;
    },
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(seenLabels, [
    "$(add) Create New Folder...",
    "api",
    "blog",
  ]);
  assert.deepEqual(addedFolders, [
    {
      workspaceFilePath: "/workspace/home.code-workspace",
      folderPath: "/root/api",
    },
  ]);
  assert.equal(rootPickerCalled, false);
  assert.deepEqual(infoMessages, []);
});

test("addWorkspaceFolder creates a new folder before adding it to the workspace", async () => {
  const createdFolders: string[] = [];
  const addedFolders: string[] = [];

  await addWorkspaceFolder({
    workspaceFilePath: "/workspace/home.code-workspace",
    workspaceFolderRoots: ["/root"],
    pathExists: (fsPath) => fsPath === "/root",
    listWorkspaceFolderCandidates: async () => [],
    showRootQuickPick: async () => undefined,
    showFolderQuickPick: async (items) => items[0],
    showInputBox: async () => "new-app",
    createDirectory: async (fsPath) => {
      createdFolders.push(fsPath);
    },
    addFolderToWorkspace: async (_workspaceFilePath, folderPath) => {
      addedFolders.push(folderPath);
      return "added";
    },
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(createdFolders, ["/root/new-app"]);
  assert.deepEqual(addedFolders, ["/root/new-app"]);
});

test("addWorkspaceFolder warns when a new folder already exists", async () => {
  const warnings: string[] = [];
  const addedFolders: string[] = [];

  await addWorkspaceFolder({
    workspaceFilePath: "/workspace/home.code-workspace",
    workspaceFolderRoots: ["/root"],
    pathExists: () => true,
    listWorkspaceFolderCandidates: async () => [],
    showRootQuickPick: async () => undefined,
    showFolderQuickPick: async (items) => items[0],
    showInputBox: async () => "existing-app",
    createDirectory: async () => undefined,
    addFolderToWorkspace: async (_workspaceFilePath, folderPath) => {
      addedFolders.push(folderPath);
      return "added";
    },
    showInformationMessage: async () => undefined,
    showWarningMessage: async (message) => {
      warnings.push(message);
      return undefined;
    },
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(warnings, ["Folder already exists: existing-app"]);
  assert.deepEqual(addedFolders, []);
});

test("addWorkspaceFolder reports when the folder is already in the workspace", async () => {
  const messages: string[] = [];

  await addWorkspaceFolder({
    workspaceFilePath: "/workspace/home.code-workspace",
    workspaceFolderRoots: ["/root"],
    pathExists: () => true,
    listWorkspaceFolderCandidates: async () => [
      createFolderCandidate("blog", "/root/blog", 5),
    ],
    showRootQuickPick: async () => undefined,
    showFolderQuickPick: async (items) => items[1],
    showInputBox: async () => undefined,
    createDirectory: async () => undefined,
    addFolderToWorkspace: async () => "alreadyExists",
    showInformationMessage: async (message) => {
      messages.push(message);
      return undefined;
    },
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(messages, [
    "Folder is already in the workspace: /root/blog",
  ]);
});

test("addWorkspaceFolder asks for a root first when multiple roots are configured", async () => {
  const addedFolders: string[] = [];
  const rootLabels: string[] = [];

  await addWorkspaceFolder({
    workspaceFilePath: "/workspace/home.code-workspace",
    workspaceFolderRoots: ["/roots/one", "/roots/two"],
    pathExists: () => true,
    listWorkspaceFolderCandidates: async (rootPath) =>
      rootPath === "/roots/two"
        ? [createFolderCandidate("app", "/roots/two/app", 10)]
        : [],
    showRootQuickPick: async (items) => {
      rootLabels.push(...items.map((item) => item.label));
      return items[1];
    },
    showFolderQuickPick: async (items) => items[1],
    showInputBox: async () => undefined,
    createDirectory: async () => undefined,
    addFolderToWorkspace: async (_workspaceFilePath, folderPath) => {
      addedFolders.push(folderPath);
      return "added";
    },
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(rootLabels, ["one", "two"]);
  assert.deepEqual(addedFolders, ["/roots/two/app"]);
});

test("addWorkspaceFolder stops when the root picker is cancelled", async () => {
  let folderPickerCalled = false;
  const addedFolders: string[] = [];

  await addWorkspaceFolder({
    workspaceFilePath: "/workspace/home.code-workspace",
    workspaceFolderRoots: ["/roots/one", "/roots/two"],
    pathExists: () => true,
    listWorkspaceFolderCandidates: async () => [
      createFolderCandidate("app", "/roots/one/app", 10),
    ],
    showRootQuickPick: async () => undefined,
    showFolderQuickPick: async () => {
      folderPickerCalled = true;
      return undefined;
    },
    showInputBox: async () => undefined,
    createDirectory: async () => undefined,
    addFolderToWorkspace: async (_workspaceFilePath, folderPath) => {
      addedFolders.push(folderPath);
      return "added";
    },
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  });

  assert.equal(folderPickerCalled, false);
  assert.deepEqual(addedFolders, []);
});

test("addWorkspaceFolder stops when new folder name input is cancelled", async () => {
  const createdFolders: string[] = [];
  const addedFolders: string[] = [];

  await addWorkspaceFolder({
    workspaceFilePath: "/workspace/home.code-workspace",
    workspaceFolderRoots: ["/root"],
    pathExists: (fsPath) => fsPath === "/root",
    listWorkspaceFolderCandidates: async () => [],
    showRootQuickPick: async () => undefined,
    showFolderQuickPick: async (items) => items[0],
    showInputBox: async () => undefined,
    createDirectory: async (fsPath) => {
      createdFolders.push(fsPath);
    },
    addFolderToWorkspace: async (_workspaceFilePath, folderPath) => {
      addedFolders.push(folderPath);
      return "added";
    },
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(createdFolders, []);
  assert.deepEqual(addedFolders, []);
});

test("addWorkspaceFolder warns when new folder name input is blank", async () => {
  const warnings: string[] = [];
  const createdFolders: string[] = [];

  await addWorkspaceFolder({
    workspaceFilePath: "/workspace/home.code-workspace",
    workspaceFolderRoots: ["/root"],
    pathExists: (fsPath) => fsPath === "/root",
    listWorkspaceFolderCandidates: async () => [],
    showRootQuickPick: async () => undefined,
    showFolderQuickPick: async (items) => items[0],
    showInputBox: async () => "   ",
    createDirectory: async (fsPath) => {
      createdFolders.push(fsPath);
    },
    addFolderToWorkspace: async () => "added",
    showInformationMessage: async () => undefined,
    showWarningMessage: async (message) => {
      warnings.push(message);
      return undefined;
    },
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(warnings, ["Folder name is required."]);
  assert.deepEqual(createdFolders, []);
});

test("toNewWorkspaceFileContent includes the containing folder", () => {
  assert.equal(
    toNewWorkspaceFileContent(),
    `{
  "folders": [
    {
      "path": "."
    }
  ],
  "settings": {}
}
`,
  );
});

test("createWorkspace requires the workspace root setting", async () => {
  const messages: string[] = [];

  await createWorkspace(createCreateWorkspaceDependencies({
    workspaceRoots: ["   "],
    showInformationMessage: async (message) => {
      messages.push(message);
      return undefined;
    },
  }));

  assert.deepEqual(messages, [
    "Set workspaceActions.workspaceRoots before using this command.",
  ]);
});

test("createWorkspace shows an error when the configured root does not exist", async () => {
  const errors: string[] = [];

  await createWorkspace(createCreateWorkspaceDependencies({
    workspaceRoots: ["/missing"],
    pathExists: () => false,
    showInputBox: async () => "new-home",
    showErrorMessage: async (message) => {
      errors.push(message);
      return undefined;
    },
  }));

  assert.deepEqual(errors, [
    "Configured workspace root does not exist: /missing",
  ]);
});

test("createWorkspace creates and opens a workspace with itself as a folder", async () => {
  const createdFolders: string[] = [];
  const writtenFiles: Array<{ fsPath: string; content: string }> = [];
  const openedWorkspaces: string[] = [];
  const infoMessages: string[] = [];

  await createWorkspace(createCreateWorkspaceDependencies({
    showRootQuickPick: async () => {
      throw new Error("should not be called");
    },
    showInputBox: async () => "new-home",
    createDirectory: async (fsPath) => {
      createdFolders.push(fsPath);
    },
    writeFile: async (fsPath, content) => {
      writtenFiles.push({ fsPath, content });
    },
    openWorkspace: async (workspaceFilePath) => {
      openedWorkspaces.push(workspaceFilePath);
    },
    showInformationMessage: async (message) => {
      infoMessages.push(message);
      return undefined;
    },
  }));

  assert.deepEqual(createdFolders, ["/workspaces/new-home"]);
  assert.deepEqual(writtenFiles, [
    {
      fsPath: "/workspaces/new-home/new-home.code-workspace",
      content: toNewWorkspaceFileContent(),
    },
  ]);
  assert.deepEqual(infoMessages, [
    "Created workspace: /workspaces/new-home/new-home.code-workspace",
  ]);
  assert.deepEqual(openedWorkspaces, [
    "/workspaces/new-home/new-home.code-workspace",
  ]);
});

test("createWorkspace opens without waiting for the notification", async () => {
  const openedWorkspaces: string[] = [];

  await createWorkspace(createCreateWorkspaceDependencies({
    showInputBox: async () => "quick-open",
    openWorkspace: async (workspaceFilePath) => {
      openedWorkspaces.push(workspaceFilePath);
    },
    showInformationMessage: () => new Promise(() => undefined),
  }));

  assert.deepEqual(openedWorkspaces, [
    "/workspaces/quick-open/quick-open.code-workspace",
  ]);
});

test("createWorkspace asks for a root first when multiple roots are configured", async () => {
  const rootLabels: string[] = [];
  const createdFolders: string[] = [];

  await createWorkspace(createCreateWorkspaceDependencies({
    workspaceRoots: ["/roots/one", "/roots/two"],
    pathExists: (fsPath) => fsPath === "/roots/one" || fsPath === "/roots/two",
    showRootQuickPick: async (items) => {
      rootLabels.push(...items.map((item) => item.label));
      return items[1];
    },
    showInputBox: async () => "project",
    createDirectory: async (fsPath) => {
      createdFolders.push(fsPath);
    },
  }));

  assert.deepEqual(rootLabels, ["one", "two"]);
  assert.deepEqual(createdFolders, ["/roots/two/project"]);
});

test("createWorkspace stops when the root picker is cancelled", async () => {
  let nameInputCalled = false;

  await createWorkspace(createCreateWorkspaceDependencies({
    workspaceRoots: ["/roots/one", "/roots/two"],
    showRootQuickPick: async () => undefined,
    showInputBox: async () => {
      nameInputCalled = true;
      return undefined;
    },
  }));

  assert.equal(nameInputCalled, false);
});

test("createWorkspace stops when the name input is cancelled", async () => {
  const createdFolders: string[] = [];

  await createWorkspace(createCreateWorkspaceDependencies({
    showInputBox: async () => undefined,
    createDirectory: async (fsPath) => {
      createdFolders.push(fsPath);
    },
  }));

  assert.deepEqual(createdFolders, []);
});

test("createWorkspace warns when the workspace already exists", async () => {
  const warnings: string[] = [];
  const createdFolders: string[] = [];

  await createWorkspace(createCreateWorkspaceDependencies({
    pathExists: (fsPath) =>
      fsPath === "/workspaces" || fsPath === "/workspaces/existing",
    showInputBox: async () => "existing",
    createDirectory: async (fsPath) => {
      createdFolders.push(fsPath);
    },
    writeFile: async () => undefined,
    openWorkspace: async () => undefined,
    showInformationMessage: async () => undefined,
    showWarningMessage: async (message) => {
      warnings.push(message);
      return undefined;
    },
  }));

  assert.deepEqual(warnings, [
    "Workspace already exists: /workspaces/existing",
  ]);
  assert.deepEqual(createdFolders, []);
});

test("createWorkspace rejects blank and nested workspace names", async () => {
  const warnings: string[] = [];

  await createWorkspace(createCreateWorkspaceDependencies({
    showInputBox: async () => "nested/project",
    createDirectory: async () => {
      throw new Error("should not be called");
    },
    showWarningMessage: async (message) => {
      warnings.push(message);
      return undefined;
    },
  }));

  await createWorkspace(createCreateWorkspaceDependencies({
    showInputBox: async () => "   ",
    createDirectory: async () => {
      throw new Error("should not be called");
    },
    showWarningMessage: async (message) => {
      warnings.push(message);
      return undefined;
    },
  }));

  assert.deepEqual(warnings, [
    "Workspace name cannot contain path separators.",
    "Workspace name is required.",
  ]);
});

test("addWorkspaceFolderFromUrl requires a saved workspace file", async () => {
  const messages: string[] = [];

  await addWorkspaceFolderFromUrl({
    workspaceFilePath: undefined,
    showInputBox: async () => undefined,
    createWorkspaceFolderFromUrl: async () => {
      throw new Error("should not be called");
    },
    addFolderToWorkspace: async () => "added",
    showInformationMessage: async (message) => {
      messages.push(message);
      return undefined;
    },
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(messages, [
    "The current window must use a saved .code-workspace file.",
  ]);
});

test("addWorkspaceFolderFromUrl rejects invalid GitHub URLs", async () => {
  const errors: string[] = [];

  await addWorkspaceFolderFromUrl({
    workspaceFilePath: "/workspace/home.code-workspace",
    showInputBox: async () => "https://github.com/aicers/piglet/discussions/1735",
    createWorkspaceFolderFromUrl: async () => {
      throw new Error("should not be called");
    },
    addFolderToWorkspace: async () => "added",
    showInformationMessage: async () => undefined,
    showErrorMessage: async (message) => {
      errors.push(message);
      return undefined;
    },
  });

  assert.deepEqual(errors, [
    "Enter a GitHub issue or pull request URL.",
  ]);
});

test("addWorkspaceFolderFromUrl creates a linked workspace folder from a URL", async () => {
  const metadata = createWorkspaceLinkMetadata();
  const created: string[] = [];
  const added: Array<{ workspaceFilePath: string; folderPath: string; metadata: unknown }> = [];
  const infoMessages: string[] = [];

  await addWorkspaceFolderFromUrl({
    workspaceFilePath: "/workspace/home.code-workspace",
    showInputBox: async () => metadata.url,
    createWorkspaceFolderFromUrl: async (parsedMetadata) => {
      created.push(parsedMetadata.url);
      return {
        folderPath: "/worktrees/piglet-is-1735",
        metadata: parsedMetadata,
      };
    },
    addFolderToWorkspace: async (workspaceFilePath, folderPath, parsedMetadata) => {
      added.push({ workspaceFilePath, folderPath, metadata: parsedMetadata });
      return "added";
    },
    showInformationMessage: async (message) => {
      infoMessages.push(message);
      return undefined;
    },
    showErrorMessage: async () => undefined,
  });

  assert.deepEqual(created, [metadata.url]);
  assert.deepEqual(added, [
    {
      workspaceFilePath: "/workspace/home.code-workspace",
      folderPath: "/worktrees/piglet-is-1735",
      metadata,
    },
  ]);
  assert.deepEqual(infoMessages, [
    "Added workspace folder from URL: /worktrees/piglet-is-1735",
  ]);
});
