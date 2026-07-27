import test from "node:test";
import assert from "node:assert/strict";
import { parse, type ParseError } from "jsonc-parser";
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

function parseWorkspaceContent(content: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const parsed = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  assert.deepEqual(errors, []);
  assert.ok(typeof parsed === "object" && parsed !== null);
  return parsed as Record<string, unknown>;
}

function assertIncludesComments(
  content: string,
  comments: readonly string[],
): void {
  for (const comment of comments) {
    assert.ok(content.includes(comment), `Missing comment: ${comment}`);
  }
}

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

test("addAbsoluteFolderToWorkspaceFileContent preserves comments when appending", () => {
  const original = `{
  // folders property
  "folders": [
    // home folder
    {
      "path": "/workspace/home" // home path
    },
    // folders tail
  ],
  // settings property
  "settings": {}
}
`;

  const result = addAbsoluteFolderToWorkspaceFileContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/api",
  );

  assert.equal(result.result, "added");
  assertIncludesComments(result.content, [
    "// folders property",
    "// home folder",
    "// home path",
    "// folders tail",
    "// settings property",
  ]);
  assert.deepEqual(parseWorkspaceContent(result.content).folders, [
    {
      path: "/workspace/home",
    },
    {
      path: "/workspace/api",
    },
  ]);
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

test("addAbsoluteFolderToWorkspaceFileContent preserves comments when updating metadata", () => {
  const original = `{
  "folders": [
    // target folder
    {
      // path property
      "path": "../api", // path value
      // actions property
      "workspaceActions": {
        // stale title
        "title" // title key line
        /* title key */: /* title value */ "Stale title",
        // saved subfolders
        "subFolders": [
          {
            "path": "nested"
          }
        ],
        // stale fetched time
        "fetchedAt" /* fetched key */: /* fetched value */ "2026-01-01T00:00:00.000Z"
      }
    },
    // sibling folder
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
    issueMetadata,
  );

  assert.equal(result.result, "updated");
  assertIncludesComments(result.content, [
    "// target folder",
    "// path property",
    "// path value",
    "// actions property",
    "// stale title",
    "// title key line",
    "/* title key */",
    "/* title value */",
    "// saved subfolders",
    "// stale fetched time",
    "/* fetched key */",
    "/* fetched value */",
    "// sibling folder",
  ]);

  const folders = parseWorkspaceContent(result.content).folders as Array<{
    path: string;
    workspaceActions?: Record<string, unknown>;
  }>;
  assert.equal(folders[0]?.path, "/workspace/api");
  assert.equal(folders[0]?.workspaceActions?.title, undefined);
  assert.equal(folders[0]?.workspaceActions?.fetchedAt, undefined);
  assert.deepEqual(folders[0]?.workspaceActions?.subFolders, [
    {
      path: "nested",
    },
  ]);
  assert.equal(
    folders[0]?.workspaceActions?.link,
    "https://github.com/aicers/piglet/issues/1735",
  );
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

test("upsertWorkspaceSubFolderRemoteMetadataContent preserves comments when updating", () => {
  const original = `{
  "folders": [
    // workspace folder
    {
      "path": "/workspace/home",
      // actions property
      "workspaceActions": {
        // subfolders property
        "subFolders": [
          // target subfolder
          {
            // subfolder path
            "path": "./workspace-actions",
            // remote property
            "remote": {
              // legacy link
              "link" /* link key */: /* link value */ "https://github.com/danbi2990/workspace-actions/issues/1",
              // remote URL
              "url": "https://github.com/danbi2990/workspace-actions/issues/1",
              "kind": "issue",
              "owner": "danbi2990",
              "repo": "workspace-actions",
              "number": 1
            }
          },
          // sibling subfolder
          {
            "path": "other"
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
  assertIncludesComments(result.content, [
    "// workspace folder",
    "// actions property",
    "// subfolders property",
    "// target subfolder",
    "// subfolder path",
    "// remote property",
    "// legacy link",
    "/* link key */",
    "/* link value */",
    "// remote URL",
    "// sibling subfolder",
  ]);

  const folders = parseWorkspaceContent(result.content).folders as Array<{
    workspaceActions: {
      subFolders: Array<{
        path: string;
        remote?: Record<string, unknown>;
      }>;
    };
  }>;
  const target = folders[0]?.workspaceActions.subFolders[0];
  assert.equal(target?.path, "workspace-actions");
  assert.equal(target?.remote?.link, undefined);
  assert.equal(
    target?.remote?.url,
    "https://github.com/aicers/piglet/issues/1735",
  );
  assert.equal(
    folders[0]?.workspaceActions.subFolders[1]?.path,
    "other",
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

test("removeFolderFromWorkspaceFileContent preserves comments around removed folders", () => {
  const original = `{
  "folders": [
    // home folder
    {
      "path": "/workspace/home"
    },
    // api folder
    {
      // removed folder content
      "path": "/workspace/api"
    },
    // web folder
    {
      "path": "/workspace/web"
    },
    // folders tail
  ],
  // settings property
  "settings": {}
}
`;

  const result = removeFolderFromWorkspaceFileContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/api",
  );

  assert.equal(result.removed, true);
  assertIncludesComments(result.content, [
    "// home folder",
    "// api folder",
    "// web folder",
    "// folders tail",
    "// settings property",
  ]);
  assert.ok(!result.content.includes("// removed folder content"));
  assert.deepEqual(parseWorkspaceContent(result.content).folders, [
    {
      path: "/workspace/home",
    },
    {
      path: "/workspace/web",
    },
  ]);
});

test("removeFolderFromWorkspaceFileContent removes duplicate paths without losing comments", () => {
  const original = `{
  "folders": [
    // absolute API folder
    {
      "path": "/workspace/api"
    },
    // home folder
    {
      "path": "/workspace/home"
    },
    // relative API folder
    {
      "path": "../api"
    },
    // folders tail
  ]
}
`;

  const result = removeFolderFromWorkspaceFileContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/api",
  );

  assert.equal(result.removed, true);
  assertIncludesComments(result.content, [
    "// absolute API folder",
    "// home folder",
    "// relative API folder",
    "// folders tail",
  ]);
  assert.deepEqual(parseWorkspaceContent(result.content).folders, [
    {
      path: "/workspace/home",
    },
  ]);
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

test("removeFolderFromWorkspaceFileContent preserves comments after the last folder", () => {
  const original = `{
  "folders": [
    // home folder
    {
      "path": "/workspace/home"
    },
    // api folder
    {
      // removed folder content
      "path": "/workspace/api"
    }
    // folders tail
  ]
}
`;

  const result = removeFolderFromWorkspaceFileContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/api",
  );

  assert.equal(result.removed, true);
  assertIncludesComments(result.content, [
    "// home folder",
    "// api folder",
    "// folders tail",
  ]);
  assert.ok(!result.content.includes("// removed folder content"));
  assert.deepEqual(parseWorkspaceContent(result.content).folders, [
    {
      path: "/workspace/home",
    },
  ]);
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

test("removeFolderFromWorkspaceFileContent preserves comments in an emptied array", () => {
  const original = `{
  "folders": [
    // only folder
    {
      "path": "/workspace/api"
    },
    // folders tail
  ]
}
`;

  const result = removeFolderFromWorkspaceFileContent(
    original,
    "/workspace/home/home.code-workspace",
    "/workspace/api",
  );

  assert.equal(result.removed, true);
  assertIncludesComments(result.content, [
    "// only folder",
    "// folders tail",
  ]);
  assert.deepEqual(parseWorkspaceContent(result.content).folders, []);
});
