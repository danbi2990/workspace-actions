import * as path from "node:path";

export function toPullSuccessSummary(
  targetNoun: string,
  changedCount: number,
  unchangedCount: number,
): string {
  if (changedCount > 0 && unchangedCount === 0) {
    return `Updated ${changedCount} ${pluralize(targetNoun, changedCount)}.`;
  }

  if (changedCount === 0 && unchangedCount > 0) {
    return `${capitalize(pluralize(targetNoun, unchangedCount))} already up to date.`;
  }

  return `Updated ${changedCount} ${pluralize(targetNoun, changedCount)}; ${unchangedCount} already up to date.`;
}

export function formatPullRemoteBranchFailure(
  folderPath: string,
  error: unknown,
): string {
  return `${path.basename(folderPath) || folderPath} (${toPullRemoteBranchFailureReason(error)})`;
}

export function toPullRemoteBranchFailureReason(error: unknown): string {
  const errorText = extractCommandErrorText(error);
  const workingTreeBlockingReason = toWorkingTreeBlockingReason(errorText);

  if (workingTreeBlockingReason) {
    return workingTreeBlockingReason;
  }

  if (
    errorText.includes("There is no tracking information for the current branch")
  ) {
    return "no upstream configured";
  }

  return "pull failed";
}

export function extractCommandErrorText(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error ?? "");
  }

  const maybeError = error as {
    message?: unknown;
    stdout?: unknown;
    stderr?: unknown;
  };

  return [maybeError.message, maybeError.stdout, maybeError.stderr]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
}

function pluralize(noun: string, count: number): string {
  return `${noun}${count === 1 ? "" : "s"}`;
}

function capitalize(value: string): string {
  return value.length === 0
    ? value
    : value[0]!.toUpperCase() + value.slice(1);
}

export function toWorkingTreeBlockingReason(
  errorText: string,
): string | undefined {
  if (
    errorText.includes("You have unstaged changes") ||
    errorText.includes("Your local changes to the following files would be overwritten")
  ) {
    return "local changes must be committed or stashed first";
  }

  if (
    errorText.includes("The following untracked working tree files would be overwritten")
  ) {
    return "untracked files would be overwritten";
  }

  return undefined;
}
