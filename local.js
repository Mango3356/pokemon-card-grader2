/* GradScan — local engine: no AI, no API key.
 *  1. Reads the card name and number with Tesseract.js (OCR runs in the browser).
 *  2. Finds the card in TCGdex (free open Pokémon TCG database, no key) with prices.
 *  3. Measures edge and corner whitening on the rectified scans and estimates surface.
 *  Same photos → same result, every time.
 */
(() => {
"use strict";

const TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const TCGDEX = "https://api.tcgdex.net/v2/";
const W = 1100, H = 1536;          // rectified card size produced by the scanner

/* ---------------- helpers ---------------- */
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const WHITE = [255, 255, 255];
function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some(s => s.src === src)) return res();
    const s = document.createElement("script"); s.src = src; s.async = true;
    s.onload = res; s.onerror = () => rej(new Error("script")); document.head.appendChild(s);
  });
}
function toCanvas(img, w = W, h = H) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, w, h);
  return c;
}
function median(arr) { if (!arr.length) return NaN; const v = arr.slice().sort((a, b) => a - b); return v[v.length >> 1]; }
function lev(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const similarity = (a, b) => { if (!a || !b) return 0; const m = Math.max(a.length, b.length); return 1 - lev(a, b) / m; };

/* ---------------- OCR ---------------- */
let workerP = null;
async function ocrWorker(onStatus) {
  if (!workerP) workerP = (async () => {
    onStatus?.("Scarico il lettore di testo (solo la prima volta)…");
    await loadScript(TESS_URL);
    const w = await window.Tesseract.createWorker("eng", 1, {});
    await w.setParameters({ tessedit_pageseg_mode: "7" });
    return w;
  })().catch(e => { workerP = null; throw e; });
  return workerP;
}
// crop a region (fractions of the card), upscale, grey + autocontrast; optional binarize
function region(src, box, scale, bin) {
  const [x0, y0, x1, y1] = box;
  const sw = Math.round((x1 - x0) * W), sh = Math.round((y1 - y0) * H);
  const c = document.createElement("canvas"); c.width = sw * scale; c.height = sh * scale;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.imageSmoothingQuality = "high";
  x.drawImage(src, Math.round(x0 * W), Math.round(y0 * H), sw, sh, 0, 0, c.width, c.height);
  const id = x.getImageData(0, 0, c.width, c.height), d = id.data, n = d.length / 4;
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
  const sorted = Array.from(g).sort((a, b) => a - b);
  const lo = sorted[Math.floor(n * 0.01)], hi = sorted[Math.floor(n * 0.99)], t = sorted[Math.floor(n * 0.27)];
  for (let i = 0; i < n; i++) {
    let v = bin ? (g[i] > t ? 255 : 0) : clamp((g[i] - lo) / Math.max(1, hi - lo) * 255, 0, 255);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  x.putImageData(id, 0, 0);
  return c;
}
const NAME_STOP = /^(base|basic|basico|fase|stage|stadio|evolves|evolve|from|ps|hp|pv|kp|ex|gx|vmax|vstar|tera|lv|livello|trainer|allenatore|energy|energia)$/i;
function pickName(text) {
  const words = String(text || "").replace(/[^A-Za-zÀ-ÿ'\- ]+/g, " ").split(/\s+/).filter(w => w.length >= 3 && !NAME_STOP.test(w));
  words.sort((a, b) => b.length - a.length);
  return words[0] || "";
}
function pickNumber(text) {
  const t = String(text || "").replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/\s+/g, "");
  let m = t.match(/(\d{1,3})\/(\d{2,3})/);
  if (m) return { number: m[1], total: parseInt(m[2], 10), raw: m[0] };
  m = String(text || "").match(/\b(SWSH|SM|XY|BW|SVP|SV|DP|HGSS)\s?-?(\d{1,3})\b/i);
  if (m) return { number: m[1].toUpperCase() + m[2], total: null, promo: true, raw: m[0] };
  return null;
}
const NUM_BOXES = [[0.12, 0.962, 0.45, 0.997], [0.02, 0.95, 0.42, 0.99], [0.58, 0.955, 0.98, 0.997], [0.55, 0.93, 0.96, 0.97], [0.0, 0.93, 0.5, 0.975]];
const NAME_BOXES = [[0.15, 0.035, 0.62, 0.09], [0.06, 0.025, 0.70, 0.10], [0.1, 0.02, 0.8, 0.07]];
async function readCard(frontImg, onStatus) {
  const w = await ocrWorker(onStatus);
  const src = toCanvas(frontImg);
  onStatus?.("Leggo nome e numero della carta…");
  let num = null, name = "";
  outer: for (const box of NUM_BOXES) for (const bin of [false, true]) {
    const { data } = await w.recognize(region(src, box, 3, bin));
    num = pickNumber(data.text); if (num) break outer;
  }
  for (const box of NAME_BOXES) for (const bin of [true, false]) {
    const { data } = await w.recognize(region(src, box, 3, bin));
    const n = pickName(data.text);
    if (n.length > name.length) name = n;
    if (name.length >= 5 && data.confidence > 50) break;
  }
  return { name, number: num?.number || "", total: num?.total ?? null, promo: !!num?.promo };
}

/* ---------------- TCGdex ---------------- */
async function tget(path) {
  const r = await fetch(TCGDEX + path);
  if (r.status === 404) return null;
  if (!r.ok) throw Object.assign(new Error("tcgdex"), { code: "tcgdex_" + r.status });
  return r.json();
}
async function sets(lang) {
  const key = "gs-sets-" + lang;
  try { const c = JSON.parse(localStorage.getItem(key) || "null"); if (c && Date.now() - c.t < 5 * 864e5) return c.v; } catch (e) {}
  const v = (await tget(lang + "/sets")) || [];
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch (e) {}
  return v;
}
function variants(n) {
  const s = String(n).replace(/^0+(?=\d)/, "");
  return [...new Set([String(n), s, s.padStart(3, "0"), s.padStart(2, "0")])];
}
function summarize(card, lang) {
  const tp = card.pricing?.tcgplayer || {}, cm = card.pricing?.cardmarket || {};
  const tv = tp.holofoil || tp.holo || tp.normal || tp.reverseHolofoil || tp.reverse || Object.values(tp).find(v => v && typeof v === "object") || {};
  const holo = /holo|rare/i.test(card.rarity || "") || !!(tp.holofoil || tp.holo);
  return {
    id: card.id, lang, name: card.name, number: card.localId, set: card.set?.name || "", setId: card.set?.id || "",
    total: card.set?.cardCount?.official ?? null, rarity: card.rarity || "", types: card.types || [],
    image: card.image ? card.image + "/low.webp" : "",
    usd: Number(tv.marketPrice || tv.midPrice) || null,
    eur: Number((holo && cm["trend-holo"]) || cm.trend || cm.avg30 || cm.avg) || null,
  };
}
// Find a card from what OCR read. Returns { best, options } (options = other plausible matches).
async function identify(read, onStatus) {
  onStatus?.("Cerco la carta nel database Pokémon…");
  const found = [];
  for (const lang of ["it", "en"]) {
    if (read.number && read.total) {
      const all = await sets(lang);
      const cands = all.filter(s => s.cardCount?.official === read.total).slice(-12).reverse();
      for (const s of cands) {
        for (const v of variants(read.number)) {
          const c = await tget(`${lang}/cards/${encodeURIComponent(s.id + "-" + v)}`).catch(() => null);
          if (c) { found.push(summarize(c, lang)); break; }
        }
        if (found.length >= 6) break;
      }
    }
    if (!found.length && read.name) {
      const q = new URLSearchParams({ name: read.name, "pagination:itemsPerPage": "12" });
      if (read.number) q.set("localId", read.number.replace(/^0+(?=\d)/, ""));
      let list = await tget(`${lang}/cards?${q}`).catch(() => null);
      if ((!list || !list.length) && read.number) { q.delete("localId"); list = await tget(`${lang}/cards?${q}`).catch(() => null); }
      for (const b of (list || []).slice(0, 6)) { const c = await tget(`${lang}/cards/${encodeURIComponent(b.id)}`).catch(() => null); if (c) found.push(summarize(c, lang)); }
    }
    if (found.length) break;
  }
  found.forEach(f => { f.score = (read.name ? similarity(read.name, f.name) : 0.5) + (read.number && String(f.number).replace(/^0+/, "") === String(read.number).replace(/^0+/, "") ? 0.5 : 0); });
  found.sort((a, b) => b.score - a.score);
  return { best: found[0] || null, options: found.slice(1, 5) };
}
async function search(q, lang = "it") {
  const p = new URLSearchParams({ name: q, "pagination:itemsPerPage": "20" });
  let list = await tget(`${lang}/cards?${p}`);
  if ((!list || !list.length) && lang !== "en") list = await tget(`en/cards?${p}`), lang = "en";
  return (list || []).map(b => ({ id: b.id, lang, name: b.name, number: b.localId, image: b.image ? b.image + "/low.webp" : "" }));
}
async function card(id, lang = "it") { const c = await tget(`${lang}/cards/${encodeURIComponent(id)}`); return c ? summarize(c, lang) : null; }

/* ---------------- condition: whitening on edges and corners ---------------- */
// A printed border that is almost white (silver, white borders) gives no contrast
// against whitening: those sides are reported as not measurable instead of guessed.
function measureSide(px, side, bt) {
  const vertical = side === "L" || side === "R";
  const len = vertical ? H : W;
  const at = (t, d) => side === "L" ? px(d, t) : side === "R" ? px(W - 1 - d, t) : side === "T" ? px(t, d) : px(t, H - 1 - d);
  const r0 = Math.max(9, Math.round(bt * 0.4)), r1 = Math.max(r0 + 4, Math.round(bt * 0.75));
  const refs = [[], [], []];
  for (let t = Math.round(len * 0.12); t < len * 0.88; t += 6) for (let d = r0; d <= r1; d += 2) { const p = at(t, d); refs[0].push(p[0]); refs[1].push(p[1]); refs[2].push(p[2]); }
  const ref = refs.map(median);
  const wd = dist3(ref, WHITE);
  // texture of the printed border: holo / silver / foil borders sparkle and can't be judged
  const tx = []; for (let i = 0; i < refs[0].length; i += 3) tx.push(dist3([refs[0][i], refs[1][i], refs[2][i]], ref));
  const tex = median(tx);
  const isWhite = p => dist3(p, WHITE) < wd * 0.45 && dist3(p, ref) > 45;
  let out = 0, outN = 0, inn = 0, innN = 0;
  for (let t = Math.round(len * 0.07); t < len * 0.93; t += 2) {
    for (let d = 3; d <= 10; d++) { outN++; if (isWhite(at(t, d))) out++; }
    for (let d = r0; d <= r1; d += 2) { innN++; if (isWhite(at(t, d))) inn++; }
  }
  const outF = out / outN, glare = inn / innN;
  return { ref, tex, measurable: wd > 120 && glare < 0.08 && tex < 14, whitening: Math.max(0, outF - glare * 1.2), glare };
}
function measureCorner(px, corner, refs) {
  const R = Math.round(W * 0.05);
  const cx = corner[0] === "L" ? R : W - 1 - R, cy = corner[1] === "T" ? R : H - 1 - R;
  const sx = corner[0] === "L" ? -1 : 1, sy = corner[1] === "T" ? -1 : 1;
  const ref = refs.map(r => r.ref).reduce((a, b) => [a[0] + b[0] / refs.length, a[1] + b[1] / refs.length, a[2] + b[2] / refs.length], [0, 0, 0]);
  const wd = dist3(ref, WHITE);
  let n = 0, w = 0;
  for (let dy = 0; dy <= R; dy++) for (let dx = 0; dx <= R; dx++) {
    const rr = Math.hypot(dx, dy);
    if (rr < R - 15 || rr > R - 4) continue;          // thin band just inside the rounded cut
    const p = px(cx + sx * dx, cy + sy * dy);
    n++; if (dist3(p, WHITE) < wd * 0.45 && dist3(p, ref) > 45) w++;
  }
  const glare = Math.max(...refs.map(r => r.glare));
  return { measurable: refs.every(r => r.measurable), whitening: Math.max(0, w / Math.max(1, n) - glare * 1.5) };
}
function borderSpots(px, sides, bt) {
  // dents / scratches / print spots inside the printed border: pixels far from the border colour
  let n = 0, s = 0;
  for (const [side, m] of Object.entries(sides)) {
    if (!m.measurable) continue;
    const vertical = side === "L" || side === "R", len = vertical ? H : W;
    const r0 = Math.max(12, Math.round(bt[side] * 0.35)), r1 = Math.max(r0 + 2, Math.round(bt[side] * 0.7));
    for (let t = Math.round(len * 0.1); t < len * 0.9; t += 3) for (let d = r0; d <= r1; d += 2) {
      const p = side === "L" ? px(d, t) : side === "R" ? px(W - 1 - d, t) : side === "T" ? px(t, d) : px(t, H - 1 - d);
      n++; if (dist3(p, m.ref) > 75) s++;
    }
  }
  return n ? s / n : null;
}
const step = (v, table) => { for (const [lim, g] of table) if (v <= lim) return g; return table[table.length - 1][1] - 1; };
const EDGE_T = [[0.003, 10], [0.008, 9.5], [0.02, 9], [0.04, 8.5], [0.07, 8], [0.12, 7], [0.2, 6], [1, 5]];
const CORNER_T = [[0.015, 10], [0.04, 9.5], [0.08, 9], [0.13, 8.5], [0.2, 8], [0.3, 7], [0.45, 6], [1, 5]];
const SIDE_IT = { L: "sinistro", R: "destro", T: "superiore", B: "inferiore" };
const CORNER_IT = { LT: "in alto a sinistra", RT: "in alto a destra", LB: "in basso a sinistra", RB: "in basso a destra" };
function measureFace(img, inner, faceName) {
  const c = toCanvas(img), d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const px = (x, y) => { x = clamp(x | 0, 0, W - 1); y = clamp(y | 0, 0, H - 1); const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const bt = inner ? { L: inner[0][0], R: W - inner[1][0], T: inner[0][1], B: H - inner[2][1] } : { L: W * 0.035, R: W * 0.035, T: W * 0.035, B: W * 0.035 };
  for (const k in bt) bt[k] = clamp(bt[k], 14, W * 0.12);
  const sides = {}; for (const s of ["L", "R", "T", "B"]) sides[s] = measureSide(px, s, bt[s]);
  const corners = {};
  for (const k of ["LT", "RT", "LB", "RB"]) corners[k] = measureCorner(px, k, [sides[k[0]], sides[k[1]]]);
  return { face: faceName, sides, corners, spots: borderSpots(px, sides, bt) };
}
/* Grade from the measurements. Front and back are both used; the worse one decides. */
function condition(frontImg, backImg, innerFront, innerBack) {
  const faces = [measureFace(frontImg, innerFront, "fronte")];
  if (backImg) faces.push(measureFace(backImg, innerBack, "retro"));
  const defects = [], edgeScores = [], cornerScores = [];
  let measured = 0, glareMax = 0;
  for (const f of faces) {
    for (const [s, m] of Object.entries(f.sides)) {
      glareMax = Math.max(glareMax, m.glare);
      if (!m.measurable) continue; measured++;
      const g = step(m.whitening, EDGE_T); edgeScores.push(g);
      if (g <= 9) defects.push(`whitening sul bordo ${SIDE_IT[s]} (${f.face}) · ${(m.whitening * 100).toFixed(1)}%`);
    }
    for (const [k, m] of Object.entries(f.corners)) {
      if (!m.measurable) continue;
      const g = step(m.whitening, CORNER_T); cornerScores.push(g);
      if (g <= 9) defects.push(`usura angolo ${CORNER_IT[k]} (${f.face})`);
    }
  }
  const worst = a => a.length ? Math.min(...a) : null;
  let edges = worst(edgeScores), corners = worst(cornerScores);
  // Beckett-style: several worn corners weigh more than a single one
  if (corners != null && cornerScores.filter(g => g <= 8.5).length >= 3) corners = Math.max(1, corners - 0.5);
  if (edges != null && edgeScores.filter(g => g <= 8.5).length >= 3) edges = Math.max(1, edges - 0.5);
  const spots = faces.map(f => f.spots).filter(v => v != null);
  const sp = spots.length ? Math.max(...spots) : null;
  // Surface cannot be fully judged from a photo: start at 9.5, lower for marks found in the border
  let surface = sp == null ? 9 : sp > 0.06 ? 7 : sp > 0.03 ? 8 : sp > 0.012 ? 8.5 : sp > 0.005 ? 9 : 9.5;
  if (glareMax > 0.04) surface = Math.min(surface, 9);
  if (sp != null && sp > 0.012) defects.push(`segni o macchie nel bordo stampato · ${(sp * 100).toFixed(1)}%`);
  return {
    edges, corners, surface,
    measuredSides: measured, totalSides: faces.length * 4,
    hasBack: !!backImg, glare: glareMax, defects,
    faces: faces.map(f => ({ face: f.face, tex: Object.fromEntries(Object.entries(f.sides).map(([k, m]) => [k, +m.tex.toFixed(1)])), sides: Object.fromEntries(Object.entries(f.sides).map(([k, m]) => [k, m.measurable ? +(m.whitening * 100).toFixed(2) : null])), corners: Object.fromEntries(Object.entries(f.corners).map(([k, m]) => [k, m.measurable ? +(m.whitening * 100).toFixed(1) : null])) }))
  };
}

window.GSLocal = { readCard, identify, search, card, condition, _t: { pickNumber, pickName, measureFace } };
})();
