import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  buildWorkspaceSubFolderTargets,
  discoverNestedGitSubFolders,
  type FileSystemLike,
} from "../src/subFolders";
import type { WorkspaceFolderLike } from "../src/commands";
import type { WorkspaceSubFolderMetadata } from "../src/workspaceFile";

const NODE_FILE_SYSTEM: FileSystemLike = {
  lstat: (fsPath) => fs.promises.lstat(fsPath),
  readdir: (fsPath) => fs.promises.readdir(fsPath, { withFileTypes: true }),
  realpath: (fsPath) => fs.promises.realpath(fsPath),
  stat: (fsPath) => fs.promises.stat(fsPath),
};

test("discoverNestedGitSubFolders finds nested git repositories up to depth two", async () => {
  const tempDirectory = await createTempDirectory();
  const rootPath = tempDirectory.path;

  try {
    await fs.promises.mkdir(path.join(rootPath, "package", ".git"), {
      recursive: true,
    });
    await fs.promises.mkdir(path.join(rootPath, "apps", "api"), {
      recursive: true,
    });
    await fs.promises.writeFile(
      path.join(rootPath, "apps", "api", ".git"),
      "gitdir: ../.git/worktrees/api\n",
    );
    await fs.promises.mkdir(
      path.join(rootPath, "node_modules", "ignored", ".git"),
      {
        recursive: true,
      },
    );
    await fs.promises.mkdir(path.join(rootPath, "deep", "a", "b", ".git"), {
      recursive: true,
    });

    const discovered = await discoverNestedGitSubFolders(
      rootPath,
      NODE_FILE_SYSTEM,
    );

    assert.deepEqual(discovered, ["apps/api", "package"]);
  } finally {
    await removeTempDirectory(tempDirectory);
  }
});

test("discoverNestedGitSubFolders does not recurse through symlinked directories", async () => {
  const tempDirectory = await createTempDirectory();
  const externalDirectory = await createTempDirectory();

  try {
    await fs.promises.mkdir(path.join(externalDirectory.path, "repo", ".git"), {
      recursive: true,
    });
    await fs.promises.symlink(
      externalDirectory.path,
      path.join(tempDirectory.path, "linked"),
    );

    const discovered = await discoverNestedGitSubFolders(
      tempDirectory.path,
      NODE_FILE_SYSTEM,
    );

    assert.deepEqual(discovered, []);
  } finally {
    await removeTempDirectory(tempDirectory);
    await removeTempDirectory(externalDirectory);
  }
});

test("buildWorkspaceSubFolderTargets merges saved remote metadata with discovered folders", async () => {
  const tempDirectory = await createTempDirectory();

  try {
    const workspaceFolder = createWorkspaceFolder("home", tempDirectory.path);
    const subFolderPath = path.join(tempDirectory.path, "workspace-actions");
    await fs.promises.mkdir(path.join(subFolderPath, ".git"), { recursive: true });

    const remote = {
      kind: "pr" as const,
      owner: "danbi2990",
      repo: "workspace-actions",
      number: 12,
      url: "https://github.com/danbi2990/workspace-actions/pull/12",
    };
    const savedMetadata = new Map<string, WorkspaceSubFolderMetadata>([
      [
        subFolderPath,
        {
          workspaceFolderPath: tempDirectory.path,
          relativePath: "workspace-actions",
          fsPath: subFolderPath,
          remote,
        },
      ],
    ]);

    const targets = await buildWorkspaceSubFolderTargets(
      [workspaceFolder],
      savedMetadata,
      NODE_FILE_SYSTEM,
    );

    assert.equal(targets.length, 1);
    assert.equal(targets[0]?.label, "home/workspace-actions");
    assert.equal(targets[0]?.validationState, "valid");
    assert.equal(targets[0]?.isActionable, true);
    assert.deepEqual(targets[0]?.remote, remote);
  } finally {
    await removeTempDirectory(tempDirectory);
  }
});

test("buildWorkspaceSubFolderTargets merges case-only duplicate entries", async () => {
  const tempDirectory = await createTempDirectory();

  try {
    const workspaceFolder = createWorkspaceFolder("home", tempDirectory.path);
    const discoveredPath = path.join(tempDirectory.path, "Repo");
    const savedPath = path.join(tempDirectory.path, "repo");
    await fs.promises.mkdir(path.join(discoveredPath, ".git"), {
      recursive: true,
    });

    const remote = {
      kind: "issue" as const,
      owner: "danbi2990",
      repo: "Repo",
      number: 5,
      url: "https://github.com/danbi2990/Repo/issues/5",
    };
    const savedMetadata = new Map<string, WorkspaceSubFolderMetadata>([
      [
        savedPath,
        {
          workspaceFolderPath: tempDirectory.path,
          relativePath: "repo",
          fsPath: savedPath,
          remote,
        },
      ],
    ]);

    const targets = await buildWorkspaceSubFolderTargets(
      [workspaceFolder],
      savedMetadata,
      NODE_FILE_SYSTEM,
    );

    assert.equal(targets.length, 1);
    assert.equal(targets[0]?.relativePath, "Repo");
    assert.equal(targets[0]?.validationState, "valid");
    assert.deepEqual(targets[0]?.remote, remote);
  } finally {
    await removeTempDirectory(tempDirectory);
  }
});

test("buildWorkspaceSubFolderTargets keeps missing saved folders but marks them non-actionable", async () => {
  const tempDirectory = await createTempDirectory();

  try {
    const workspaceFolder = createWorkspaceFolder("home", tempDirectory.path);
    const missingPath = path.join(tempDirectory.path, "missing-repo");
    const savedMetadata = new Map<string, WorkspaceSubFolderMetadata>([
      [
        missingPath,
        {
          workspaceFolderPath: tempDirectory.path,
          relativePath: "missing-repo",
          fsPath: missingPath,
        },
      ],
    ]);

    const targets = await buildWorkspaceSubFolderTargets(
      [workspaceFolder],
      savedMetadata,
      NODE_FILE_SYSTEM,
    );

    assert.equal(targets.length, 1);
    assert.equal(targets[0]?.validationState, "missing");
    assert.equal(targets[0]?.isActionable, false);
  } finally {
    await removeTempDirectory(tempDirectory);
  }
});

test("buildWorkspaceSubFolderTargets rejects symlink escapes", async () => {
  const tempDirectory = await createTempDirectory();
  const externalDirectory = await createTempDirectory();

  try {
    const workspaceFolder = createWorkspaceFolder("home", tempDirectory.path);
    const symlinkPath = path.join(tempDirectory.path, "escape");
    await fs.promises.symlink(externalDirectory.path, symlinkPath);
    const savedMetadata = new Map<string, WorkspaceSubFolderMetadata>([
      [
        symlinkPath,
        {
          workspaceFolderPath: tempDirectory.path,
          relativePath: "escape",
          fsPath: symlinkPath,
        },
      ],
    ]);

    const targets = await buildWorkspaceSubFolderTargets(
      [workspaceFolder],
      savedMetadata,
      NODE_FILE_SYSTEM,
    );

    assert.equal(targets.length, 1);
    assert.equal(targets[0]?.validationState, "invalid");
    assert.equal(targets[0]?.isActionable, false);
  } finally {
    await removeTempDirectory(tempDirectory);
    await removeTempDirectory(externalDirectory);
  }
});

function createWorkspaceFolder(name: string, fsPath: string): WorkspaceFolderLike {
  return {
    name,
    uri: {
      fsPath,
    },
  };
}

async function createTempDirectory(): Promise<{ path: string }> {
  const tempDirectoryPath = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "workspace-actions-"),
  );

  return {
    path: tempDirectoryPath,
  };
}

async function removeTempDirectory(tempDirectory: { path: string }): Promise<void> {
  await fs.promises.rm(tempDirectory.path, {
    force: true,
    recursive: true,
  });
}
