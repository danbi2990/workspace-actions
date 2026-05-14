import test from "node:test";
import assert from "node:assert/strict";
import {
  addAbsoluteFolderToWorkspaceFileContent,
  getWorkspaceFolderLinkMetadataByPath,
  getWorkspaceSubFolderMetadataByPath,
  removeFolderFromWorkspaceFileContent,
  upsertWorkspaceSubFolderRemoteMetadataContent,
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

test("addAbsoluteFolderToWorkspaceFileContent preserves subfolders when updating top-level metadata", () => {
  const original = `{
  "folders": [
    {
      "path": "/workspace/home",
      "workspaceActions": {
        "subFolders": [
          {
            "path": "workspace-actions",
            "remote": {
              "url": "https://github.com/danbi2990/workspace-actions/issues/1",
              "kind": "issue",
              "owner": "danbi2990",
              "repo": "workspace-actions",
              "number": 1
            }
          }
        ]
      }
    }
  ]
}
`;

  const result = addAbsoluteFolderToWorkspaceFileContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/home",
    issueMetadata,
  );

  assert.equal(result.result, "updated");
  assert.match(result.content, /"link": "https:\/\/github.com\/aicers\/piglet\/issues\/1735"/);
  assert.match(result.content, /"subFolders": \[/);
  assert.match(result.content, /"path": "workspace-actions"/);
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

test("getWorkspaceSubFolderMetadataByPath reads subfolder remote metadata", () => {
  const content = `{
  "folders": [
    {
      "path": "/workspace/home",
      "workspaceActions": {
        "subFolders": [
          {
            "path": "workspace-actions",
            "remote": {
              "url": "https://github.com/danbi2990/workspace-actions/pull/123",
              "link": "https://github.com/danbi2990/workspace-actions/issues/999",
              "kind": "pr",
              "owner": "danbi2990",
              "repo": "workspace-actions",
              "number": 123,
              "title": "Add nested repo support",
              "status": "open"
            }
          }
        ]
      }
    }
  ]
}
`;

  const metadataMap = getWorkspaceSubFolderMetadataByPath(
    content,
    "/workspace/home/home.code-workspace",
  );

  assert.deepEqual(metadataMap.get("/workspace/home/workspace-actions"), {
    workspaceFolderPath: "/workspace/home",
    relativePath: "workspace-actions",
    fsPath: "/workspace/home/workspace-actions",
    remote: {
      kind: "pr",
      owner: "danbi2990",
      repo: "workspace-actions",
      number: 123,
      url: "https://github.com/danbi2990/workspace-actions/pull/123",
      title: "Add nested repo support",
      status: "open",
      fetchedAt: undefined,
    },
  });
});

test("getWorkspaceSubFolderMetadataByPath accepts legacy remote link", () => {
  const content = `{
  "folders": [
    {
      "path": "/workspace/home",
      "workspaceActions": {
        "subFolders": [
          {
            "path": "workspace-actions",
            "remote": {
              "link": "https://github.com/danbi2990/workspace-actions/issues/123",
              "kind": "issue",
              "owner": "danbi2990",
              "repo": "workspace-actions",
              "number": 123
            }
          }
        ]
      }
    }
  ]
}
`;

  const metadataMap = getWorkspaceSubFolderMetadataByPath(
    content,
    "/workspace/home/home.code-workspace",
  );

  assert.equal(
    metadataMap.get("/workspace/home/workspace-actions")?.remote?.url,
    "https://github.com/danbi2990/workspace-actions/issues/123",
  );
});

test("getWorkspaceSubFolderMetadataByPath ignores unsafe paths", () => {
  const content = `{
  "folders": [
    {
      "path": "/workspace/home",
      "workspaceActions": {
        "subFolders": [
          { "path": "../escape" },
          { "path": "/absolute" },
          { "path": "." },
          { "path": "" },
          { "path": "valid" }
        ]
      }
    }
  ]
}
`;

  const metadataMap = getWorkspaceSubFolderMetadataByPath(
    content,
    "/workspace/home/home.code-workspace",
  );

  assert.deepEqual([...metadataMap.keys()], ["/workspace/home/valid"]);
});

test("upsertWorkspaceSubFolderRemoteMetadataContent writes url metadata and preserves top-level metadata", () => {
  const original = `{
  "folders": [
    {
      "path": "/workspace/home",
      "workspaceActions": {
        "link": "https://github.com/aicers/piglet/issues/1735",
        "kind": "issue",
        "owner": "aicers",
        "repo": "piglet",
        "number": 1735,
        "subFolders": [
          {
            "path": "existing"
          }
        ]
      }
    }
  ]
}
`;

  const result = upsertWorkspaceSubFolderRemoteMetadataContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/home",
    "/workspace/home/workspace-actions",
    {
      kind: "pr",
      owner: "danbi2990",
      repo: "workspace-actions",
      number: 123,
      url: "https://github.com/danbi2990/workspace-actions/pull/123",
      title: "Add nested repo support",
      status: "open",
      fetchedAt: "2026-05-14T00:00:00.000Z",
    },
  );

  assert.equal(result.result, "added");
  assert.match(result.content, /"link": "https:\/\/github.com\/aicers\/piglet\/issues\/1735"/);
  assert.match(result.content, /"path": "existing"/);
  assert.match(result.content, /"path": "workspace-actions"/);
  assert.match(result.content, /"url": "https:\/\/github.com\/danbi2990\/workspace-actions\/pull\/123"/);
});

test("upsertWorkspaceSubFolderRemoteMetadataContent updates existing subfolder metadata", () => {
  const original = `{
  "folders": [
    {
      "path": "/workspace/home",
      "workspaceActions": {
        "subFolders": [
          {
            "path": "./workspace-actions",
            "remote": {
              "url": "https://github.com/danbi2990/workspace-actions/issues/1",
              "kind": "issue",
              "owner": "danbi2990",
              "repo": "workspace-actions",
              "number": 1
            }
          }
        ]
      }
    }
  ]
}
`;

  const result = upsertWorkspaceSubFolderRemoteMetadataContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/home",
    "/workspace/home/workspace-actions",
    issueMetadata,
  );

  assert.equal(result.result, "updated");
  assert.match(result.content, /"path": "workspace-actions"/);
  assert.match(result.content, /"url": "https:\/\/github.com\/aicers\/piglet\/issues\/1735"/);
  assert.doesNotMatch(result.content, /issues\/1"/);
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
