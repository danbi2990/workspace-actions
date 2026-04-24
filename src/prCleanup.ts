export type WorkspaceFolderRemoteStatus = "open" | "closed" | "merged";

export interface WorkspaceFolderRemoteLinkMetadata {
  kind: "pr" | "issue";
  owner: string;
  repo: string;
  number: number;
  url: string;
  title?: string;
  status?: WorkspaceFolderRemoteStatus;
  fetchedAt?: string;
}

export interface PullRequestSummary {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  mergedAt: string | null;
  url: string;
  updatedAt: string;
  headRefName?: string;
  headRepositoryOwner?: {
    login?: string;
  } | null;
  headRepository?: {
    name?: string;
  } | null;
}

export interface IssueSummary {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  url: string;
  closedAt: string | null;
}

const GITHUB_ISSUE_OR_PULL_REQUEST_URL_PATTERN =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)\/?$/i;

export function parseGitHubIssueOrPullRequestUrl(
  url: string,
): WorkspaceFolderRemoteLinkMetadata | undefined {
  const trimmedUrl = url.trim();
  const match = trimmedUrl.match(GITHUB_ISSUE_OR_PULL_REQUEST_URL_PATTERN);
  if (!match) {
    return undefined;
  }

  const [, owner, repo, resourceKind, numberText] = match;
  const number = Number.parseInt(numberText!, 10);
  if (Number.isNaN(number)) {
    return undefined;
  }

  const kind = resourceKind?.toLowerCase() === "pull" ? "pr" : "issue";

  return {
    kind,
    owner: owner!,
    repo: repo!,
    number,
    url: `https://github.com/${owner}/${repo}/${resourceKind?.toLowerCase()}/${number}`,
  };
}

export function isClosedIssue(
  issue: IssueSummary | undefined,
): issue is IssueSummary {
  return issue !== undefined && issue.state === "CLOSED";
}

export function toWorkspaceFolderRemoteLinkMetadataFromPullRequest(
  metadata: WorkspaceFolderRemoteLinkMetadata,
  pullRequest: PullRequestSummary,
): WorkspaceFolderRemoteLinkMetadata {
  return {
    ...metadata,
    kind: "pr",
    title: pullRequest.title,
    status: pullRequest.mergedAt ? "merged" : pullRequest.state === "CLOSED" ? "closed" : "open",
    fetchedAt: new Date().toISOString(),
  };
}

export function toWorkspaceFolderRemoteLinkMetadataFromIssue(
  metadata: WorkspaceFolderRemoteLinkMetadata,
  issue: IssueSummary,
): WorkspaceFolderRemoteLinkMetadata {
  return {
    ...metadata,
    kind: "issue",
    title: issue.title,
    status: issue.state === "CLOSED" ? "closed" : "open",
    fetchedAt: new Date().toISOString(),
  };
}
