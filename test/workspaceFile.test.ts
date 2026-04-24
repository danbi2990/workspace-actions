import test from "node:test";
import assert from "node:assert/strict";
import {
  addAbsoluteFolderToWorkspaceFileContent,
  getWorkspaceFolderLinkMetadataByPath,
  removeFolderFromWorkspaceFileContent,
} from "../src/workspaceFile";
import type { WorkspaceFolderRemoteLinkMetadata } from "../src/prCleanup";

const issueMetadata: WorkspaceFolderRemoteLinkMetadata = {
  kind: "issue",
  owner: "aicers",
  repo: "piglet",
  number: 1735,
  url: "https://github.com/aicers/piglet/issues/1735",
  title: undefined,
  status: undefined,
  fetchedAt: undefined,
};

test("addAbsoluteFolderToWorkspaceFileContent adds a folders array when missing", () => {
  const original = `{
  "settings": {
    "files.exclude": {
      "**/.DS_Store": true
    }
  }
}
`;

  const result = addAbsoluteFolderToWorkspaceFileContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/blog",
  );

  assert.equal(result.result, "added");
  assert.match(result.content, /"folders": \[/);
  assert.match(result.content, /"path": "\/workspace\/blog"/);
});

test("addAbsoluteFolderToWorkspaceFileContent rewrites a matching relative folder entry to an absolute path", () => {
  const original = `{
  "folders": [
    {
      "path": "../blog"
    }
  ]
}
`;

  const result = addAbsoluteFolderToWorkspaceFileContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/blog",
  );

  assert.equal(result.result, "updated");
  assert.match(result.content, /"path": "\/workspace\/blog"/);
  assert.doesNotMatch(result.content, /\.\.\/blog/);
});

test("addAbsoluteFolderToWorkspaceFileContent does not duplicate an existing absolute folder entry", () => {
  const original = `{
  "folders": [
    {
      "path": "/workspace/blog"
    }
  ]
}
`;

  const result = addAbsoluteFolderToWorkspaceFileContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/blog",
  );

  assert.equal(result.result, "alreadyExists");
  assert.equal(result.content, original);
});

test("addAbsoluteFolderToWorkspaceFileContent appends a new absolute folder entry", () => {
  const original = `{
  "folders": [
    {
      "path": "/workspace/home"
    }
  ]
}
`;

  const result = addAbsoluteFolderToWorkspaceFileContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/api",
  );

  assert.equal(result.result, "added");
  assert.match(result.content, /"path": "\/workspace\/home"/);
  assert.match(result.content, /"path": "\/workspace\/api"/);
});

test("addAbsoluteFolderToWorkspaceFileContent stores workspaceActions metadata when provided", () => {
  const original = `{
  "folders": []
}
`;

  const result = addAbsoluteFolderToWorkspaceFileContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/piglet-is-1735",
    issueMetadata,
  );

  assert.equal(result.result, "added");
  assert.match(result.content, /"workspaceActions": \{/);
  assert.match(result.content, /"link": "https:\/\/github.com\/aicers\/piglet\/issues\/1735"/);
  assert.match(result.content, /"kind": "issue"/);
});

test("addAbsoluteFolderToWorkspaceFileContent updates metadata for an existing folder entry", () => {
  const original = `{
  "folders": [
    {
      "path": "/workspace/piglet-is-1735"
    }
  ]
}
`;

  const result = addAbsoluteFolderToWorkspaceFileContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/piglet-is-1735",
    issueMetadata,
  );

  assert.equal(result.result, "updated");
  assert.match(result.content, /"workspaceActions": \{/);
});

test("getWorkspaceFolderLinkMetadataByPath returns metadata for linked folders", () => {
  const content = `{
  "folders": [
    {
      "path": "/workspace/piglet-is-1735",
      "workspaceActions": {
        "link": "https://github.com/aicers/piglet/issues/1735",
        "kind": "issue",
        "owner": "aicers",
        "repo": "piglet",
        "number": 1735
      }
    }
  ]
}
`;

  const metadataMap = getWorkspaceFolderLinkMetadataByPath(
    content,
    "/workspace/home/home.code-workspace",
  );

  assert.deepEqual(
    metadataMap.get("/workspace/piglet-is-1735"),
    issueMetadata,
  );
});

test("removeFolderFromWorkspaceFileContent removes matching absolute and relative entries", () => {
  const original = `{
  "folders": [
    {
      "path": "/workspace/home"
    },
    {
      "path": "../api"
    }
  ]
}
`;

  const result = removeFolderFromWorkspaceFileContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/api",
  );

  assert.equal(result.removed, true);
  assert.match(result.content, /"path": "\/workspace\/home"/);
  assert.doesNotMatch(result.content, /\.\.\/api/);
});

test("removeFolderFromWorkspaceFileContent leaves the file unchanged when no folder matches", () => {
  const original = `{
  "folders": [
    {
      "path": "/workspace/home"
    }
  ]
}
`;

  const result = removeFolderFromWorkspaceFileContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/api",
  );

  assert.equal(result.removed, false);
  assert.equal(result.content, original);
});

test("removeFolderFromWorkspaceFileContent removes the last remaining folder entry", () => {
  const original = `{
  "folders": [
    {
      "path": "/workspace/api"
    }
  ]
}
`;

  const result = removeFolderFromWorkspaceFileContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/api",
  );

  assert.equal(result.removed, true);
  assert.match(result.content, /"folders": \[\]/);
});
