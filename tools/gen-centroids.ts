/**
 * Generates src/view/country-centroids.json: ISO alpha-2 → [lat, lon], from the `world-countries`
 * package (dev dependency). Run: npx tsx tools/gen-centroids.ts
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const countries = require("world-countries") as { cca2: string; latlng: [number, number] }[];

const out: Record<string, [number, number]> = {};
for (const c of countries) {
  if (/^[A-Z]{2}$/.test(c.cca2) && Array.isArray(c.latlng) && c.latlng.length === 2) {
    out[c.cca2] = [Math.round(c.latlng[0] * 10) / 10, Math.round(c.latlng[1] * 10) / 10];
  }
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync("src/view/country-centroids.json", JSON.stringify(sorted) + "\n");
console.info(`wrote ${Object.keys(sorted).length} countries`);
