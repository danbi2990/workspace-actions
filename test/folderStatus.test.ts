import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFolderStatusSummaries,
  collectFolderStatusCounts,
  formatFolderStatusSummary,
  getBaseBranchRefCandidates,
  getFetchRemoteCandidates,
  isPathInsideFolder,
  refreshBaseBranchForRepositories,
  repositoryNeedsBaseBranchUpdate,
  repositoryNeedsRemoteBranchUpdate,
  type GitRepositoryLike,
} from "../src/folderStatus";
import { type WorkspaceFolderLike } from "../src/commands";

function createFolder(name: string, fsPath: string): WorkspaceFolderLike {
  return {
    name,
    uri: {
      fsPath,
    },
  };
}

function createRepository(
  fsPath: string,
  options: {
    baseCommit?: string;
    behind?: number;
    modified?: number;
    staged?: number;
    untracked?: number;
    merge?: number;
    headName?: string;
  } = {},
): GitRepositoryLike {
  const {
    baseCommit = "base-tip",
    behind,
    modified,
    staged,
    untracked,
    merge,
    headName = "feature/foo",
  } = options;

  return {
    rootUri: {
      fsPath,
    },
    getBranch: async (name: string) => {
      if (name === "origin/main" || name === "main") {
        return {
          name,
          commit: baseCommit,
        };
      }

      return undefined;
    },
    getMergeBase: async () =>
      behind !== undefined && behind > 0 ? "old-base" : baseCommit,
    fetch: async () => undefined,
    state: {
      HEAD: {
        name: headName,
        commit: "head-tip",
        behind,
        upstream: {
          name: headName,
          remote: "origin",
        },
      },
      remotes: [{ name: "origin", fetchUrl: "git@example.com/repo.git" }],
      mergeChanges: new Array(merge ?? 0).fill({}),
      indexChanges: new Array(staged ?? 0).fill({}),
      workingTreeChanges: new Array(modified ?? 0).fill({}),
      untrackedChanges: new Array(untracked ?? 0).fill({}),
    },
  };
}

test("isPathInsideFolder matches nested paths only", () => {
  assert.equal(
    isPathInsideFolder("/workspace/home", "/workspace/home"),
    true,
  );
  assert.equal(
    isPathInsideFolder(
      "/workspace/home",
      "/workspace/home/packages/app",
    ),
    true,
  );
  assert.equal(
    isPathInsideFolder("/workspace/home", "/workspace/home-2"),
    false,
  );
});

test("collectFolderStatusCounts aggregates git and dirty editor counts", () => {
  const counts = collectFolderStatusCounts(
    "/workspace/home",
    [
      createRepository("/workspace/home", {
        modified: 3,
      }),
      createRepository("/workspace/home/tools", {
        untracked: 1,
      }),
      createRepository("/workspace/other", {
        modified: 10,
      }),
    ],
    [
      "/workspace/home",
      "/workspace/home",
      "/workspace/other",
    ],
  );

  assert.deepEqual(counts, {
    hasGitRepository: true,
    hasGitChanges: true,
    hasRemoteBranchTracking: true,
    remoteBranchMoved: false,
    baseBranchMoved: false,
    dirtyEditors: 2,
  });
});

test("formatFolderStatusSummary renders the simplified status text", () => {
  assert.equal(
    formatFolderStatusSummary(
      {
        hasGitRepository: true,
        hasGitChanges: true,
        hasRemoteBranchTracking: true,
        remoteBranchMoved: false,
        baseBranchMoved: true,
        dirtyEditors: 5,
      },
      "main",
    ),
    "Git changes · 5 unsaved editors · Behind main",
  );

  assert.equal(
    formatFolderStatusSummary(
      {
        hasGitRepository: true,
        hasGitChanges: false,
        hasRemoteBranchTracking: true,
        remoteBranchMoved: false,
        baseBranchMoved: false,
        dirtyEditors: 0,
      },
      "main",
    ),
    "",
  );

  assert.equal(
    formatFolderStatusSummary(
      {
        hasGitRepository: false,
        hasGitChanges: false,
        hasRemoteBranchTracking: false,
        remoteBranchMoved: false,
        baseBranchMoved: false,
        dirtyEditors: 1,
      },
      "main",
    ),
    "1 unsaved editor",
  );
});

test("getBaseBranchRefCandidates prefers upstream remote then local branch", () => {
  const repository = createRepository("/workspace/home");

  assert.deepEqual(getBaseBranchRefCandidates(repository, "main"), [
    "origin/main",
    "main",
  ]);
});

test("getFetchRemoteCandidates prefers upstream remote then origin", () => {
  const repository = createRepository("/workspace/home");

  assert.deepEqual(getFetchRemoteCandidates(repository), ["origin"]);
});

test("repositoryNeedsBaseBranchUpdate returns true when base branch moved", async () => {
  const repository = createRepository("/workspace/home", {
    behind: 1,
  });

  assert.equal(await repositoryNeedsBaseBranchUpdate(repository, "main"), true);
});

test("repositoryNeedsBaseBranchUpdate returns false when already on base branch", async () => {
  const repository = createRepository("/workspace/home", {
    headName: "main",
  });

  assert.equal(await repositoryNeedsBaseBranchUpdate(repository, "main"), false);
});

test("repositoryNeedsRemoteBranchUpdate returns true when upstream moved", () => {
  const repository = createRepository("/workspace/home", {
    behind: 2,
  });

  assert.equal(repositoryNeedsRemoteBranchUpdate(repository), true);
});

test("repositoryNeedsRemoteBranchUpdate returns false without upstream drift", () => {
  const repository = createRepository("/workspace/home");

  assert.equal(repositoryNeedsRemoteBranchUpdate(repository), false);
});

test("refreshBaseBranchForRepositories fetches the configured base branch", async () => {
  const fetchCalls: Array<{ remote?: string; ref?: string }> = [];
  const repository = createRepository("/workspace/home");
  repository.fetch = async (options) => {
    fetchCalls.push(options ?? {});
  };

  const result = await refreshBaseBranchForRepositories([repository], "main");

  assert.deepEqual(result, { attempted: 1, refreshed: 1 });
  assert.deepEqual(fetchCalls, [{ remote: "origin", ref: "main" }]);
});

test("buildFolderStatusSummaries maps each folder to its status summary", async () => {
  const folders = [
    createFolder("home", "/workspace/home"),
    createFolder("dotfiles", "/dotfiles"),
    createFolder("empty", "/workspace/empty"),
  ];

  const summaries = await buildFolderStatusSummaries(
    folders,
    [
      createRepository("/workspace/home", {
        modified: 2,
        behind: 1,
      }),
    ],
    ["/dotfiles"],
    "main",
  );

  assert.deepEqual(summaries.get("/workspace/home"), {
    hasGitRepository: true,
    hasGitChanges: true,
    hasRemoteBranchTracking: true,
    remoteBranchMoved: true,
    baseBranchMoved: true,
    dirtyEditors: 0,
  });
  assert.deepEqual(summaries.get("/dotfiles"), {
    hasGitRepository: false,
    hasGitChanges: false,
    hasRemoteBranchTracking: false,
    remoteBranchMoved: false,
    baseBranchMoved: false,
    dirtyEditors: 1,
  });
  assert.deepEqual(summaries.get("/workspace/empty"), {
    hasGitRepository: false,
    hasGitChanges: false,
    hasRemoteBranchTracking: false,
    remoteBranchMoved: false,
    baseBranchMoved: false,
    dirtyEditors: 0,
  });
});
