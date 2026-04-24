import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRebaseFailure,
  toRebaseFailureReason,
  toRebaseSuccessMessage,
} from "../src/rebaseBase";

test("toRebaseSuccessMessage distinguishes updated and unchanged results", () => {
  assert.equal(
    toRebaseSuccessMessage("origin/main", true),
    "Rebased onto origin/main.",
  );
  assert.equal(
    toRebaseSuccessMessage("origin/main", false),
    "Already up to date with origin/main.",
  );
});

test("toRebaseFailureReason parses common rebase failures", () => {
  assert.equal(
    toRebaseFailureReason({ stderr: "You have unstaged changes." }),
    "local changes must be committed or stashed first",
  );
  assert.equal(
    toRebaseFailureReason({ stderr: "CONFLICT (content): Merge conflict in src/app.ts" }),
    "rebase conflict detected; resolve it or run git rebase --abort",
  );
  assert.equal(
    toRebaseFailureReason({ message: "Could not fetch base branch main." }),
    "base branch could not be refreshed",
  );
});

test("formatRebaseFailure includes the folder name and parsed reason", () => {
  assert.equal(
    formatRebaseFailure(
      "/worktrees/piglet-pr-1724",
      { stderr: "The following untracked working tree files would be overwritten" },
    ),
    "piglet-pr-1724 (untracked files would be overwritten)",
  );
});
