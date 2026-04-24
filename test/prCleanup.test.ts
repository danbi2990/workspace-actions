import test from "node:test";
import assert from "node:assert/strict";
import {
  isClosedIssue,
  parseGitHubIssueOrPullRequestUrl,
} from "../src/prCleanup";

test("parseGitHubIssueOrPullRequestUrl parses pull request URLs", () => {
  assert.deepEqual(
    parseGitHubIssueOrPullRequestUrl(
      "https://github.com/aicers/hog/pull/1392",
    ),
    {
      kind: "pr",
      owner: "aicers",
      repo: "hog",
      number: 1392,
      url: "https://github.com/aicers/hog/pull/1392",
    },
  );
});

test("parseGitHubIssueOrPullRequestUrl parses issue URLs", () => {
  assert.deepEqual(
    parseGitHubIssueOrPullRequestUrl(
      "https://github.com/aicers/piglet/issues/1735",
    ),
    {
      kind: "issue",
      owner: "aicers",
      repo: "piglet",
      number: 1735,
      url: "https://github.com/aicers/piglet/issues/1735",
    },
  );
});

test("parseGitHubIssueOrPullRequestUrl rejects unsupported URLs", () => {
  assert.equal(
    parseGitHubIssueOrPullRequestUrl(
      "https://github.com/aicers/piglet/discussions/1735",
    ),
    undefined,
  );
  assert.equal(
    parseGitHubIssueOrPullRequestUrl("not-a-url"),
    undefined,
  );
});

test("isClosedIssue accepts only closed issues", () => {
  assert.equal(
    isClosedIssue({
      number: 1687,
      title: "Closed issue",
      state: "CLOSED",
      url: "https://example.com/issues/1687",
      closedAt: "2026-04-02T00:00:00Z",
    }),
    true,
  );
  assert.equal(
    isClosedIssue({
      number: 1688,
      title: "Open issue",
      state: "OPEN",
      url: "https://example.com/issues/1688",
      closedAt: null,
    }),
    false,
  );
});
