import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";

/* Bundle-size baseline gate (plan §Phase 3, from v0.1):
 *  - hard ceiling: 120 KB gzipped (plan §1.3 budget)
 *  - regression gate: > 5% over the committed baseline fails CI
 *  - sanity: no Lit dev-mode build in the bundle
 * Run with --update after an intentional size change. */

const BUNDLE = "dist/room-climate-card.js";
const BASELINE_FILE = "bundle-baseline.json";
const HARD_LIMIT = 120 * 1024;
const TOLERANCE = 1.05;

const update = process.argv.includes("--update");

if (!existsSync(BUNDLE)) {
  console.error(`check-bundle: ${BUNDLE} not found — run the build first`);
  process.exit(1);
}

const source = readFileSync(BUNDLE);
const gzipped = gzipSync(source, { level: 9 }).length;

if (source.includes("Lit is in dev mode")) {
  console.error("check-bundle: bundle contains the Lit dev-mode build");
  process.exit(1);
}

if (gzipped > HARD_LIMIT) {
  console.error(
    `check-bundle: ${gzipped} B gzipped exceeds the hard ${HARD_LIMIT} B budget (plan §1.3)`,
  );
  process.exit(1);
}

if (update || !existsSync(BASELINE_FILE)) {
  writeFileSync(BASELINE_FILE, `${JSON.stringify({ gzipBytes: gzipped }, null, 2)}\n`);
  console.log(`check-bundle: baseline ${update ? "updated" : "created"} at ${gzipped} B gzipped`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8")).gzipBytes;
if (gzipped > baseline * TOLERANCE) {
  console.error(
    `check-bundle: ${gzipped} B gzipped regresses past baseline ${baseline} B (+${(
      (gzipped / baseline - 1) * 100
    ).toFixed(1)}%). Run \`npm run check:bundle:update\` if intentional.`,
  );
  process.exit(1);
}

console.log(`check-bundle: ${gzipped} B gzipped (baseline ${baseline} B) — OK`);
