import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { loadData } from './data.js';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty'; // free vector tiles, no key
const money = n => '$' + Math.round(n).toLocaleString();
const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];

const COLORS = {
  income: { stops: [[1, '#edf8e9'], [35000, '#bae4b3'], [60000, '#74c476'], [90000, '#31a354'], [130000, '#006d2c']], key: 'income', label: 'Median household income', fmt: v => money(v) },
  rent: { stops: [[1, '#eff3ff'], [1200, '#bdd7e7'], [1700, '#6baed6'], [2200, '#3182bd'], [2800, '#08519c']], key: 'rent', label: 'Median monthly rent', fmt: v => money(v) }
};
const stepExpr = (key, stops) => ['step', ['coalesce', ['get', key], -1], '#cccccc', ...stops.flat()];
const budgetExpr = rent => ['case', ['<=', ['coalesce', ['get', 'rent'], 1e9], rent], '#1f9e6e', '#d9d9d9'];

function usePersisted(key, init) {
  const [v, setV] = useState(() => { try { return JSON.parse(localStorage.getItem(key)) ?? init; } catch { return init; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}

const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const flat = c => (typeof c[0] === 'number' ? [c] : c.flatMap(flat));
const boundsOf = feats => { let w = 180, s = 90, e = -180, n = -90; for (const f of feats) for (const [x, y] of flat(f.geometry.coordinates)) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); } return [[w, s], [e, n]]; };
// Groups tracts into neighborhoods and compares each with the user's rent budget.
function useAreas(tracts, affordable) {
  return useMemo(() => {
    const g = new Map();
    for (const f of tracts?.features || []) { const p = f.properties; if (!p.nta) continue; if (!g.has(p.nta)) g.set(p.nta, { name: p.nta, borough: p.borough, tracts: [] }); g.get(p.nta).tracts.push(f); }
    return [...g.values()].map(a => {
      const rents = a.tracts.map(f => f.properties.rent).filter(Boolean), incomes = a.tracts.map(f => f.properties.income).filter(Boolean);
      const ok = rents.filter(r => r <= affordable).length;
      return { ...a, rent: median(rents), income: median(incomes), minRent: Math.min(...rents), maxRent: Math.max(...rents), ok, total: rents.length, pct: rents.length ? ok / rents.length : 0 };
    }).filter(a => a.total > 0);
  }, [tracts, affordable]);
}

const ICONS = {
  map: 'M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7zm0 0v13m6-10v13',
  calc: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 4h10M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01',
  saved: 'M6 3h12v18l-6-4-6 4z',
  about: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-10v6m0-9.5v.01'
};
const Icon = ({ n }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[n]} /></svg>;

export default function App() {
  const [tab, setTab] = useState('map');
  const [tracts, setTracts] = useState(null);
  const [housing, setHousing] = useState([]);
  const [status, setStatus] = useState('Starting…');
  const [error, setError] = useState('');
  const [calc, setCalc] = usePersisted('calc', { income: 5000, expense: 1500, ratio: 30 });
  const [mode, setMode] = useState('income');
  const [saved, setSaved] = usePersisted('saved', []);
  const [focus, setFocus] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [area, setArea] = useState(null);
  const [savedAreas, setSavedAreas] = usePersisted('savedAreas', []);

  const load = () => { setError(''); setTracts(null); loadData(setStatus).then(d => { setTracts(d.tracts); setHousing(d.housing); setStatus(d.housingError || ''); }).catch(e => setError(e.message)); };
  useEffect(load, []);
  useEffect(() => { if (tab === 'calc') setMode('budget'); }, [tab]);

  const affordable = Math.max(0, Math.min(calc.income * calc.ratio / 100, calc.income - calc.expense));
  const areas = useAreas(tracts, affordable);
  const areaObj = areas.find(a => a.name === area);
  const toggleArea = n => setSavedAreas(x => x.includes(n) ? x.filter(y => y !== n) : [...x, n]);
  const toggleSave = id => setSaved(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const tabs = [['map', 'Explore map'], ['calc', 'Calculator'], ['saved', 'Saved'], ['about', 'About']];

  return (
    <div className={'app ' + (tab === 'map' ? 'tab-map' : 'tab-other')}>
      <nav className="rail">
        <div className="brand"><img src="/icon-192.png" alt="" />HomeMap<small>NYC</small></div>
        {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon n={k} /><span>{l}{k === 'saved' && saved.length ? <em>{saved.length}</em> : null}</span></button>)}
        <div className="railfoot">Real data: U.S. Census ACS and NYC HPD</div>
      </nav>
      <section className="panel">
        {tab === 'calc' && (showResult
          ? (areaObj
            ? <AreaDetail a={areaObj} housing={housing} affordable={affordable} calc={calc} back={() => setArea(null)}
                saved={savedAreas.includes(areaObj.name)} toggle={() => toggleArea(areaObj.name)}
                onMap={() => { setMode('budget'); setFocus({ bounds: boundsOf(areaObj.tracts), t: Date.now() }); setTab('map'); }}
                openHome={h => { setFocus({ ...h, t: Date.now() }); setTab('map'); }} />
            : <Result calc={calc} affordable={affordable} areas={areas} open={setArea} back={() => setShowResult(false)} onMap={() => { setMode('budget'); setTab('map'); }} />)
          : <Calculator calc={calc} setCalc={setCalc} affordable={affordable} go={() => { setArea(null); setShowResult(true); }} />)}
        {tab === 'saved' && <Saved items={housing.filter(h => saved.includes(h.id))} remove={toggleSave} open={h => { setFocus({ ...h, t: Date.now() }); setTab('map'); }}
          areas={areas.filter(x => savedAreas.includes(x.name))} removeArea={toggleArea} openArea={n => { setArea(n); setShowResult(true); setTab('calc'); }} />}
        {tab === 'about' && <About />}
      </section>
      <main className="mapcol">
        <MapView tracts={tracts} housing={housing} mode={mode} setMode={setMode} budget={affordable} saved={saved} toggleSave={toggleSave} focus={focus} tab={tab} areaName={area} />
        {tracts && status && <div className="toast">{status}</div>}
        {!tracts && <div className="boot">{error ? <><b>Couldn't load the data</b><p>{error}</p>
            <button className="btn" onClick={load}>Try again</button></> : <><div className="spin" /><p>{status}</p><small>First load takes a few seconds, then it's cached.</small></>}</div>}
      </main>
      <div className="tabbar">
        {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon n={k} />{l.split(' ')[0]}</button>)}
      </div>
    </div>
  );
}

function MapView({ tracts, housing, mode, setMode, budget, saved, toggleSave, focus, tab, areaName }) {
  const el = useRef(null), map = useRef(null), ready = useRef(false);
  const [sel, setSel] = useState(null);   // {type:'tract'|'home', ...}
  const [query, setQuery] = useState('');
  const housingById = useMemo(() => new Map(housing.map(h => [h.id, h])), [housing]);

  useEffect(() => {
    const m = map.current = new maplibregl.Map({ container: el.current, style: STYLE, center: [-73.97, 40.72], zoom: 10.2, attributionControl: { compact: true } });
    m.on('load', () => { ready.current = true; m.fire('app-ready'); });
    return () => m.remove();
  }, []);

  // add / refresh data layers
  useEffect(() => {
    const m = map.current; if (!m || !tracts) return;
    const add = () => {
      if (!m.getSource('tracts')) {
        m.addSource('tracts', { type: 'geojson', data: tracts });
        m.addLayer({ id: 'tracts-fill', type: 'fill', source: 'tracts', paint: { 'fill-color': '#ccc', 'fill-opacity': 0.62 } });
        m.addLayer({ id: 'tracts-line', type: 'line', source: 'tracts', paint: { 'line-color': '#fff', 'line-width': 0.4, 'line-opacity': 0.6 } });
        m.addLayer({ id: 'nta-outline', type: 'line', source: 'tracts', filter: ['==', ['get', 'nta'], ''], paint: { 'line-color': '#0b3d31', 'line-width': 3.5 } });
        m.on('click', 'tracts-fill', e => { if (!m.queryRenderedFeatures(e.point, { layers: ['homes', 'clusters'] }).length) setSel({ type: 'tract', ...e.features[0].properties }); });
      }
      if (!m.getSource('homes')) {
        m.addSource('homes', { type: 'geojson', cluster: true, clusterRadius: 40, clusterMaxZoom: 13, data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'clusters', type: 'circle', source: 'homes', filter: ['has', 'point_count'], paint: { 'circle-color': '#1f6f5c', 'circle-radius': ['step', ['get', 'point_count'], 14, 50, 18, 250, 24], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
        m.addLayer({ id: 'cluster-n', type: 'symbol', source: 'homes', filter: ['has', 'point_count'], layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12, 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': '#fff' } });
        m.addLayer({ id: 'homes', type: 'circle', source: 'homes', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': '#f2994a', 'circle-radius': 7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
        m.on('click', 'clusters', e => {
          const f = e.features[0];
          m.getSource('homes').getClusterExpansionZoom(f.properties.cluster_id).then(z => m.easeTo({ center: f.geometry.coordinates, zoom: z + 0.5 }));
        });
        m.on('click', 'homes', e => { const h = housingById.get(e.features[0].properties.id); if (h) setSel({ type: 'home', ...h }); });
        for (const l of ['clusters', 'homes']) { m.on('mouseenter', l, () => m.getCanvas().style.cursor = 'pointer'); m.on('mouseleave', l, () => m.getCanvas().style.cursor = ''); }
      }
    };
    ready.current ? add() : m.once('app-ready', add);
  }, [tracts, housingById]);

  useEffect(() => {
    const m = map.current; if (!m || !housing.length) return;
    const put = () => m.getSource('homes')?.setData({ type: 'FeatureCollection', features: housing.map(h => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [h.lng, h.lat] }, properties: { id: h.id } })) });
    if (m.getSource('homes')) put(); else m.once('sourcedata', put);
    const t = setTimeout(put, 800); return () => clearTimeout(t);
  }, [housing, tracts]);

  // recolor by mode
  useEffect(() => {
    const m = map.current; if (!m || !tracts) return;
    const paint = () => {
      if (!m.getLayer('tracts-fill')) return;
      m.setPaintProperty('tracts-fill', 'fill-color', mode === 'budget' ? budgetExpr(budget) : stepExpr(COLORS[mode].key, COLORS[mode].stops));
    };
    ready.current && m.getLayer('tracts-fill') ? paint() : m.once('idle', paint);
  }, [mode, budget, tracts]);

  useEffect(() => { const t = setTimeout(() => map.current?.resize(), 80); return () => clearTimeout(t); }, [tab]);
  useEffect(() => {
    const m = map.current; if (!m || !tracts) return;
    const f = () => m.getLayer('nta-outline') && m.setFilter('nta-outline', ['==', ['get', 'nta'], areaName || '']);
    m.getLayer('nta-outline') ? f() : m.once('idle', f);
  }, [areaName, tracts]);
  useEffect(() => { if (focus?.bounds) { map.current?.fitBounds(focus.bounds, { padding: 70, maxZoom: 15 }); setSel(null); } else if (focus) { map.current?.flyTo({ center: [focus.lng, focus.lat], zoom: 15 }); setSel({ type: 'home', ...focus }); } }, [focus]);

  const search = e => {
    e.preventDefault(); const q = query.trim().toLowerCase(); if (!q) return;
    const h = housing.find(h => (h.name + ' ' + h.address).toLowerCase().includes(q));
    if (h) { map.current.flyTo({ center: [h.lng, h.lat], zoom: 15 }); setSel({ type: 'home', ...h }); }
    else if (BOROUGHS.some(b => b.toLowerCase().includes(q))) {
      const pts = housing.filter(h => h.borough?.toLowerCase().includes(q)); if (pts.length) map.current.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: 11.5 });
    }
  };

  const L = mode === 'budget' ? null : COLORS[mode];
  return (
    <div className="mapwrap">
      <div id="map" ref={el} />
      <div className="top">
        <form onSubmit={search}><input className="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a building, street or borough" /></form>
        <div className="chips">
          {[['income', 'Income'], ['rent', 'Rent'], ['budget', 'Within my budget']].map(([k, l]) =>
            <button key={k} className={'chip' + (mode === k ? ' on' : '')} onClick={() => setMode(k)}>{l}</button>)}
        </div>
      </div>
      <div className="legend">
        {L ? <><b>{L.label}</b>{[[0, '#ccc', 'No data'], ...L.stops.map(([v, c]) => [v, c, v === 1 ? `< ${L.fmt(L.stops[1][0])}` : `${L.fmt(v)}+`])].map(([v, c, t], i) => i === 1 ? null : <div key={i}><i style={{ background: c }} />{t}</div>)}</>
          : <><b>Rent ≤ {money(budget)}</b><div><i style={{ background: '#1f9e6e' }} />Within budget</div><div><i style={{ background: '#d9d9d9' }} />Above budget / no data</div></>}
        <div><i style={{ background: '#f2994a', borderRadius: 6 }} />Affordable housing</div>
      </div>
      {sel && <div className="card">
        <div className="row">
          <div>
            <b>{sel.type === 'home' ? sel.name || sel.address : `${sel.nta || sel.borough} · tract ${String(sel.geoid).slice(5)}`}</b>
            <div className="small">{sel.type === 'home'
              ? `${sel.address}, ${sel.nta || sel.borough} · ${sel.total} affordable units`
              : `Median income ${sel.income ? money(sel.income) : 'n/a'} · Median rent ${sel.rent ? money(sel.rent) : 'n/a'}`}</div>
            {sel.type === 'home' && <div className="small">Units by income band — Extremely low {sel.ami.extremelyLow} · Very low {sel.ami.veryLow} · Low {sel.ami.low} · Moderate {sel.ami.moderate} · Middle {sel.ami.middle}</div>}
          </div>
          <div>
            {sel.type === 'home' && <button className="icon" onClick={() => toggleSave(sel.id)}>{saved.includes(sel.id) ? '★' : '☆'}</button>}
            <button className="icon" onClick={() => setSel(null)}>✕</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange, fmt }) {
  return <>
    <label>{label}</label><div className="val">{fmt(value)}</div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} />
    <div className="row small"><span>{fmt(min)}</span><span>{fmt(max)}</span></div>
  </>;
}

function Calculator({ calc, setCalc, affordable, go }) {
  const set = k => v => setCalc(c => ({ ...c, [k]: v }));
  return <div className="page">
    <h1>What can I afford?</h1>
    <p className="sub">Enter your monthly figures. We compare your budget with real NYC rents by census tract.</p>
    <Slider label="Monthly income (after or before tax, your choice)" min={1000} max={20000} step={100} value={calc.income} onChange={set('income')} fmt={money} />
    <Slider label="Other monthly expenses" min={0} max={10000} step={100} value={calc.expense} onChange={set('expense')} fmt={money} />
    <Slider label="Share of income for rent" min={20} max={50} step={1} value={calc.ratio} onChange={set('ratio')} fmt={v => v + '%'} />
    <p className="small">Common guideline: about 30% of income. Your rent budget: <b>{money(affordable)}/mo</b></p>
    <button className="btn" onClick={go}>Calculate</button>
  </div>;
}

function Result({ calc, affordable, areas, open, back, onMap }) {
  const [boro, setBoro] = useState('All'), [limit, setLimit] = useState(30);
  const list = useMemo(() => areas.filter(a => a.ok > 0 && (boro === 'All' || a.borough === boro)).sort((x, y) => y.pct - x.pct || x.rent - y.rent), [areas, boro]);
  const parts = [['Rent', affordable, '#1f6f5c'], ['Other expenses', calc.expense, '#f2994a'], ['Left over', Math.max(0, calc.income - affordable - calc.expense), '#bdd7e7']];
  const total = parts.reduce((s, p) => s + p[1], 0) || 1; let off = 0; const R = 70, C = 2 * Math.PI * R;
  return <div className="page">
    <button className="icon" onClick={back}>← Back</button>
    <h1>Your rent budget</h1>
    <div className="val" style={{ fontSize: 34 }}>{money(affordable)}<span className="small"> / month</span></div>
    <svg viewBox="0 0 200 200" width="200" style={{ display: 'block', margin: '10px auto' }}>
      {parts.map(([n, v, c]) => { const d = v / total * C, el = <circle key={n} cx="100" cy="100" r={R} fill="none" stroke={c} strokeWidth="26" strokeDasharray={`${d} ${C - d}`} strokeDashoffset={-off} transform="rotate(-90 100 100)" />; off += d; return el; })}
    </svg>
    <div className="row small" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>{parts.map(([n, v, c]) => <span key={n}><i style={{ display: 'inline-block', width: 10, height: 10, background: c, borderRadius: 3, marginRight: 4 }} />{n} {money(v)}</span>)}</div>
    <h3>Neighborhoods within your range</h3>
    <p className="small">Tap a neighborhood for details. Sorted by how much of it fits your budget.</p>
    <div className="chips" style={{ margin: '10px 0' }}>{['All', ...BOROUGHS].map(b => <button key={b} className={'chip' + (boro === b ? ' on' : '')} onClick={() => { setBoro(b); setLimit(30); }}>{b}</button>)}</div>
    {!list.length && <p className="small">No neighborhoods match this budget{boro !== 'All' ? ` in ${boro}` : ''}. Try raising the rent share or lowering expenses.</p>}
    {list.slice(0, limit).map(a => <button className="area" key={a.name} onClick={() => open(a.name)}>
      <div className="row"><b>{a.name}</b><span className="small">{a.borough}</span></div>
      <div className="small">Typical rent {money(a.rent)} · {a.ok} of {a.total} areas fit</div>
      <div className="bar"><b style={{ width: a.pct * 100 + '%' }} /></div></button>)}
    {list.length > limit && <button className="btn alt" onClick={() => setLimit(l => l + 30)}>Show more ({list.length - limit} left)</button>}
    <button className="btn" onClick={onMap}>Show all on map</button>
  </div>;
}

const BANDS = [['extremelyLow', 'Extremely low income'], ['veryLow', 'Very low income'], ['low', 'Low income'], ['moderate', 'Moderate income'], ['middle', 'Middle income']];
function AreaDetail({ a, housing, affordable, calc, back, saved, toggle, onMap, openHome }) {
  const homes = useMemo(() => housing.filter(h => h.nta === a.name).sort((x, y) => y.total - x.total), [housing, a.name]);
  const units = homes.reduce((s, h) => s + h.total, 0);
  const bands = BANDS.map(([k, l]) => [l, homes.reduce((s, h) => s + (h.ami?.[k] || 0), 0)]);
  const diff = affordable - a.rent, burden = a.rent / calc.income * 100;
  return <div className="page">
    <div className="row"><button className="icon" onClick={back}>← Neighborhoods</button><button className="icon" onClick={toggle}>{saved ? '★ Saved' : '☆ Save'}</button></div>
    <h1>{a.name}</h1><p className="sub">{a.borough} · {a.total} census areas with data</p>
    <div className={'verdict ' + (diff >= 0 ? 'good' : 'bad')}>{diff >= 0 ? `Typical rent is ${money(diff)} under your budget` : `Typical rent is ${money(-diff)} over your budget`}</div>
    <div className="stats">
      <div className="stat"><small>Typical rent</small><b>{money(a.rent)}</b></div>
      <div className="stat"><small>Typical income</small><b>{a.income ? money(a.income / 12) + '/mo' : 'n/a'}</b></div>
      <div className="stat"><small>Rent range</small><b>{money(a.minRent)}–{money(a.maxRent)}</b></div>
      <div className="stat"><small>Rent vs your income</small><b>{Math.round(burden)}%</b></div>
      <div className="stat"><small>Areas within budget</small><b>{a.ok} of {a.total}</b></div>
      <div className="stat"><small>Affordable units</small><b>{units.toLocaleString()}</b></div>
    </div>
    <p className="small">“Typical” is the middle value across this neighborhood’s census areas (U.S. Census ACS estimates; actual listings vary).</p>
    <button className="btn" onClick={onMap}>Show on map</button>
    <h3>Affordable housing here</h3>
    {!homes.length && <p className="small">No affordable housing projects from the city’s list are in this neighborhood.</p>}
    {units > 0 && <div className="bands">{bands.filter(([, v]) => v).map(([l, v]) => <div key={l}><div className="row small"><span>{l}</span><span>{v.toLocaleString()} units</span></div><div className="bar"><b style={{ width: v / units * 100 + '%' }} /></div></div>)}</div>}
    {homes.slice(0, 10).map(h => <div className="item row" key={h.id}>
      <div><b>{h.name || h.address}</b><div className="small">{h.address} · {h.total} units</div></div>
      <button className="icon" onClick={() => openHome(h)}>Map</button></div>)}
    {homes.length > 10 && <p className="small">+ {homes.length - 10} more projects. Zoom the map to see them all.</p>}
  </div>;
}

function Saved({ items, remove, open, areas, removeArea, openArea }) {
  return <div className="page"><h1>Saved</h1>
    <h3>Neighborhoods</h3>
    {!areas.length && <p className="small">Open a neighborhood from the calculator results and tap Save.</p>}
    {areas.map(a => <div className="item row" key={a.name}>
      <div onClick={() => openArea(a.name)} style={{ cursor: 'pointer' }}><b>{a.name}</b><div className="small">{a.borough} · typical rent {money(a.rent)}</div></div>
      <button className="icon" onClick={() => removeArea(a.name)}>✕</button></div>)}
    <h3>Homes</h3>
    {!items.length && <p className="small">Tap a housing pin on the map, then ☆ to save it here.</p>}
    {items.map(h => <div className="item row" key={h.id}>
      <div onClick={() => open(h)} style={{ cursor: 'pointer' }}><b>{h.name || h.address}</b><div className="small">{h.address}, {h.nta || h.borough} · {h.total} units</div></div>
      <button className="icon" onClick={() => remove(h.id)}>✕</button></div>)}
  </div>;
}

function About() {
  return <div className="page"><h1>About the data</h1>
    <p className="sub">All figures are real and free to use.</p>
    <div className="item"><b>Income and rent</b><div className="small">U.S. Census Bureau, American Community Survey 5-year estimates (B19013 median household income, B25064 median gross rent), by census tract. These are estimates with margins of error, and some tracts have no data.</div></div>
    <div className="item"><b>Affordable housing</b><div className="small">NYC Department of Housing Preservation and Development, “Affordable Housing Production by Building” (NYC Open Data).</div></div>
    <div className="item"><b>Map</b><div className="small">OpenFreeMap tiles, © OpenMapTiles, data © OpenStreetMap contributors. Rendered with MapLibre.</div></div>
    <div className="item"><b>Your data</b><div className="small">Calculator values and saved homes are stored only on this device.</div></div>
  </div>;
}
