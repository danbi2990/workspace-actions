import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";

test("compiled extension bundle loads with VS Code as the only external module", () => {
  const moduleWithLoad = Module as unknown as {
    _load: (
      request: string,
      parent: NodeModule | null,
      isMain: boolean,
    ) => unknown;
  };
  const originalLoad = moduleWithLoad._load;
  const extensionPath = require.resolve("../dist/src/extension.js");

  moduleWithLoad._load = (request, parent, isMain) => {
    if (request === "vscode") {
      return {};
    }

    return originalLoad(request, parent, isMain);
  };

  try {
    delete require.cache[extensionPath];
    const extension = require(extensionPath) as {
      activate?: unknown;
      deactivate?: unknown;
    };

    assert.equal(typeof extension.activate, "function");
    assert.equal(typeof extension.deactivate, "function");
  } finally {
    moduleWithLoad._load = originalLoad;
    delete require.cache[extensionPath];
  }
});
