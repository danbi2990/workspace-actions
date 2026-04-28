import * as path from "node:path";
import { type FolderUiState, type WorkspaceFolderLike } from "./commands";
import {
  isSuccessfulConcurrencyResult,
  runSettledWithConcurrency,
} from "./concurrency";

export interface UriLike {
  fsPath: string;
}

export interface GitRepositoryLike {
  rootUri: UriLike;
  getBranch?(name: string): Promise<
    | {
        name?: string;
        commit?: string;
      }
    | undefined
  >;
  getMergeBase?(ref1: string, ref2: string): Promise<string | undefined>;
  fetch?(options?: { remote?: string; ref?: string }): Promise<void>;
  state: {
    HEAD?: {
      name?: string;
      commit?: string;
      behind?: number;
      upstream?: {
        name: string;
        remote: string;
      };
    };
    remotes?: readonly {
      name: string;
      fetchUrl?: string;
    }[];
    mergeChanges: readonly unknown[];
    indexChanges: readonly unknown[];
    workingTreeChanges: readonly unknown[];
    untrackedChanges: readonly unknown[];
  };
}

export interface FolderStatusSummary {
  hasGitRepository: boolean;
  hasGitChanges: boolean;
  hasRemoteBranchTracking: boolean;
  remoteBranchMoved: boolean;
  baseBranchMoved: boolean;
  dirtyEditors: number;
}

export const REFRESH_STATUS_CONCURRENCY = 6;

export function createEmptyFolderStatusSummary(): FolderStatusSummary {
  return {
    hasGitRepository: false,
    hasGitChanges: false,
    hasRemoteBranchTracking: false,
    remoteBranchMoved: false,
    baseBranchMoved: false,
    dirtyEditors: 0,
  };
}

export function isPathInsideFolder(
  folderPath: string,
  candidatePath: string,
): boolean {
  const relativePath = path.relative(folderPath, candidatePath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

export function collectFolderStatusCounts(
  folderPath: string,
  repositories: readonly GitRepositoryLike[],
  dirtyDocumentFolderPaths: readonly string[],
): FolderStatusSummary {
  const repositoriesInFolder = getRepositoriesInFolder(folderPath, repositories);

  return {
    hasGitRepository: repositoriesInFolder.length > 0,
    hasGitChanges: repositoriesInFolder.some(hasRepositoryChanges),
    hasRemoteBranchTracking: repositoriesInFolder.some(hasRepositoryUpstream),
    remoteBranchMoved: repositoriesInFolder.some(repositoryNeedsRemoteBranchUpdate),
    baseBranchMoved: false,
    dirtyEditors: countDirtyEditorsForFolder(folderPath, dirtyDocumentFolderPaths),
  };
}

export function formatFolderStatusSummary(
  counts: FolderStatusSummary,
  baseBranch: string,
): string {
  const parts: string[] = [];

  if (counts.hasGitChanges) {
    parts.push("Git changes");
  }

  if (counts.dirtyEditors > 0) {
    parts.push(
      counts.dirtyEditors === 1
        ? "1 unsaved editor"
        : `${counts.dirtyEditors} unsaved editors`,
    );
  }

  if (counts.baseBranchMoved) {
    parts.push(`Behind ${baseBranch}`);
  }

  if (counts.remoteBranchMoved) {
    parts.push("Behind upstream");
  }

  if (parts.length === 0) {
    return "";
  }

  return parts.join(" · ");
}

export function toFolderUiState(summary: FolderStatusSummary): FolderUiState {
  return {
    isGitWorktree: false,
    hasGitChanges: summary.hasGitChanges,
    hasRemoteBranchTracking: summary.hasRemoteBranchTracking,
    remoteBranchMoved: summary.remoteBranchMoved,
    baseBranchMoved: summary.baseBranchMoved,
    dirtyEditors: summary.dirtyEditors,
  };
}

export function hasRepositoryUpstream(repository: GitRepositoryLike): boolean {
  return repository.state.HEAD?.upstream !== undefined;
}

export function repositoryNeedsRemoteBranchUpdate(
  repository: GitRepositoryLike,
): boolean {
  return (repository.state.HEAD?.behind ?? 0) > 0;
}

export function getBaseBranchRefCandidates(
  repository: GitRepositoryLike,
  baseBranch: string,
): string[] {
  const candidates: string[] = [];
  const upstreamRemote = repository.state.HEAD?.upstream?.remote;

  if (upstreamRemote) {
    candidates.push(`${upstreamRemote}/${baseBranch}`);
  }

  if (repository.state.remotes?.some((remote) => remote.name === "origin")) {
    candidates.push(`origin/${baseBranch}`);
  }

  candidates.push(baseBranch);

  return [...new Set(candidates)];
}

export async function repositoryNeedsBaseBranchUpdate(
  repository: GitRepositoryLike,
  baseBranch: string,
): Promise<boolean> {
  if (!repository.getBranch || !repository.getMergeBase) {
    return false;
  }

  const headRef = repository.state.HEAD?.name ?? repository.state.HEAD?.commit;
  if (!headRef) {
    return false;
  }

  if (repository.state.HEAD?.name === baseBranch) {
    return false;
  }

  for (const candidateRef of getBaseBranchRefCandidates(repository, baseBranch)) {
    if (repository.state.HEAD?.name === candidateRef) {
      return false;
    }

    try {
      const branch = await repository.getBranch(candidateRef);
      if (!branch?.commit) {
        continue;
      }

      const mergeBase = await repository.getMergeBase(headRef, candidateRef);
      if (!mergeBase) {
        continue;
      }

      return mergeBase !== branch.commit;
    } catch {
      continue;
    }
  }

  return false;
}

export function getFetchRemoteCandidates(
  repository: GitRepositoryLike,
): string[] {
  const candidates: string[] = [];
  const upstreamRemote = repository.state.HEAD?.upstream?.remote;

  if (upstreamRemote) {
    candidates.push(upstreamRemote);
  }

  if (repository.state.remotes?.some((remote) => remote.name === "origin")) {
    candidates.push("origin");
  }

  for (const remote of repository.state.remotes ?? []) {
    candidates.push(remote.name);
  }

  return [...new Set(candidates)];
}

export async function refreshBaseBranchForRepositories(
  repositories: readonly GitRepositoryLike[],
  baseBranch: string,
): Promise<{ attempted: number; refreshed: number }> {
  const fetchableRepositories = repositories
    .map((repository) => ({
      repository,
      remotes: getFetchRemoteCandidates(repository),
    }))
    .filter(
      (entry): entry is {
        repository: GitRepositoryLike & {
          fetch(options?: { remote?: string; ref?: string }): Promise<void>;
        };
        remotes: string[];
      } => entry.repository.fetch !== undefined && entry.remotes.length > 0,
    );

  const results = await runSettledWithConcurrency(
    fetchableRepositories,
    REFRESH_STATUS_CONCURRENCY,
    async ({ repository, remotes }) => {
      for (const remote of remotes) {
        try {
          await repository.fetch({ remote, ref: baseBranch });
          return true;
        } catch {
          continue;
        }
      }

      return false;
    },
  );

  return {
    attempted: fetchableRepositories.length,
    refreshed: results.filter(
      (result) => isSuccessfulConcurrencyResult(result) && result.value,
    ).length,
  };
}

export async function buildFolderStatusSummaries(
  folders: readonly WorkspaceFolderLike[],
  repositories: readonly GitRepositoryLike[],
  dirtyDocumentFolderPaths: readonly string[],
  baseBranch: string,
): Promise<Map<string, FolderStatusSummary>> {
  const summaries = new Map<string, FolderStatusSummary>();

  for (const folder of folders) {
    const counts = collectFolderStatusCounts(
      folder.uri.fsPath,
      repositories,
      dirtyDocumentFolderPaths,
    );

    const repositoriesInFolder = getRepositoriesInFolder(
      folder.uri.fsPath,
      repositories,
    );
    const movedFlags = await Promise.all(
      repositoriesInFolder.map((repository) =>
        repositoryNeedsBaseBranchUpdate(repository, baseBranch),
      ),
    );

    counts.baseBranchMoved = movedFlags.some(Boolean);

    summaries.set(folder.uri.fsPath, counts);
  }

  return summaries;
}

function getRepositoriesInFolder(
  folderPath: string,
  repositories: readonly GitRepositoryLike[],
): GitRepositoryLike[] {
  return repositories.filter((repository) =>
    isPathInsideFolder(folderPath, repository.rootUri.fsPath),
  );
}

function hasRepositoryChanges(repository: GitRepositoryLike): boolean {
  return (
    repository.state.mergeChanges.length > 0 ||
    repository.state.indexChanges.length > 0 ||
    repository.state.workingTreeChanges.length > 0 ||
    repository.state.untrackedChanges.length > 0
  );
}

function countDirtyEditorsForFolder(
  folderPath: string,
  dirtyDocumentFolderPaths: readonly string[],
): number {
  return dirtyDocumentFolderPaths.filter(
    (dirtyFolderPath) => dirtyFolderPath === folderPath,
  ).length;
}
