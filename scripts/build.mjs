import { rmSync } from "node:fs";
import * as esbuild from "esbuild";

rmSync(new URL("../dist", import.meta.url), {
  recursive: true,
  force: true,
});

await esbuild.build({
  bundle: true,
  entryPoints: ["src/extension.ts"],
  external: ["vscode"],
  format: "cjs",
  mainFields: ["module", "main"],
  outfile: "dist/src/extension.js",
  platform: "node",
  sourcemap: false,
  target: "node20",
});
