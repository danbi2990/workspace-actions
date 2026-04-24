import test from "node:test";
import assert from "node:assert/strict";
import {
  extractCommandErrorText,
  formatPullRemoteBranchFailure,
  toPullSuccessSummary,
  toPullRemoteBranchFailureReason,
} from "../src/pullRemote";

test("toPullRemoteBranchFailureReason detects missing upstream", () => {
  assert.equal(
    toPullRemoteBranchFailureReason({
      stderr: "There is no tracking information for the current branch.",
    }),
    "no upstream configured",
  );
});

test("toPullRemoteBranchFailureReason detects local changes", () => {
  assert.equal(
    toPullRemoteBranchFailureReason({
      stderr: "error: cannot pull with rebase: You have unstaged changes.",
    }),
    "local changes must be committed or stashed first",
  );
});

test("toPullRemoteBranchFailureReason detects untracked file conflicts", () => {
  assert.equal(
    toPullRemoteBranchFailureReason({
      stderr:
        "The following untracked working tree files would be overwritten by merge:",
    }),
    "untracked files would be overwritten",
  );
});

test("toPullRemoteBranchFailureReason falls back to a generic message", () => {
  assert.equal(
    toPullRemoteBranchFailureReason({
      stderr: "fatal: some other git error",
    }),
    "pull failed",
  );
});

test("extractCommandErrorText combines message stdout and stderr", () => {
  assert.equal(
    extractCommandErrorText({
      message: "oops",
      stdout: "std out",
      stderr: "std err",
    }),
    "oops\nstd out\nstd err",
  );
});

test("formatPullRemoteBranchFailure uses the folder basename", () => {
  assert.equal(
    formatPullRemoteBranchFailure("/repos/GPT-SoVITS", {
      stderr: "There is no tracking information for the current branch.",
    }),
    "GPT-SoVITS (no upstream configured)",
  );
});

test("toPullSuccessSummary distinguishes updated and unchanged results", () => {
  assert.equal(
    toPullSuccessSummary("workspace folder", 1, 0),
    "Updated 1 workspace folder.",
  );
  assert.equal(
    toPullSuccessSummary("workspace folder", 0, 2),
    "Workspace folders already up to date.",
  );
  assert.equal(
    toPullSuccessSummary("base repository", 1, 2),
    "Updated 1 base repository; 2 already up to date.",
  );
});
