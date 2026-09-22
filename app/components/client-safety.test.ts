import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ─── Client safety ───
// Components render in the browser, so whatever they import at runtime is
// bundled into the client. `~/db` opens the database with better-sqlite3, a
// native Node module; in a browser it throws "promisify is not a function"
// and takes the whole route module down with it — the page still arrives
// server-rendered, but React never hydrates it, so charts never draw and
// links stop navigating.
//
// Types are erased at build time, so `import type { … }` from a server
// module is free. A value import is not. Routes are exempt: the React
// Router plugin strips their loaders, and the server-only imports with them.

const componentsDir = path.dirname(fileURLToPath(import.meta.url));

/** Modules that must never reach the browser. `~/db/schema` is fine — it is
 * only table definitions, and several components read enums from it. */
function isServerOnly(specifier: string) {
  return specifier.startsWith("~/services/") || specifier === "~/db";
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith(".test.ts")) {
      return [];
    }
    return [full];
  });
}

// Every `import … from "…"`, with whether it was a statement-level
// `import type`, which the compiler erases entirely.
function imports(source: string) {
  const pattern = /import\s+(type\s+)?([\s\S]*?)\s*from\s*"([^"]+)"/g;
  return [...source.matchAll(pattern)].map((match) => ({
    typeOnly: Boolean(match[1]),
    specifier: match[3],
  }));
}

describe("client safety", () => {
  it("components never import a server module for its values", () => {
    const offenders = sourceFiles(componentsDir).flatMap((file) =>
      imports(readFileSync(file, "utf8"))
        .filter((i) => isServerOnly(i.specifier) && !i.typeOnly)
        .map((i) => `${path.basename(file)} imports ${i.specifier}`)
    );

    expect(offenders).toEqual([]);
  });
});
