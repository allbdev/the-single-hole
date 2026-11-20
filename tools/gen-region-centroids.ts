/**
 * Generates src/view/region-centroids.json: ISO 3166-2 code ("BR-ES") → [lat, lon], the point the
 * globe uses for players in that state or region. Source: Natural Earth admin-1 states and
 * provinces (public domain), which you download yourself:
 *
 *   curl -L -o /tmp/admin1.geojson \
 *     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
 *   npx tsx tools/gen-region-centroids.ts /tmp/admin1.geojson
 *
 * Cloudflare reports the first ISO 3166-2 level. Natural Earth sometimes goes one level lower
 * (French departments instead of regions), so parent regions it names in `region_cod` are added
 * too, as the mean of their parts.
 */
import { readFileSync, writeFileSync } from "node:fs";

interface Props {
  iso_3166_2?: string | null;
  region_cod?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

const CODE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;
const path = process.argv[2];
if (!path) throw new Error("usage: npx tsx tools/gen-region-centroids.ts <admin1.geojson>");
const data = JSON.parse(readFileSync(path, "utf8")) as { features: { properties: Props }[] };

const round = (x: number) => Math.round(x * 10) / 10;
const out: Record<string, [number, number]> = {};
const parents = new Map<string, [number, number][]>();
for (const { properties: p } of data.features) {
  const lat = p.latitude;
  const lon = p.longitude;
  if (typeof lat !== "number" || typeof lon !== "number") continue;
  const code = p.iso_3166_2?.trim();
  if (code && CODE.test(code)) out[code] = [round(lat), round(lon)];
  const parent = p.region_cod?.trim();
  if (parent && CODE.test(parent)) parents.set(parent, [...(parents.get(parent) ?? []), [lat, lon]]);
}
for (const [code, points] of parents) {
  if (out[code]) continue;
  const lat = points.reduce((a, [y]) => a + y, 0) / points.length;
  const lon = points.reduce((a, [, x]) => a + x, 0) / points.length;
  out[code] = [round(lat), round(lon)];
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync("src/view/region-centroids.json", JSON.stringify(sorted) + "\n");
console.info(`wrote ${Object.keys(sorted).length} regions`);
