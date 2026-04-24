import * as path from "node:path";
import {
  extractCommandErrorText,
  toWorkingTreeBlockingReason,
} from "./pullRemote";

export function toRebaseSuccessMessage(
  baseRef: string,
  changed: boolean,
): string {
  if (!changed) {
    return `Already up to date with ${baseRef}.`;
  }

  return `Rebased onto ${baseRef}.`;
}

export function formatRebaseFailure(
  folderPath: string,
  error: unknown,
): string {
  return `${path.basename(folderPath) || folderPath} (${toRebaseFailureReason(error)})`;
}

export function toRebaseFailureReason(error: unknown): string {
  const errorText = extractCommandErrorText(error);
  const workingTreeBlockingReason = toWorkingTreeBlockingReason(errorText);

  if (workingTreeBlockingReason) {
    return workingTreeBlockingReason;
  }

  if (
    errorText.includes("CONFLICT") ||
    errorText.includes("Resolve all conflicts manually") ||
    errorText.includes("could not apply")
  ) {
    return "rebase conflict detected; resolve it or run git rebase --abort";
  }

  if (
    errorText.includes("Could not fetch base branch") ||
    errorText.includes("invalid upstream") ||
    errorText.includes("Needed a single revision")
  ) {
    return "base branch could not be refreshed";
  }

  return "rebase failed";
}
