export interface RefreshStatusSummary {
  attemptedGitRepositories: number;
  refreshedGitRepositories: number;
  refreshedRemoteStatuses?: number;
}

export function toRefreshStatusMessage(
  baseBranch: string,
  summary: RefreshStatusSummary,
): string | undefined {
  const messageParts: string[] = [];

  if (summary.attemptedGitRepositories > 0) {
    messageParts.push(
      `Refreshed ${baseBranch} for ${summary.refreshedGitRepositories}/${summary.attemptedGitRepositories} repositories.`,
    );
  }

  if (summary.refreshedRemoteStatuses !== undefined) {
    messageParts.push(
      `Refreshed remote status for ${summary.refreshedRemoteStatuses} linked workspace folder${summary.refreshedRemoteStatuses === 1 ? "" : "s"}.`,
    );
  }

  if (messageParts.length === 0) {
    return undefined;
  }

  return messageParts.join(" ");
}
