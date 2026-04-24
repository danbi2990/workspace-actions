import test from "node:test";
import assert from "node:assert/strict";
import { toRefreshStatusMessage } from "../src/refreshStatus";

test("toRefreshStatusMessage returns undefined when nothing was refreshed", () => {
  assert.equal(
    toRefreshStatusMessage("main", {
      attemptedGitRepositories: 0,
      refreshedGitRepositories: 0,
    }),
    undefined,
  );
});

test("toRefreshStatusMessage formats git refresh results", () => {
  assert.equal(
    toRefreshStatusMessage("main", {
      attemptedGitRepositories: 3,
      refreshedGitRepositories: 2,
    }),
    "Refreshed main for 2/3 repositories.",
  );
});

test("toRefreshStatusMessage formats remote refresh results", () => {
  assert.equal(
    toRefreshStatusMessage("main", {
      attemptedGitRepositories: 0,
      refreshedGitRepositories: 0,
      refreshedRemoteStatuses: 2,
    }),
    "Refreshed remote status for 2 linked workspace folders.",
  );
});

test("toRefreshStatusMessage combines git and remote refresh results", () => {
  assert.equal(
    toRefreshStatusMessage("main", {
      attemptedGitRepositories: 3,
      refreshedGitRepositories: 2,
      refreshedRemoteStatuses: 1,
    }),
    "Refreshed main for 2/3 repositories. Refreshed remote status for 1 linked workspace folder.",
  );
});
