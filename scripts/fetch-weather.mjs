// Fetch one year of hourly dry-bulb + RH from the Open-Meteo historical archive (free, no key)
// and write a cached copy to src/data/weather/<city>.json so the app works offline.
// Usage: node scripts/fetch-weather.mjs [cityId ...]   (no args = all cities)
import { readFile, writeFile } from 'node:fs/promises';

const YEAR = 2025; // non-leap year -> exactly 8,760 hours
const cities = JSON.parse(await readFile(new URL('../src/data/cities.json', import.meta.url)));
const wanted = process.argv.slice(2);

for (const c of cities.filter((c) => !wanted.length || wanted.includes(c.id))) {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${c.lat}&longitude=${c.lon}` +
    `&start_date=${YEAR}-01-01&end_date=${YEAR}-12-31` +
    `&hourly=temperature_2m,relative_humidity_2m&timezone=${encodeURIComponent(c.timezone)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${c.id}: HTTP ${res.status} ${await res.text()}`);
  const j = await res.json();
  const t = j.hourly.temperature_2m;
  const rh = j.hourly.relative_humidity_2m;
  if (t.length !== 8760 || rh.length !== 8760) throw new Error(`${c.id}: expected 8760 hours, got ${t.length}`);
  // Archive occasionally has nulls; carry the previous hour forward.
  for (let i = 0; i < 8760; i++) {
    if (t[i] == null) t[i] = t[i - 1] ?? 15;
    if (rh[i] == null) rh[i] = rh[i - 1] ?? 60;
  }
  const out = { city: c.id, year: YEAR, source: 'Open-Meteo historical archive (ERA5-based)', url, tempC: t, rh };
  await writeFile(new URL(`../src/data/weather/${c.id}.json`, import.meta.url), JSON.stringify(out));
  console.log(`${c.id}: ${t.length} h, Tmax ${Math.max(...t)} C, Tmin ${Math.min(...t)} C`);
}
