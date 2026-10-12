/**
 * Run every *.test.ts in the repo.
 *
 * There are thirty of them and package.json had no "test" script at all, so
 * running the suite meant knowing the files existed and invoking each by
 * hand. They are discovered rather than listed: a list of thirty paths goes
 * stale the first time someone adds the thirty-first and forgets.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const SKIP = new Set(["node_modules", "dist", ".git"]);

function testFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) testFiles(full, out);
    else if (entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const files = testFiles(ROOT).sort();
if (files.length === 0) {
  console.error("run-tests: found no test files — the discovery is broken, not the suite");
  process.exit(1);
}

const failed = [];
for (const file of files) {
  const name = relative(ROOT, file);
  const result = spawnSync("node", ["--experimental-strip-types", file], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status === 0) {
    const summary = (result.stdout.match(/(\d+) passed, (\d+) failed/) ?? [])[0];
    console.log(`ok    ${name}${summary ? `  (${summary})` : ""}`);
  } else {
    failed.push(name);
    console.log(`FAIL  ${name}`);
    const output = (result.stdout + result.stderr).trim().split("\n");
    for (const line of output.slice(-12)) console.log(`      ${line}`);
  }
}

console.log(`\n${files.length - failed.length}/${files.length} test files passed`);
if (failed.length > 0) {
  console.log(`failing: ${failed.join(", ")}`);
  process.exit(1);
}
