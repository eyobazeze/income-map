// Tiny point-in-polygon helpers (no dependencies).
const inRing = (x, y, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const inPoly = (x, y, poly) => inRing(x, y, poly[0]) && !poly.slice(1).some(h => inRing(x, y, h));
export const polys = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
export const contains = (g, x, y) => polys(g).some(p => inPoly(x, y, p));
export const bbox = g => { let w = 180, s = 90, e = -180, n = -90; for (const p of polys(g)) for (const [x, y] of p[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); } return [w, s, e, n]; };
// representative points for a tract: centroid of its biggest ring, then ring vertices as fallbacks
export const probes = g => { const big = polys(g).sort((a, b) => b[0].length - a[0].length)[0]?.[0] || []; if (!big.length) return []; const cx = big.reduce((s, p) => s + p[0], 0) / big.length, cy = big.reduce((s, p) => s + p[1], 0) / big.length; return [[cx, cy], ...big.filter((_, i) => i % 3 === 0)]; };
