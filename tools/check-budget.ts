/**
 * Performance budget (CLAUDE.md): initial JS under 300 KB gzipped. Run after `vite build`.
 * The globe is lazy-loaded and not counted.
 */
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 300;
const html = readFileSync("dist/index.html", "utf8");
const initial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]!);
let total = 0;
for (const file of initial) {
  const kb = gzipSync(readFileSync(`dist/${file}`)).length / 1024;
  total += kb;
  console.info(`${file}: ${kb.toFixed(1)} KB gz`);
}
const lazy = readdirSync("dist/assets").filter((f) => f.endsWith(".js") && !initial.includes(`assets/${f}`));
console.info(`lazy chunks: ${lazy.join(", ") || "none"}`);
console.info(`initial JS: ${total.toFixed(1)} KB gz (budget ${BUDGET_KB} KB)`);
if (total > BUDGET_KB) {
  console.error("over budget");
  process.exit(1);
}
