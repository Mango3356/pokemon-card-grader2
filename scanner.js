/* Gem Mint Lab — live card scanner
 * Camera preview, card edge detection (Sobel + RANSAC lines), perspective
 * rectification to a flat 63×88 image, inner-border detection for automatic
 * centering, glare and sharpness checks. No external libraries.
 */
(() => {
"use strict";

const CARD_RATIO = 63 / 88;           // width / height of a standard TCG card
const OUT_W = 1100, OUT_H = Math.round(OUT_W / CARD_RATIO); // 1100 × 1536
const ANALYSIS_MAX = 480;             // long side of the analysis frame
const STABLE_FRAMES = 9;              // consecutive steady detections before auto-capture

/* ---------------- math helpers ---------------- */
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) if (r !== c) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}
// maps src[i] -> dst[i]
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  return h ? [...h, 1] : null;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* ---------------- image analysis ---------------- */
function grayBlur(data, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114;
  // 3×3 box blur
  const o = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    o[i] = (g[i - w - 1] + g[i - w] + g[i - w + 1] + g[i - 1] + g[i] + g[i + 1] + g[i + w - 1] + g[i + w] + g[i + w + 1]) / 9;
  }
  return o;
}
function sobel(g, w, h) {
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const a = g[i - w - 1], b = g[i - w], c = g[i - w + 1], d = g[i - 1], f = g[i + 1], k = g[i + w - 1], l = g[i + w], m = g[i + w + 1];
    gx[i] = (c + 2 * f + m) - (a + 2 * d + k);
    gy[i] = (k + 2 * l + m) - (a + 2 * b + c);
  }
  return { gx, gy };
}

/* Collect edge candidates along one side of the expected card region.
 * For vertical sides each sample row yields up to 3 local gradient maxima (t = y, v = x);
 * for horizontal sides each sample column yields (t = x, v = y). */
function candidates(G, w, h, side, guide) {
  const vertical = side === "L" || side === "R";
  const mag = vertical ? G.gx : G.gy;
  const pts = [];
  const tFrom = vertical ? guide.y + guide.h * 0.1 : guide.x + guide.w * 0.1;
  const tTo = vertical ? guide.y + guide.h * 0.9 : guide.x + guide.w * 0.9;
  const center = side === "L" ? guide.x : side === "R" ? guide.x + guide.w : side === "T" ? guide.y : guide.y + guide.h;
  const span = (vertical ? guide.w : guide.h) * (vertical ? 0.24 : 0.18);
  const lim = vertical ? w : h, tLim = vertical ? h : w;
  const vFrom = Math.max(2, Math.floor(center - span)), vTo = Math.min(lim - 3, Math.ceil(center + span));
  const steps = 64, dt = (tTo - tFrom) / steps;
  for (let s = 0; s <= steps; s++) {
    const t = Math.round(tFrom + s * dt);
    if (t < 2 || t > tLim - 3) continue;
    let rowMax = 0;
    const vals = [];
    for (let v = vFrom; v <= vTo; v++) {
      const i = vertical ? t * w + v : v * w + t;
      const m = Math.abs(mag[i]);
      vals.push(m); if (m > rowMax) rowMax = m;
    }
    const thr = Math.max(28, rowMax * 0.35);
    const peaks = [];
    for (let k = 1; k < vals.length - 1; k++) {
      if (vals[k] >= thr && vals[k] >= vals[k - 1] && vals[k] >= vals[k + 1]) {
        // sub-pixel peak (parabola through the 3 samples); +0.5 = pixel centre in continuous coords
        const a = vals[k - 1], b = vals[k], c = vals[k + 1], den = a - 2 * b + c;
        const off = den < 0 ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * den))) : 0;
        peaks.push([b, vFrom + k + off + 0.5]);
      }
    }
    peaks.sort((a, b) => b[0] - a[0]);
    for (const [, v] of peaks.slice(0, 3)) pts.push([t + 0.5, v]);
  }
  return { pts, samples: steps + 1 };
}

function ransacLine(pts, tol, tSpan) {
  if (pts.length < 6) return null;
  let best = null;
  for (let it = 0; it < 120; it++) {
    const p = pts[(Math.random() * pts.length) | 0], q = pts[(Math.random() * pts.length) | 0];
    if (Math.abs(p[0] - q[0]) < tSpan * 0.2) continue;
    const a = (q[1] - p[1]) / (q[0] - p[0]);
    if (Math.abs(a) > 0.4) continue;
    const b = p[1] - a * p[0];
    let n = 0, tMin = Infinity, tMax = -Infinity;
    const used = new Set();
    for (const r of pts) if (Math.abs(r[1] - (a * r[0] + b)) < tol && !used.has(r[0])) { used.add(r[0]); n++; if (r[0] < tMin) tMin = r[0]; if (r[0] > tMax) tMax = r[0]; }
    if ((tMax - tMin) < tSpan * 0.5) continue;
    if (!best || n > best.n) best = { a, b, n };
  }
  if (!best) return null;
  // least-squares refine on inliers
  const inl = pts.filter(r => Math.abs(r[1] - (best.a * r[0] + best.b)) < tol);
  let st = 0, sv = 0, stt = 0, stv = 0;
  for (const [t, v] of inl) { st += t; sv += v; stt += t * t; stv += t * v; }
  const k = inl.length, den = k * stt - st * st;
  if (Math.abs(den) > 1e-6) { best.a = (k * stv - st * sv) / den; best.b = (sv - best.a * st) / k; }
  best.inliers = inl;
  return best;
}

function findSide(G, w, h, side, guide) {
  const vertical = side === "L" || side === "R";
  const { pts, samples } = candidates(G, w, h, side, guide);
  const dim = vertical ? guide.w : guide.h;
  const tSpan = (vertical ? guide.h : guide.w) * 0.8;
  const tol = Math.max(1.6, dim * 0.012);
  const l1 = ransacLine(pts, tol, tSpan);
  if (!l1) return null;
  // second consistent line (e.g. the outer card edge when l1 locked onto the printed border)
  const rest = pts.filter(r => Math.abs(r[1] - (l1.a * r[0] + l1.b)) >= tol * 1.5);
  const l2 = ransacLine(rest, tol, tSpan);
  let line = l1;
  if (l2 && l2.n >= l1.n * 0.55) {
    const tm = vertical ? guide.y + guide.h / 2 : guide.x + guide.w / 2;
    const v1 = l1.a * tm + l1.b, v2 = l2.a * tm + l2.b;
    const outer = (side === "L" || side === "T") ? v2 < v1 : v2 > v1;
    if (outer && Math.abs(v2 - v1) > dim * 0.012) line = l2;
  }
  return { a: line.a, b: line.b, q: Math.min(1, line.n / samples) };
}

function intersect(vl, hl) { // vl: x = a*y + b ; hl: y = c*x + d
  const den = 1 - vl.a * hl.a;
  if (Math.abs(den) < 1e-6) return null;
  const x = (vl.a * hl.b + vl.b) / den;
  return [x, hl.a * x + hl.b];
}

function validQuad(q, guide) {
  if (!q || q.some(p => !p || !isFinite(p[0]) || !isFinite(p[1]))) return false;
  // convex, clockwise
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cr <= 0) return false;
  }
  const wAvg = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, hAvg = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  const r = wAvg / hAvg;
  if (r < 0.6 || r > 0.84) return false;
  const area = wAvg * hAvg, ga = guide.w * guide.h;
  return area > ga * 0.38 && area < ga * 1.75;
}

/* Detect the card's outer quadrilateral in an ImageData, around an expected region. */
function detectQuad(img, guide) {
  const { width: w, height: h, data } = img;
  const g = grayBlur(data, w, h);
  const G = sobel(g, w, h);
  const L = findSide(G, w, h, "L", guide), R = findSide(G, w, h, "R", guide);
  const T = findSide(G, w, h, "T", guide), B = findSide(G, w, h, "B", guide);
  if (!L || !R || !T || !B) return null;
  const quality = Math.min(L.q, R.q, T.q, B.q);
  if (quality < 0.3) return null;
  const q = [intersect(L, T), intersect(R, T), intersect(R, B), intersect(L, B)];
  if (!validQuad(q, guide)) return null;
  return { quad: q, quality };
}

/* Rectify: map quad in src canvas to a flat OUT_W × OUT_H canvas (bilinear). */
function warp(srcCanvas, quad, W = OUT_W, H = OUT_H) {
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const src = srcCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
  const Hm = homography([[0, 0], [W, 0], [W, H], [0, H]], quad);
  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const octx = out.getContext("2d");
  const od = octx.createImageData(W, H), o = od.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const X = x + 0.5, Y = y + 0.5;
      const z = Hm[6] * X + Hm[7] * Y + 1;
      let u = (Hm[0] * X + Hm[1] * Y + Hm[2]) / z - 0.5, v = (Hm[3] * X + Hm[4] * Y + Hm[5]) / z - 0.5;
      if (u < 0) u = 0; if (v < 0) v = 0; if (u > sw - 1.001) u = sw - 1.001; if (v > sh - 1.001) v = sh - 1.001;
      const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const j = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        o[j + c] = (src[i00 + c] * (1 - fx) + src[i10 + c] * fx) * (1 - fy) + (src[i01 + c] * (1 - fx) + src[i11 + c] * fx) * fy;
      }
      o[j + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}

/* Inner printed border → centering. Works on a rectified card image. */
function detectInner(card) {
  const w = 660, h = Math.round(w / CARD_RATIO);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(card, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const px = (x, y) => { x = Math.max(0, Math.min(w - 1, x | 0)); y = Math.max(0, Math.min(h - 1, y | 0)); const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const at = (side, p, k) => {
    // average 3 pixels across the scan line
    let r = 0, g = 0, b = 0;
    for (let o = -1; o <= 1; o++) {
      const q = side === "L" ? px(k, p + o) : side === "R" ? px(w - 1 - k, p + o) : side === "T" ? px(p + o, k) : px(p + o, h - 1 - k);
      r += q[0]; g += q[1]; b += q[2];
    }
    return [r / 3, g / 3, b / 3];
  };
  const cd = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const res = {};
  for (const side of ["L", "R", "T", "B"]) {
    const vertical = side === "L" || side === "R";
    const dim = vertical ? w : h, across = vertical ? h : w;
    // reference band right inside the cut edge: a few pixels, sized on card WIDTH (borders are similar in mm on all sides)
    const r0 = Math.max(2, Math.round(w * 0.008)), r1 = r0 + 3;
    const maxD = Math.round(dim * 0.2);
    const found = [];
    const N = 40;
    for (let s = 0; s < N; s++) {
      const p = Math.round(across * (0.14 + 0.72 * s / (N - 1)));
      const ref = [0, 0, 0]; const refs = [];
      for (let k = r0; k <= r1; k++) { const q = at(side, p, k); refs.push(q); ref[0] += q[0]; ref[1] += q[1]; ref[2] += q[2]; }
      ref[0] /= refs.length; ref[1] /= refs.length; ref[2] /= refs.length;
      const spread = Math.max(...refs.map(q => cd(q, ref)));
      if (spread > 30) continue;            // the band next to the edge is not a uniform border
      let prev = cd(at(side, p, r1), ref);
      for (let k = r1 + 1; k < maxD; k++) {
        const cur = cd(at(side, p, k), ref);
        if (cur > 48 && cd(at(side, p, k + 1), ref) > 48) {
          // sub-pixel crossing of the threshold between k-1 and k; +0.5 converts index to edge distance
          const f = cur > prev ? (48 - prev) / (cur - prev) : 0;
          found.push(k - 1 + Math.max(0, Math.min(1, f)) + 0.5); break;
        }
        prev = cur;
      }
    }
    found.sort((a, b) => a - b);
    if (found.length < 8) { res[side] = null; continue; }
    const med = found[found.length >> 1];
    const tol = Math.max(2, dim * 0.008);
    const agree = found.filter(v => Math.abs(v - med) <= tol).length / N;
    res[side] = { px: med / dim, conf: agree };
  }
  if (!res.L || !res.R || !res.T || !res.B) return null;
  const L = res.L.px * OUT_W, R = res.R.px * OUT_W, T = res.T.px * OUT_H, B = res.B.px * OUT_H;
  const conf = Math.min(res.L.conf, res.R.conf, res.T.conf, res.B.conf);
  const inner = [[L, T], [OUT_W - R, T], [OUT_W - R, OUT_H - B], [L, OUT_H - B]];
  const lr = L / (L + R) * 100, tb = T / (T + B) * 100;
  return { inner, reliable: conf >= 0.45, conf, lr, tb };
}

function quality(card) {
  const w = 300, h = Math.round(w / CARD_RATIO);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(card, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let glare = 0, n = 0; const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; g[y * w + x] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    if (x > w * 0.05 && x < w * 0.95 && y > h * 0.05 && y < h * 0.95) { n++; if (Math.min(d[i], d[i + 1], d[i + 2]) > 242) glare++; }
  }
  let s = 0, s2 = 0, m = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
    s += l; s2 += l * l; m++;
  }
  const varL = s2 / m - (s / m) ** 2;
  return { glare: glare / n, sharp: varL };
}

/* ---------------- UI ---------------- */
let root = null, video = null, overlay = null, stream = null, track = null, raf = 0, lastTick = 0;
let resolveOpen = null, side = "front", opts = {}, prevQuad = null, stableCount = 0, autoOn = true, lastDet = null, frozen = false, torchOn = false;
const anCanvas = document.createElement("canvas");
const anCtx = anCanvas.getContext("2d", { willReadFrequently: true });

const ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  torch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2h8l-1 6H9zM9 8l1 14h4l1-14"/><path d="M12 12v3"/></svg>',
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
};

function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }

function build() {
  root = el(`<div class="scanner" role="dialog" aria-modal="true" aria-label="Scanner carta">
    <video playsinline muted autoplay></video>
    <canvas class="sc-overlay"></canvas>
    <div class="sc-top">
      <button class="sc-round" data-sc="close" aria-label="Chiudi">${ICONS.close}</button>
      <div class="sc-side" id="sc-side">FRONTE</div>
      <button class="sc-round" data-sc="torch" aria-label="Torcia" hidden>${ICONS.torch}</button>
    </div>
    <div class="sc-bottom">
      <div class="sc-status" id="sc-status" aria-live="polite">Avvio fotocamera…</div>
      <div class="sc-controls">
        <button class="sc-pill" data-sc="auto" aria-pressed="true">${ICONS.auto}<span>Auto</span></button>
        <button class="sc-shutter" data-sc="shoot" aria-label="Scatta"><span></span></button>
        <label class="sc-pill" for="sc-gallery">Galleria</label>
      </div>
      <input type="file" accept="image/*" id="sc-gallery" class="sr">
    </div>
    <div class="sc-review" hidden>
      <div class="sc-review-inner">
        <div class="sc-review-title" id="sc-review-title">Controlla la scansione</div>
        <canvas class="sc-card" id="sc-card"></canvas>
        <div class="sc-chips" id="sc-chips"></div>
        <div class="sc-actions" id="sc-actions"></div>
      </div>
    </div>
    <div class="sc-error" hidden></div>
  </div>`);
  document.body.appendChild(root);
  video = root.querySelector("video");
  overlay = root.querySelector(".sc-overlay");
  root.addEventListener("click", onClick);
  root.querySelector("#sc-gallery").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { const img = await loadFile(f); stopLoop(); const r = await stillToResult(img); showReview(r); }
    catch (err) { status("Immagine non leggibile: prova un JPG o PNG"); }
  });
  window.addEventListener("resize", sizeOverlay);
}

function loadFile(f) {
  return new Promise((res, rej) => { const u = URL.createObjectURL(f); const i = new Image(); i.onload = () => res(i); i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("decode")); }; i.src = u; });
}
function status(t, tone) { const s = root.querySelector("#sc-status"); s.textContent = t; s.dataset.tone = tone || ""; }

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("nocam"), { name: "NotSupported" });
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1920 } } });
  video.srcObject = stream;
  await video.play().catch(() => {});
  track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  try { if (caps.focusMode?.includes("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch (e) {}
  root.querySelector('[data-sc="torch"]').hidden = !caps.torch;
  await new Promise(r => { if (video.videoWidth) r(); else video.onloadedmetadata = () => r(); });
  sizeOverlay();
}
function stopCamera() {
  stopLoop();
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; track = null; torchOn = false;
}
function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

function sizeOverlay() {
  if (!root || !overlay) return;
  const r = root.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  overlay.width = Math.round(r.width * dpr); overlay.height = Math.round(r.height * dpr);
  overlay.style.width = r.width + "px"; overlay.style.height = r.height + "px";
}
// display <-> video mapping (object-fit: cover)
function mapping() {
  const r = root.getBoundingClientRect(), vw = video.videoWidth, vh = video.videoHeight;
  const s = Math.max(r.width / vw, r.height / vh);
  return { s, ox: (r.width - vw * s) / 2, oy: (r.height - vh * s) / 2, W: r.width, H: r.height, vw, vh };
}
function guideDisplay(m) {
  let gw = m.W * 0.8, gh = gw / CARD_RATIO;
  const maxH = m.H * 0.62; if (gh > maxH) { gh = maxH; gw = gh * CARD_RATIO; }
  return { x: (m.W - gw) / 2, y: (m.H - gh) / 2 - m.H * 0.03, w: gw, h: gh };
}
const toVideo = (m, g) => ({ x: (g.x - m.ox) / m.s, y: (g.y - m.oy) / m.s, w: g.w / m.s, h: g.h / m.s });

function drawOverlay(m, gd, quadVideo, state) {
  const ctx = overlay.getContext("2d"), dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, m.W, m.H);
  // dim outside the guide
  ctx.fillStyle = "rgba(15,35,18,.5)";
  ctx.beginPath(); ctx.rect(0, 0, m.W, m.H); ctx.roundRect(gd.x, gd.y, gd.w, gd.h, 14); ctx.fill("evenodd");
  ctx.lineWidth = 3; ctx.setLineDash(state === "found" ? [] : [10, 8]);
  ctx.strokeStyle = state === "found" ? "#ffd23f" : "rgba(255,255,255,.85)";
  ctx.beginPath(); ctx.roundRect(gd.x, gd.y, gd.w, gd.h, 14); ctx.stroke(); ctx.setLineDash([]);
  if (quadVideo) {
    const P = p => [m.ox + p[0] * m.s, m.oy + p[1] * m.s];
    ctx.beginPath(); quadVideo.forEach((p, i) => { const [x, y] = P(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
    ctx.fillStyle = "rgba(255,210,63,.22)"; ctx.fill(); ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 3; ctx.stroke();
    quadVideo.forEach(p => { const [x, y] = P(p); ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); });
    if (state === "found" && autoOn) {
      const f = Math.min(1, stableCount / STABLE_FRAMES);
      ctx.beginPath(); ctx.arc(m.W / 2, gd.y + gd.h + 34, 16, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 4; ctx.stroke();
    }
  }
}

function loop(ts) {
  raf = requestAnimationFrame(loop);
  if (frozen || !video.videoWidth || ts - lastTick < 100) return;
  lastTick = ts;
  const m = mapping(), gd = guideDisplay(m), gv = toVideo(m, gd);
  const sc = ANALYSIS_MAX / Math.max(m.vw, m.vh);
  const aw = Math.round(m.vw * sc), ah = Math.round(m.vh * sc);
  if (anCanvas.width !== aw) { anCanvas.width = aw; anCanvas.height = ah; }
  anCtx.drawImage(video, 0, 0, aw, ah);
  const gA = { x: gv.x * sc, y: gv.y * sc, w: gv.w * sc, h: gv.h * sc };
  const det = detectQuad(anCtx.getImageData(0, 0, aw, ah), gA);
  if (det) {
    const qv = det.quad.map(p => [p[0] / sc, p[1] / sc]);
    if (prevQuad) {
      const mv = qv.reduce((a, p, i) => a + dist(p, prevQuad[i]), 0) / 4 / gv.w;
      stableCount = mv < 0.018 ? stableCount + 1 : 0;
    } else stableCount = 0;
    prevQuad = qv; lastDet = { quad: qv, t: ts };
    drawOverlay(m, gd, qv, "found");
    if (autoOn) status(stableCount >= 2 ? "Carta rilevata · tieni fermo il telefono" : "Carta rilevata", "ok");
    else status("Carta rilevata · premi il pulsante per scattare", "ok");
    if (autoOn && stableCount >= STABLE_FRAMES) capture();
  } else {
    if (lastDet && ts - lastDet.t < 400) { drawOverlay(m, gd, lastDet.quad, "found"); return; }
    prevQuad = null; stableCount = 0; lastDet = null;
    drawOverlay(m, gd, null, "search");
    status("Inquadra la carta nel riquadro, su un fondo uniforme");
  }
}

async function capture() {
  if (frozen) return;
  frozen = true;
  try { navigator.vibrate?.(30); } catch (e) {}
  const m = mapping();
  const full = document.createElement("canvas"); full.width = m.vw; full.height = m.vh;
  full.getContext("2d").drawImage(video, 0, 0);
  let quad = lastDet?.quad, detected = !!quad;
  if (!quad) { const g = toVideo(m, guideDisplay(m)); quad = [[g.x, g.y], [g.x + g.w, g.y], [g.x + g.w, g.y + g.h], [g.x, g.y + g.h]]; }
  status("Elaboro la scansione…");
  await new Promise(r => setTimeout(r, 30));
  const card = warp(full, quad);
  showReview(analyzeCard(card, detected, null));
}

function analyzeCard(card, detected, original) {
  const inner = detectInner(card);
  const q = quality(card);
  return { card, detected, original, inner, q };
}

/* Still photo (gallery): try to find the card anywhere near the middle. */
async function stillToResult(img) {
  const sc = ANALYSIS_MAX / Math.max(img.naturalWidth, img.naturalHeight);
  const aw = Math.round(img.naturalWidth * sc), ah = Math.round(img.naturalHeight * sc);
  const c = document.createElement("canvas"); c.width = aw; c.height = ah;
  const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(img, 0, 0, aw, ah);
  const id = ctx.getImageData(0, 0, aw, ah);
  let best = null;
  for (const f of [0.9, 0.75, 0.6]) {
    let gw = aw * f, gh = gw / CARD_RATIO; if (gh > ah * f) { gh = ah * f; gw = gh * CARD_RATIO; }
    const det = detectQuad(id, { x: (aw - gw) / 2, y: (ah - gh) / 2, w: gw, h: gh });
    if (det && (!best || det.quality > best.quality)) best = det;
  }
  const full = document.createElement("canvas"); full.width = img.naturalWidth; full.height = img.naturalHeight;
  full.getContext("2d").drawImage(img, 0, 0);
  if (!best) return { card: null, detected: false, original: full, inner: null, q: null };
  const quad = best.quad.map(p => [p[0] / sc, p[1] / sc]);
  return analyzeCard(warp(full, quad), true, full);
}

const ratio = v => `${Math.round(Math.max(v, 100 - v))}/${Math.round(Math.min(v, 100 - v))}`;
let pending = null;
function showReview(r) {
  pending = r;
  const rv = root.querySelector(".sc-review"); rv.hidden = false;
  const cv = root.querySelector("#sc-card");
  const src = r.card || r.original;
  cv.width = src.width; cv.height = src.height; cv.getContext("2d").drawImage(src, 0, 0);
  if (r.card && r.inner) {
    const x = cv.getContext("2d"); x.strokeStyle = r.inner.reliable ? "#2fae5c" : "#ff8a3d"; x.lineWidth = Math.max(3, cv.width / 260); x.setLineDash([12, 8]);
    x.beginPath(); r.inner.inner.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.stroke();
  }
  const chips = [];
  if (r.card) chips.push(r.detected ? `<span class="sc-chip ok">Bordi rilevati e raddrizzati</span>` : `<span class="sc-chip warn">Bordi non trovati: ritagliata sul riquadro</span>`);
  else chips.push(`<span class="sc-chip warn">Carta non trovata nella foto: userò la foto intera</span>`);
  if (r.inner) chips.push(r.inner.reliable ? `<span class="sc-chip ok">Centratura ${ratio(r.inner.lr)} · ${ratio(r.inner.tb)}</span>` : `<span class="sc-chip warn">Centratura incerta: controllala nello strumento</span>`);
  else if (r.card) chips.push(`<span class="sc-chip warn">Bordo stampato non riconosciuto (es. full art)</span>`);
  if (r.q && r.q.glare > 0.015) chips.push(`<span class="sc-chip warn">Riflesso sulla carta: inclina un po' il telefono</span>`);
  if (r.q && r.q.sharp < 25) chips.push(`<span class="sc-chip warn">Foto poco nitida</span>`);
  root.querySelector("#sc-chips").innerHTML = chips.join("");
  root.querySelector("#sc-review-title").textContent = side === "front" ? "Fronte: controlla la scansione" : "Retro: controlla la scansione";
  const acts = [];
  acts.push(`<button class="btn" data-sc="retry">Riprova</button>`);
  if (r.card && r.original) acts.push(`<button class="btn" data-sc="use-orig">Usa foto intera</button>`);
  if (side === "front" && opts.offerBack) {
    acts.push(`<button class="btn" data-sc="use">Usa solo fronte</button>`);
    acts.push(`<button class="btn primary" data-sc="use-next">Usa e scansiona il retro</button>`);
  } else acts.push(`<button class="btn primary" data-sc="use">Usa questa scansione</button>`);
  root.querySelector("#sc-actions").innerHTML = acts.join("");
}

function hideReview() { root.querySelector(".sc-review").hidden = true; pending = null; frozen = false; prevQuad = null; stableCount = 0; lastDet = null; }

async function toResult(r, useOriginal) {
  const src = useOriginal || !r.card ? r.original : r.card;
  const blob = await new Promise(res => src.toBlob(res, "image/jpeg", 0.92));
  return { blob, cropped: !!(r.card && !useOriginal), inner: !useOriginal && r.inner ? r.inner.inner : null, innerReliable: !!(r.inner && r.inner.reliable), glare: r.q?.glare ?? 0 };
}

async function onClick(e) {
  const b = e.target.closest("[data-sc]"); if (!b) return;
  const a = b.dataset.sc;
  if (a === "close") finish(null);
  else if (a === "shoot") { if (stream) capture(); }
  else if (a === "auto") { autoOn = !autoOn; b.setAttribute("aria-pressed", autoOn); stableCount = 0; }
  else if (a === "torch") { try { torchOn = !torchOn; await track.applyConstraints({ advanced: [{ torch: torchOn }] }); b.classList.toggle("on", torchOn); } catch (err) { torchOn = false; } }
  else if (a === "retry") { if (!stream) { finish({ retry: true }); return; } hideReview(); if (!raf) raf = requestAnimationFrame(loop); }
  else if (a === "use" || a === "use-next" || a === "use-orig") {
    const res = await toResult(pending, a === "use-orig");
    finish({ ...res, next: a === "use-next" });
  }
}

function finish(val) {
  stopCamera();
  if (root) root.hidden = true;
  const r = resolveOpen; resolveOpen = null; frozen = false;
  document.documentElement.classList.remove("sc-open");
  r?.(val);
}

function showError(err) {
  const box = root.querySelector(".sc-error"); box.hidden = false;
  const insecure = !window.isSecureContext;
  const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
  const none = err?.name === "NotFoundError" || err?.name === "OverconstrainedError";
  box.innerHTML = `<div class="sc-review-inner">
    <div class="sc-review-title">Fotocamera non disponibile</div>
    <p>${insecure ? "La fotocamera funziona solo se l'app è aperta da un indirizzo https (es. GitHub Pages)."
      : denied ? "Hai negato l'accesso alla fotocamera. Su iPhone: Impostazioni › Safari › Fotocamera › Consenti. Su Android: tocca il lucchetto accanto all'indirizzo › Autorizzazioni › Fotocamera. Poi ricarica la pagina."
      : none ? "Non trovo una fotocamera su questo dispositivo."
      : "Questo browser non permette di usare la fotocamera dal vivo."}</p>
    <p class="muted">Puoi comunque fotografare la carta con l'app Fotocamera e caricarla: la ritaglio e la raddrizzo io.</p>
    <div class="sc-actions">
      <label class="btn primary" for="sc-gallery">Scegli dalla galleria</label>
      <button class="btn" data-sc="close">Chiudi</button>
    </div></div>`;
}

function open(s, o = {}) {
  if (!root) build();
  side = s; opts = o; frozen = false; prevQuad = null; stableCount = 0; lastDet = null;
  root.hidden = false; root.querySelector(".sc-review").hidden = true; root.querySelector(".sc-error").hidden = true;
  root.querySelector("#sc-side").textContent = s === "front" ? "FRONTE" : "RETRO";
  document.documentElement.classList.add("sc-open");
  status("Avvio fotocamera…");
  return new Promise(async res => {
    resolveOpen = res;
    try { await startCamera(); raf = requestAnimationFrame(loop); }
    catch (err) { showError(err); }
  });
}

/* Process a still image picked outside the scanner: returns the same result shape, after review. */
async function processStill(file, s, o = {}) {
  if (!root) build();
  side = s; opts = o;
  const img = await loadFile(file);
  root.hidden = false; root.querySelector(".sc-error").hidden = true;
  document.documentElement.classList.add("sc-open");
  status("");
  return new Promise(async res => {
    resolveOpen = res;
    const r = await stillToResult(img);
    showReview(r);
  });
}

window.GMLScanner = { open, processStill, _test: { detectQuad, warp, detectInner, quality, homography } };
})();
