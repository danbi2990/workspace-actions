import * as path from "node:path";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import type { WorkspaceFolderRemoteLinkMetadata } from "./prCleanup";

export type UpdateWorkspaceFileResult = "added" | "updated" | "alreadyExists";

interface WorkspaceActionsEntryLike {
  link?: unknown;
  kind?: unknown;
  owner?: unknown;
  repo?: unknown;
  number?: unknown;
  title?: unknown;
  status?: unknown;
  fetchedAt?: unknown;
}

interface WorkspaceFolderEntryLike {
  path?: unknown;
  workspaceActions?: unknown;
}

export function addAbsoluteFolderToWorkspaceFileContent(
  content: string,
  workspaceFilePath: string,
  folderPath: string,
  metadata?: WorkspaceFolderRemoteLinkMetadata,
): { content: string; result: UpdateWorkspaceFileResult } {
  const parsed = parseWorkspaceFileContent(content);
  const workspaceFileDir = path.dirname(workspaceFilePath);
  const normalizedFolderPath = path.resolve(folderPath);
  const currentFolders = getWorkspaceFolderEntries(parsed);
  const normalizedMetadata = normalizeWorkspaceFolderMetadata(metadata);

  let matchedEntry = false;
  let changedEntry = false;

  const nextFolders = currentFolders.map((entry) => {
    const resolvedEntry = resolveWorkspaceFolderEntry(
      entry,
      workspaceFileDir,
    );

    if (!resolvedEntry) {
      return entry;
    }

    if (resolvedEntry.normalizedPath !== normalizedFolderPath) {
      return entry;
    }

    matchedEntry = true;
    const nextEntry = buildWorkspaceFolderEntry(
      normalizedFolderPath,
      normalizedMetadata,
      resolvedEntry.entry,
    );

    if (!areWorkspaceFolderEntriesEqual(resolvedEntry.entry, nextEntry)) {
      changedEntry = true;
    }

    return nextEntry;
  });

  if (!matchedEntry) {
    nextFolders.push(buildWorkspaceFolderEntry(normalizedFolderPath, normalizedMetadata));
    changedEntry = true;
  }

  if (!changedEntry) {
    return {
      content,
      result: "alreadyExists",
    };
  }

  const edits = modify(content, ["folders"], nextFolders, {
    formattingOptions: {
      insertSpaces: true,
      tabSize: 2,
      eol: "\n",
    },
  });

  return {
    content: applyEdits(content, edits),
    result: matchedEntry ? "updated" : "added",
  };
}

export function removeFolderFromWorkspaceFileContent(
  content: string,
  workspaceFilePath: string,
  folderPath: string,
): { content: string; removed: boolean } {
  const parsed = parseWorkspaceFileContent(content);
  const workspaceFileDir = path.dirname(workspaceFilePath);
  const normalizedFolderPath = path.resolve(folderPath);
  const currentFolders = getWorkspaceFolderEntries(parsed);

  let removed = false;
  const nextFolders = currentFolders.filter((entry) => {
    const resolvedEntry = resolveWorkspaceFolderEntry(
      entry,
      workspaceFileDir,
    );

    if (!resolvedEntry) {
      return true;
    }

    if (resolvedEntry.normalizedPath !== normalizedFolderPath) {
      return true;
    }

    removed = true;
    return false;
  });

  if (!removed) {
    return {
      content,
      removed: false,
    };
  }

  const edits = modify(content, ["folders"], nextFolders, {
    formattingOptions: {
      insertSpaces: true,
      tabSize: 2,
      eol: "\n",
    },
  });

  return {
    content: applyEdits(content, edits),
    removed: true,
  };
}

export function getWorkspaceFolderLinkMetadataByPath(
  content: string,
  workspaceFilePath: string,
): Map<string, WorkspaceFolderRemoteLinkMetadata> {
  const parsed = parseWorkspaceFileContent(content);
  const workspaceFileDir = path.dirname(workspaceFilePath);
  const currentFolders = getWorkspaceFolderEntries(parsed);

  const entries = currentFolders.flatMap((entry) => {
    const resolvedEntry = resolveWorkspaceFolderEntry(entry, workspaceFileDir);
    if (!resolvedEntry) {
      return [];
    }

    const metadata = parseWorkspaceFolderMetadata(
      resolvedEntry.entry.workspaceActions,
    );
    if (!metadata) {
      return [];
    }

    return [[resolvedEntry.normalizedPath, metadata] as const];
  });

  return new Map(entries);
}

function parseWorkspaceFileContent(content: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const parsed = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (errors.length > 0 || typeof parsed !== "object" || parsed === null) {
    throw new Error("Workspace file could not be parsed.");
  }

  return parsed as Record<string, unknown>;
}

function getWorkspaceFolderEntries(parsed: Record<string, unknown>): unknown[] {
  return Array.isArray(parsed.folders)
    ? [...parsed.folders]
    : [];
}

function resolveWorkspaceFolderEntry(
  entry: unknown,
  workspaceFileDir: string,
): { entry: WorkspaceFolderEntryLike; entryPath: string; normalizedPath: string } | undefined {
  if (!isWorkspaceFolderEntry(entry)) {
    return undefined;
  }

  const entryPath = entry.path;
  if (typeof entryPath !== "string") {
    return undefined;
  }

  return {
    entry,
    entryPath,
    normalizedPath: path.isAbsolute(entryPath)
      ? path.resolve(entryPath)
      : path.resolve(workspaceFileDir, entryPath),
  };
}

function buildWorkspaceFolderEntry(
  folderPath: string,
  metadata?: WorkspaceFolderRemoteLinkMetadata,
  currentEntry: WorkspaceFolderEntryLike = {},
): WorkspaceFolderEntryLike {
  const nextEntry: WorkspaceFolderEntryLike = {
    ...currentEntry,
    path: folderPath,
  };

  if (metadata) {
    nextEntry.workspaceActions = toWorkspaceActionsEntry(metadata);
  }

  return nextEntry;
}

function parseWorkspaceFolderMetadata(
  value: unknown,
): WorkspaceFolderRemoteLinkMetadata | undefined {
  if (!isWorkspaceActionsEntry(value)) {
    return undefined;
  }

  const { link, kind, owner, repo, number } = value;
  if (
    typeof link !== "string" ||
    (kind !== "pr" && kind !== "issue") ||
    typeof owner !== "string" ||
    typeof repo !== "string" ||
    typeof number !== "number"
  ) {
    return undefined;
  }

  return {
    kind,
    owner,
    repo,
    number,
    url: link,
    title: typeof value.title === "string" ? value.title : undefined,
    status:
      value.status === "open" ||
      value.status === "closed" ||
      value.status === "merged"
        ? value.status
        : undefined,
    fetchedAt: typeof value.fetchedAt === "string" ? value.fetchedAt : undefined,
  };
}

function normalizeWorkspaceFolderMetadata(
  metadata: WorkspaceFolderRemoteLinkMetadata | undefined,
): WorkspaceFolderRemoteLinkMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  return {
    kind: metadata.kind,
    owner: metadata.owner,
    repo: metadata.repo,
    number: metadata.number,
    url: metadata.url,
    title: metadata.title,
    status: metadata.status,
    fetchedAt: metadata.fetchedAt,
  };
}

function toWorkspaceActionsEntry(
  metadata: WorkspaceFolderRemoteLinkMetadata,
): WorkspaceActionsEntryLike {
  return {
    link: metadata.url,
    kind: metadata.kind,
    owner: metadata.owner,
    repo: metadata.repo,
    number: metadata.number,
    title: metadata.title,
    status: metadata.status,
    fetchedAt: metadata.fetchedAt,
  };
}

function areWorkspaceFolderEntriesEqual(
  left: WorkspaceFolderEntryLike,
  right: WorkspaceFolderEntryLike,
): boolean {
  return (
    left.path === right.path &&
    areWorkspaceFolderMetadataEqual(
      parseWorkspaceFolderMetadata(left.workspaceActions),
      parseWorkspaceFolderMetadata(right.workspaceActions),
    )
  );
}

function areWorkspaceFolderMetadataEqual(
  left: WorkspaceFolderRemoteLinkMetadata | undefined,
  right: WorkspaceFolderRemoteLinkMetadata | undefined,
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.kind === right.kind &&
    left.owner === right.owner &&
    left.repo === right.repo &&
    left.number === right.number &&
    left.url === right.url &&
    left.title === right.title &&
    left.status === right.status &&
    left.fetchedAt === right.fetchedAt
  );
}

function isWorkspaceFolderEntry(entry: unknown): entry is WorkspaceFolderEntryLike {
  return typeof entry === "object" && entry !== null;
}

function isWorkspaceActionsEntry(value: unknown): value is WorkspaceActionsEntryLike {
  return typeof value === "object" && value !== null;
}
