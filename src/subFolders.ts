import * as path from "node:path";
import type {
  WorkspaceFolderLike,
  WorkspaceSubFolderActionTarget,
} from "./commands";
import { runSettledWithConcurrency } from "./concurrency";
import type { WorkspaceSubFolderMetadata } from "./workspaceFile";

export interface FileSystemLike {
  lstat(fsPath: string): Promise<{
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }>;
  readdir(fsPath: string): Promise<
    readonly {
      name: string;
      isDirectory(): boolean;
      isSymbolicLink(): boolean;
    }[]
  >;
  realpath(fsPath: string): Promise<string>;
  stat(fsPath: string): Promise<{
    isDirectory(): boolean;
  }>;
}

export const SUB_FOLDER_DISCOVERY_DEPTH = 2;
const SUB_FOLDER_DISCOVERY_CONCURRENCY = 6;

const NOISY_DIRECTORY_NAMES = new Set([
  ".cache",
  ".git",
  ".hg",
  ".svn",
  ".turbo",
  ".vscode",
  "dist",
  "node_modules",
  "out",
  "target",
]);

interface SubFolderCandidate {
  workspaceFolder: WorkspaceFolderLike;
  relativePath: string;
  remote?: WorkspaceSubFolderMetadata["remote"];
}

export async function buildWorkspaceSubFolderTargets(
  workspaceFolders: readonly WorkspaceFolderLike[],
  savedMetadataByPath: ReadonlyMap<string, WorkspaceSubFolderMetadata>,
  fileSystem: FileSystemLike,
): Promise<WorkspaceSubFolderActionTarget[]> {
  const candidates = new Map<string, SubFolderCandidate>();

  for (const metadata of savedMetadataByPath.values()) {
    const workspaceFolder = workspaceFolders.find(
      (folder) =>
        path.resolve(folder.uri.fsPath) ===
          path.resolve(metadata.workspaceFolderPath),
    );
    if (!workspaceFolder) {
      continue;
    }

    candidates.set(toCandidateKey(metadata.fsPath), {
      workspaceFolder,
      relativePath: metadata.relativePath,
      remote: metadata.remote,
    });
  }

  for (const workspaceFolder of workspaceFolders) {
    for (const relativePath of await discoverNestedGitSubFolders(
      workspaceFolder.uri.fsPath,
      fileSystem,
    )) {
      const fsPath = path.resolve(workspaceFolder.uri.fsPath, relativePath);
      const key = toCandidateKey(fsPath);
      const existing = candidates.get(key);
      candidates.set(key, {
        workspaceFolder,
        relativePath,
        remote: existing?.remote,
      });
    }
  }

  const targets = await Promise.all(
    [...candidates.values()].map((candidate) =>
      toWorkspaceSubFolderActionTarget(candidate, fileSystem),
    ),
  );

  return targets.sort((left, right) => left.label.localeCompare(right.label));
}

export async function discoverNestedGitSubFolders(
  workspaceFolderPath: string,
  fileSystem: FileSystemLike,
): Promise<string[]> {
  const discovered = new Set<string>();
  await scanSubFolders(
    path.resolve(workspaceFolderPath),
    "",
    SUB_FOLDER_DISCOVERY_DEPTH,
    fileSystem,
    discovered,
  );

  return [...discovered].sort();
}

async function scanSubFolders(
  workspaceFolderPath: string,
  relativeDirectory: string,
  remainingDepth: number,
  fileSystem: FileSystemLike,
  discovered: Set<string>,
): Promise<void> {
  if (remainingDepth <= 0) {
    return;
  }

  const currentDirectory = path.resolve(workspaceFolderPath, relativeDirectory);
  let entries: Awaited<ReturnType<FileSystemLike["readdir"]>>;
  try {
    entries = await fileSystem.readdir(currentDirectory);
  } catch {
    return;
  }

  await runSettledWithConcurrency(
    entries,
    SUB_FOLDER_DISCOVERY_CONCURRENCY,
    async (entry) => {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        return;
      }

      if (NOISY_DIRECTORY_NAMES.has(entry.name)) {
        return;
      }

      const relativePath = normalizeRelativePath(
        path.join(relativeDirectory, entry.name),
      );
      if (!relativePath) {
        return;
      }

      const candidatePath = path.resolve(workspaceFolderPath, relativePath);
      if (await hasGitMetadata(candidatePath, fileSystem)) {
        discovered.add(relativePath);
        return;
      }

      await scanSubFolders(
        workspaceFolderPath,
        relativePath,
        remainingDepth - 1,
        fileSystem,
        discovered,
      );
    },
  );
}

async function toWorkspaceSubFolderActionTarget(
  candidate: SubFolderCandidate,
  fileSystem: FileSystemLike,
): Promise<WorkspaceSubFolderActionTarget> {
  const workspaceFolderPath = path.resolve(candidate.workspaceFolder.uri.fsPath);
  const fsPath = path.resolve(workspaceFolderPath, candidate.relativePath);
  const validationState = await validateSubFolderPath(
    workspaceFolderPath,
    fsPath,
    fileSystem,
  );

  return {
    kind: "subFolder",
    label: `${candidate.workspaceFolder.name}/${candidate.relativePath}`,
    folderName: path.basename(fsPath),
    fsPath,
    workspaceFolderPath,
    relativePath: candidate.relativePath,
    validationState,
    isActionable: validationState === "valid",
    remote: candidate.remote,
  };
}

async function validateSubFolderPath(
  workspaceFolderPath: string,
  fsPath: string,
  fileSystem: FileSystemLike,
): Promise<WorkspaceSubFolderActionTarget["validationState"]> {
  if (
    !isPathInsideFolder(workspaceFolderPath, fsPath) ||
    fsPath === workspaceFolderPath
  ) {
    return "invalid";
  }

  try {
    const [workspaceRealPath, subFolderRealPath, stats] = await Promise.all([
      fileSystem.realpath(workspaceFolderPath),
      fileSystem.realpath(fsPath),
      fileSystem.stat(fsPath),
    ]);

    if (!stats.isDirectory()) {
      return "invalid";
    }

    return isPathInsideFolder(workspaceRealPath, subFolderRealPath)
      ? "valid"
      : "invalid";
  } catch {
    return "missing";
  }
}

async function hasGitMetadata(
  folderPath: string,
  fileSystem: FileSystemLike,
): Promise<boolean> {
  try {
    const stats = await fileSystem.lstat(path.join(folderPath, ".git"));
    return stats.isDirectory() || stats.isFile();
  } catch {
    return false;
  }
}

function normalizeRelativePath(relativePath: string): string | undefined {
  const normalized = path.normalize(relativePath);
  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`) ||
    path.isAbsolute(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function isPathInsideFolder(folderPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(folderPath, candidatePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function toCandidateKey(fsPath: string): string {
  return path.resolve(fsPath).toLocaleLowerCase();
}
