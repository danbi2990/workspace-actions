import * as path from "node:path";
import {
  applyEdits,
  createScanner,
  findNodeAtLocation,
  modify,
  parse,
  parseTree,
  SyntaxKind,
  type Edit,
  type JSONPath,
  type Node,
  type ParseError,
} from "jsonc-parser";
import type { WorkspaceFolderRemoteLinkMetadata } from "./prCleanup";

export type UpdateWorkspaceFileResult = "added" | "updated" | "alreadyExists";

interface WorkspaceActionsEntryLike {
  link?: unknown;
  url?: unknown;
  kind?: unknown;
  owner?: unknown;
  repo?: unknown;
  number?: unknown;
  title?: unknown;
  status?: unknown;
  fetchedAt?: unknown;
  subFolders?: unknown;
}

interface WorkspaceFolderEntryLike {
  path?: unknown;
  workspaceActions?: unknown;
}

interface WorkspaceSubFolderEntryLike {
  path?: unknown;
  remote?: unknown;
}

export type UpdateWorkspaceSubFolderResult =
  | "added"
  | "updated"
  | "alreadyExists";

export interface WorkspaceSubFolderMetadata {
  workspaceFolderPath: string;
  relativePath: string;
  fsPath: string;
  remote?: WorkspaceFolderRemoteLinkMetadata;
}

const WORKSPACE_FILE_FORMATTING_OPTIONS = {
  insertSpaces: true,
  tabSize: 2,
  eol: "\n",
};

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

  return {
    content: updateJsonValueAtPath(
      content,
      ["folders"],
      parsed.folders,
      nextFolders,
    ),
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

  const removalIndexes: number[] = [];
  currentFolders.forEach((entry, index) => {
    const resolvedEntry = resolveWorkspaceFolderEntry(
      entry,
      workspaceFileDir,
    );

    if (!resolvedEntry) {
      return;
    }

    if (resolvedEntry.normalizedPath !== normalizedFolderPath) {
      return;
    }

    removalIndexes.push(index);
  });

  if (removalIndexes.length === 0) {
    return {
      content,
      removed: false,
    };
  }

  let nextContent = content;
  for (const index of removalIndexes.reverse()) {
    nextContent = removeJsonValuePreservingComments(
      nextContent,
      ["folders", index],
    );
  }

  return {
    content: nextContent,
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

export function getWorkspaceSubFolderMetadataByPath(
  content: string,
  workspaceFilePath: string,
): Map<string, WorkspaceSubFolderMetadata> {
  const parsed = parseWorkspaceFileContent(content);
  const workspaceFileDir = path.dirname(workspaceFilePath);
  const currentFolders = getWorkspaceFolderEntries(parsed);
  const entries = currentFolders.flatMap((entry) => {
    const resolvedEntry = resolveWorkspaceFolderEntry(entry, workspaceFileDir);
    if (!resolvedEntry) {
      return [];
    }

    return parseWorkspaceSubFolderMetadataEntries(
      resolvedEntry.normalizedPath,
      resolvedEntry.entry.workspaceActions,
    ).map((subFolder) => [subFolder.fsPath, subFolder] as const);
  });

  return new Map(entries);
}

export function upsertWorkspaceSubFolderRemoteMetadataContent(
  content: string,
  workspaceFilePath: string,
  workspaceFolderPath: string,
  subFolderPath: string,
  metadata: WorkspaceFolderRemoteLinkMetadata,
): { content: string; result: UpdateWorkspaceSubFolderResult } {
  const parsed = parseWorkspaceFileContent(content);
  const workspaceFileDir = path.dirname(workspaceFilePath);
  const normalizedWorkspaceFolderPath = path.resolve(workspaceFolderPath);
  const normalizedSubFolderPath = path.resolve(subFolderPath);
  const currentFolders = getWorkspaceFolderEntries(parsed);
  const normalizedMetadata = normalizeWorkspaceFolderMetadata(metadata)!;
  let matchedWorkspaceFolder = false;
  let matchedSubFolder = false;
  let changedEntry = false;

  const nextFolders = currentFolders.map((entry) => {
    const resolvedEntry = resolveWorkspaceFolderEntry(entry, workspaceFileDir);
    if (!resolvedEntry) {
      return entry;
    }

    if (resolvedEntry.normalizedPath !== normalizedWorkspaceFolderPath) {
      return entry;
    }

    matchedWorkspaceFolder = true;
    const relativePath = toSafeRelativeSubFolderPath(
      normalizedWorkspaceFolderPath,
      normalizedSubFolderPath,
    );
    if (!relativePath) {
      throw new Error("Subfolder path must stay inside the workspace folder.");
    }

    const currentSubFolders = parseWorkspaceSubFolderEntryLikes(
      resolvedEntry.entry.workspaceActions,
    );
    const nextSubFolders = currentSubFolders.map((subFolderEntry) => {
      const normalizedEntryPath = normalizeRelativeSubFolderPath(
        subFolderEntry.path,
      );
      if (normalizedEntryPath !== relativePath) {
        return subFolderEntry;
      }

      matchedSubFolder = true;
      return {
        ...subFolderEntry,
        path: relativePath,
        remote: toWorkspaceSubFolderRemoteEntry(normalizedMetadata),
      } satisfies WorkspaceSubFolderEntryLike;
    });

    if (!matchedSubFolder) {
      nextSubFolders.push({
        path: relativePath,
        remote: toWorkspaceSubFolderRemoteEntry(normalizedMetadata),
      });
    }

    const nextEntry = buildWorkspaceFolderEntryWithSubFolders(
      resolvedEntry.entry,
      nextSubFolders,
    );
    if (!areWorkspaceFolderEntriesDeepEqual(resolvedEntry.entry, nextEntry)) {
      changedEntry = true;
    }

    return nextEntry;
  });

  if (!matchedWorkspaceFolder) {
    throw new Error("Workspace folder entry was not found.");
  }

  if (!changedEntry) {
    return {
      content,
      result: "alreadyExists",
    };
  }

  return {
    content: updateJsonValueAtPath(
      content,
      ["folders"],
      parsed.folders,
      nextFolders,
    ),
    result: matchedSubFolder ? "updated" : "added",
  };
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

function updateJsonValueAtPath(
  content: string,
  jsonPath: JSONPath,
  currentValue: unknown,
  nextValue: unknown,
): string {
  if (currentValue === nextValue) {
    return content;
  }

  if (Array.isArray(currentValue) && Array.isArray(nextValue)) {
    let nextContent = content;
    const sharedLength = Math.min(currentValue.length, nextValue.length);

    for (let index = 0; index < sharedLength; index += 1) {
      nextContent = updateJsonValueAtPath(
        nextContent,
        [...jsonPath, index],
        currentValue[index],
        nextValue[index],
      );
    }

    for (let index = currentValue.length - 1; index >= nextValue.length; index -= 1) {
      nextContent = removeJsonValuePreservingComments(
        nextContent,
        [...jsonPath, index],
      );
    }

    for (let index = currentValue.length; index < nextValue.length; index += 1) {
      nextContent = applyJsonModification(
        nextContent,
        [...jsonPath, -1],
        nextValue[index],
      );
    }

    return nextContent;
  }

  if (isJsonObject(currentValue) && isJsonObject(nextValue)) {
    let nextContent = content;

    for (const key of Object.keys(currentValue)) {
      if (Object.hasOwn(nextValue, key)) {
        continue;
      }

      nextContent = removeJsonValuePreservingComments(
        nextContent,
        [...jsonPath, key],
      );
    }

    for (const key of Object.keys(nextValue)) {
      nextContent = updateJsonValueAtPath(
        nextContent,
        [...jsonPath, key],
        currentValue[key],
        nextValue[key],
      );
    }

    return nextContent;
  }

  if (nextValue === undefined) {
    return removeJsonValuePreservingComments(content, jsonPath);
  }

  return applyJsonModification(content, jsonPath, nextValue);
}

function applyJsonModification(
  content: string,
  jsonPath: JSONPath,
  value: unknown,
): string {
  return applyEdits(
    content,
    modify(content, jsonPath, value, {
      formattingOptions: WORKSPACE_FILE_FORMATTING_OPTIONS,
    }),
  );
}

function removeJsonValuePreservingComments(
  content: string,
  jsonPath: JSONPath,
): string {
  const root = parseWorkspaceFileTree(content);
  const valueNode = findNodeAtLocation(root, jsonPath);
  if (!valueNode) {
    return content;
  }

  const targetNode = valueNode.parent?.type === "property"
    ? valueNode.parent
    : valueNode;
  const containerNode = targetNode.parent;
  if (
    !containerNode ||
    (containerNode.type !== "array" && containerNode.type !== "object")
  ) {
    throw new Error("Workspace file value could not be removed.");
  }

  const siblings = containerNode.children ?? [];
  const targetIndex = siblings.indexOf(targetNode);
  if (targetIndex < 0) {
    throw new Error("Workspace file value could not be removed.");
  }

  const preservedTargetComments = targetNode.type === "property"
    ? getCommentsInRange(
        content,
        targetNode.offset,
        targetNode.offset + targetNode.length,
      )
    : [];
  if (
    siblings.length === 1 &&
    preservedTargetComments.length === 0 &&
    !hasCommentOutsideNode(content, containerNode, targetNode)
  ) {
    return applyEdits(content, [
      {
        offset: containerNode.offset + 1,
        length: containerNode.length - 2,
        content: "",
      },
    ]);
  }

  const edits: Edit[] = [
    {
      offset: targetNode.offset,
      length: targetNode.length,
      content: toPreservedCommentContent(
        content,
        targetNode.offset,
        preservedTargetComments,
      ),
    },
  ];
  const containerEndOffset = containerNode.offset + containerNode.length - 1;
  const commaAfter = findCommaOffset(
    content,
    targetNode.offset + targetNode.length,
    containerEndOffset,
  );

  if (commaAfter !== undefined) {
    edits.push({
      offset: commaAfter,
      length: 1,
      content: "",
    });
  } else if (targetIndex > 0) {
    const previousNode = siblings[targetIndex - 1];
    const commaBefore = findCommaOffset(
      content,
      previousNode.offset + previousNode.length,
      targetNode.offset,
    );
    if (commaBefore === undefined) {
      throw new Error("Workspace file separator could not be removed.");
    }

    edits.push({
      offset: commaBefore,
      length: 1,
      content: "",
    });
  }

  return applyEdits(content, edits);
}

function parseWorkspaceFileTree(content: string): Node {
  const errors: ParseError[] = [];
  const root = parseTree(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (errors.length > 0 || !root) {
    throw new Error("Workspace file could not be parsed.");
  }

  return root;
}

function hasCommentOutsideNode(
  content: string,
  containerNode: Node,
  targetNode: Node,
): boolean {
  const containerStartOffset = containerNode.offset + 1;
  const containerEndOffset = containerNode.offset + containerNode.length - 1;

  return (
    hasCommentInRange(content, containerStartOffset, targetNode.offset) ||
    hasCommentInRange(
      content,
      targetNode.offset + targetNode.length,
      containerEndOffset,
    )
  );
}

function hasCommentInRange(
  content: string,
  startOffset: number,
  endOffset: number,
): boolean {
  return getCommentsInRange(content, startOffset, endOffset).length > 0;
}

function getCommentsInRange(
  content: string,
  startOffset: number,
  endOffset: number,
): string[] {
  const scanner = createScanner(content, false);
  scanner.setPosition(startOffset);
  const comments: string[] = [];

  for (let token = scanner.scan(); token !== SyntaxKind.EOF; token = scanner.scan()) {
    const tokenOffset = scanner.getTokenOffset();
    if (tokenOffset >= endOffset) {
      break;
    }

    if (
      token === SyntaxKind.LineCommentTrivia ||
      token === SyntaxKind.BlockCommentTrivia
    ) {
      comments.push(
        content.slice(tokenOffset, tokenOffset + scanner.getTokenLength()),
      );
    }
  }

  return comments;
}

function toPreservedCommentContent(
  content: string,
  targetOffset: number,
  comments: readonly string[],
): string {
  if (comments.length === 0) {
    return "";
  }

  const lineStartOffset = content.lastIndexOf("\n", targetOffset - 1) + 1;
  const linePrefix = content.slice(lineStartOffset, targetOffset);
  const indentation = linePrefix.match(/[ \t]*$/)?.[0] ?? "";
  return `${comments.join(`\n${indentation}`)}\n${indentation}`;
}

function findCommaOffset(
  content: string,
  startOffset: number,
  endOffset: number,
): number | undefined {
  const scanner = createScanner(content, false);
  scanner.setPosition(startOffset);

  for (let token = scanner.scan(); token !== SyntaxKind.EOF; token = scanner.scan()) {
    const tokenOffset = scanner.getTokenOffset();
    if (tokenOffset >= endOffset) {
      return undefined;
    }

    if (token === SyntaxKind.CommaToken) {
      return tokenOffset;
    }
  }

  return undefined;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    nextEntry.workspaceActions = {
      ...toWorkspaceActionsObject(currentEntry.workspaceActions),
      ...toWorkspaceActionsEntry(metadata),
    };
  }

  return nextEntry;
}

function buildWorkspaceFolderEntryWithSubFolders(
  currentEntry: WorkspaceFolderEntryLike,
  subFolders: readonly WorkspaceSubFolderEntryLike[],
): WorkspaceFolderEntryLike {
  return {
    ...currentEntry,
    workspaceActions: {
      ...toWorkspaceActionsObject(currentEntry.workspaceActions),
      subFolders,
    },
  };
}

function parseWorkspaceFolderMetadata(
  value: unknown,
): WorkspaceFolderRemoteLinkMetadata | undefined {
  if (!isWorkspaceActionsEntry(value)) {
    return undefined;
  }

  return parseWorkspaceRemoteMetadata(value, "link");
}

function parseWorkspaceSubFolderRemoteMetadata(
  value: unknown,
): WorkspaceFolderRemoteLinkMetadata | undefined {
  if (!isWorkspaceActionsEntry(value)) {
    return undefined;
  }

  return parseWorkspaceRemoteMetadata(value, "url");
}

function parseWorkspaceRemoteMetadata(
  value: WorkspaceActionsEntryLike,
  preferredUrlField: "link" | "url",
): WorkspaceFolderRemoteLinkMetadata | undefined {
  const { kind, owner, repo, number } = value;
  const primaryUrl = preferredUrlField === "url" ? value.url : value.link;
  const fallbackUrl = preferredUrlField === "url" ? value.link : value.url;
  const remoteUrl = typeof primaryUrl === "string"
    ? primaryUrl
    : typeof fallbackUrl === "string"
      ? fallbackUrl
      : undefined;

  if (
    remoteUrl === undefined ||
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
    url: remoteUrl,
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

function parseWorkspaceSubFolderMetadataEntries(
  workspaceFolderPath: string,
  value: unknown,
): WorkspaceSubFolderMetadata[] {
  return parseWorkspaceSubFolderEntryLikes(value).flatMap((entry) => {
    const relativePath = normalizeRelativeSubFolderPath(entry.path);
    if (!relativePath) {
      return [];
    }

    return [
      {
        workspaceFolderPath,
        relativePath,
        fsPath: path.resolve(workspaceFolderPath, relativePath),
        remote: parseWorkspaceSubFolderRemoteMetadata(entry.remote),
      },
    ];
  });
}

function parseWorkspaceSubFolderEntryLikes(
  value: unknown,
): WorkspaceSubFolderEntryLike[] {
  if (!isWorkspaceActionsEntry(value) || !Array.isArray(value.subFolders)) {
    return [];
  }

  return value.subFolders.filter(isWorkspaceSubFolderEntry);
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

function toWorkspaceSubFolderRemoteEntry(
  metadata: WorkspaceFolderRemoteLinkMetadata,
): WorkspaceActionsEntryLike {
  return {
    url: metadata.url,
    kind: metadata.kind,
    owner: metadata.owner,
    repo: metadata.repo,
    number: metadata.number,
    title: metadata.title,
    status: metadata.status,
    fetchedAt: metadata.fetchedAt,
  };
}

function toWorkspaceActionsObject(value: unknown): Record<string, unknown> {
  return isWorkspaceActionsEntry(value)
    ? { ...value }
    : {};
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

function areWorkspaceFolderEntriesDeepEqual(
  left: WorkspaceFolderEntryLike,
  right: WorkspaceFolderEntryLike,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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

function isWorkspaceSubFolderEntry(
  value: unknown,
): value is WorkspaceSubFolderEntryLike {
  return typeof value === "object" && value !== null;
}

function normalizeRelativeSubFolderPath(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "." || trimmed === "..") {
    return undefined;
  }

  if (path.isAbsolute(trimmed)) {
    return undefined;
  }

  const normalized = path.normalize(trimmed);
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`)
  ) {
    return undefined;
  }

  return normalized;
}

function toSafeRelativeSubFolderPath(
  workspaceFolderPath: string,
  subFolderPath: string,
): string | undefined {
  return normalizeRelativeSubFolderPath(
    path.relative(workspaceFolderPath, subFolderPath),
  );
}
