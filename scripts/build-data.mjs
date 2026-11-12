// Downloads the real data ONCE and saves it in public/data. After that the app needs no key and no live API calls.
// Reads your free Census key from a file named .env  ->  CENSUS_KEY=your_key
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { contains, bbox, probes } from './geo.mjs';

const OUT = 'public/data';
const DATA_VERSION = '2'; // bump when the data format changes so `npm run dev` rebuilds automatically
if (process.argv.includes('--if-missing') && existsSync(`${OUT}/version.txt`) && readFileSync(`${OUT}/version.txt`, 'utf8').trim() === DATA_VERSION) process.exit(0);

if (existsSync('.env')) for (const l of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const KEY = process.env.CENSUS_KEY || process.env.VITE_CENSUS_KEY;
if (!KEY) {
  console.error('\nMissing Census key. Create a file named .env in this folder with one line:\n  CENSUS_KEY=your_key_here\nFree key: https://api.census.gov/data/key_signup.html\n');
  process.exit(1);
}

const YEAR = process.env.ACS_YEAR || '2023';
const COUNTIES = { '005': 'Bronx', '047': 'Brooklyn', '061': 'Manhattan', '081': 'Queens', '085': 'Staten Island' };
const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0/query';
const HPD = 'https://data.cityofnewyork.us/resource/hg8x-zxpr.json';
const clean = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

async function getJSON(url, label) {
  const r = await fetch(url); const t = await r.text();
  try { const j = JSON.parse(t); if (j?.error) throw new Error(j.error.message); return j; }
  catch (e) { throw new Error(`${label} failed (HTTP ${r.status}): ${e.message === 'Unexpected token' ? '' : e.message} ${t.slice(0, 150).replace(/\s+/g, ' ')}`); }
}

console.log('1/3 Income and rent from the U.S. Census…');
const rows = (await Promise.all(Object.keys(COUNTIES).map(async co =>
  (await getJSON(`https://api.census.gov/data/${YEAR}/acs/acs5?get=B19013_001E,B25064_001E&for=tract:*&in=state:36%20county:${co}&key=${KEY}`, 'Census ACS')).slice(1)))).flat();
const acs = new Map(rows.map(([inc, rent, st, co, tr]) => [st + co + tr, { income: clean(inc), rent: clean(rent), borough: COUNTIES[co] }]));
console.log('   tracts with data:', acs.size);

console.log('2/3 Neighborhood boundaries…');
const where = encodeURIComponent(`STATE='36' AND COUNTY IN ('${Object.keys(COUNTIES).join("','")}')`);
const g = await getJSON(`${TIGER}?where=${where}&outFields=GEOID&outSR=4326&f=geojson&geometryPrecision=5&maxAllowableOffset=0.0002`, 'Census boundaries');
const features = (g.features || []).filter(f => acs.has(f.properties.GEOID))
  .map(f => ({ type: 'Feature', geometry: f.geometry, properties: { geoid: f.properties.GEOID, ...acs.get(f.properties.GEOID) } }));
if (!features.length) throw new Error('No boundaries matched the Census data.');

console.log('3/4 Neighborhood names (NYC Planning NTAs)…');
const ntaRaw = await getJSON('https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=500', 'NYC neighborhoods');
const ntas = ntaRaw.features.filter(f => f.geometry && f.properties.ntaname && !/park|cemetery|airport/i.test(f.properties.ntaname))
  .map(f => ({ name: f.properties.ntaname, geometry: f.geometry, box: bbox(f.geometry) }));
const findNta = (x, y) => ntas.find(a => x >= a.box[0] && x <= a.box[2] && y >= a.box[1] && y <= a.box[3] && contains(a.geometry, x, y))?.name || null;
for (const f of features) f.properties.nta = probes(f.geometry).map(([x, y]) => findNta(x, y)).find(Boolean) || null;
console.log('   tracts matched to a neighborhood:', features.filter(f => f.properties.nta).length, 'of', features.length);

console.log('4/4 Affordable housing from NYC Open Data…');
const hpd = await getJSON(`${HPD}?$limit=50000&$where=${encodeURIComponent('latitude IS NOT NULL')}`, 'NYC HPD');
const n = v => Number(v) || 0;
const housing = hpd.map((h, i) => ({
  id: String(h.building_id || `${h.project_id}-${i}`),
  name: h.project_name || `${h.house_number || ''} ${h.street_name || ''}`.trim(),
  address: `${h.house_number || ''} ${h.street_name || ''}`.trim(), borough: h.borough,
  lat: Number(h.latitude), lng: Number(h.longitude), total: n(h.total_units),
  nta: findNta(Number(h.longitude), Number(h.latitude)),
  beds: { studio: n(h.studio_units), b1: n(h._1_br_units), b2: n(h._2_br_units), b3: n(h._3_br_units), b4plus: n(h._4_br_units) + n(h._5_br_units) + n(h._6_br_units) },
  ami: { extremelyLow: n(h.extremely_low_income_units), veryLow: n(h.very_low_income_units), low: n(h.low_income_units), moderate: n(h.moderate_income_units), middle: n(h.middle_income_units) }
})).filter(h => h.lat && h.lng && h.total > 0);

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/tracts.geojson`, JSON.stringify({ type: 'FeatureCollection', features }));
writeFileSync(`${OUT}/housing.json`, JSON.stringify(housing));
writeFileSync(`${OUT}/version.txt`, DATA_VERSION);
console.log(`\nDone. ${features.length} neighborhoods, ${housing.length} housing projects saved to ${OUT}/`);
