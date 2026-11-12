// The app reads real data files built once by `npm run data` (see scripts/build-data.mjs). No key, no live API calls for users.
async function load(path) {
  const r = await fetch(path); const t = await r.text();
  try { return JSON.parse(t); } catch { throw new Error('Data files are missing. In the project folder run: npm run data'); }
}
export async function loadData(step = () => {}) {
  step('Loading map data…');
  const [tracts, housing] = await Promise.all([load('/data/tracts.geojson'), load('/data/housing.json')]);
  return { tracts, housing, housingError: '' };
}
