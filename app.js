
(() => {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt$ = n => "$" + (Number(n)||0).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const fmt$0 = n => "$" + Math.round(Number(n)||0).toLocaleString("en-US");
const half = n => Math.round(Number(n) * 2) / 2;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const uid = p => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const GAMES = ["Pokémon", "One Piece", "Magic: The Gathering", "Yu-Gi-Oh!", "Disney Lorcana"];
const FEE = 25;
const HIST_MAX = 10, SAVED_MAX = 100;

const ICON = {
  edges: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="1"/></svg>',
  corners: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  surface: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12l8-8M4 20L20 4M12 20l8-8"/></svg>',
  centering: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/><circle cx="12" cy="12" r="2.5"/></svg>',
  spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 15l1 2.5 2.5 1-2.5 1L19 22l-1-2.5-2.5-1 2.5-1z"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M11 8v6M8 11h6"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M4 20l4-1 11-11-3-3L5 16z"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

const TYPE_COL = {
  fire:["#ffb35c","#e2461f"], water:["#8fd0ff","#2272d6"], grass:["#bfe58f","#3e9b3a"], electric:["#ffe680","#e3b10b"],
  psychic:["#e4b6ff","#9a44d6"], fighting:["#f0c08a","#a85a2a"], dark:["#8d8aa8","#2d2a44"], steel:["#dde2ea","#8892a3"],
  dragon:["#e7d48a","#7a6a1e"], fairy:["#ffc6e4","#df5b9e"], normal:["#efe9dc","#a39a83"], colorless:["#efe9dc","#a39a83"]
};

/* ---------------- state ---------------- */
const state = {
  view: "grade",
  front: null, back: null, frontURL: "", backURL: "",
  busy: false, ctl: null, aiError: "",
  result: null,
  items: new Map(),
  slabTab: "history", pTab: "pf", mTab: "worth", range: "1M",
  confirmDel: null, confirmHold: null, editPrice: null,
  worth: null, flip: null, worthBusy: false, flipBusy: false, worthErr: "", flipErr: "",
  searchRes: [], searchBusy: false, searchErr: "", refreshBusy: false,
};

/* ---------------- storage ---------------- */
/* ---------------- storage: IndexedDB on this device ---------------- */
const IDB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("gem-mint-lab", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("items");
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(mode) { return this.db.transaction("items", mode).objectStore("items"); },
  all() {
    return new Promise((res, rej) => {
      const out = new Map(); const st = this.tx("readonly"); const c = st.openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out.set(cur.key, cur.value); cur.continue(); } else res(out); };
      c.onerror = () => rej(c.error);
    });
  },
  put(k, v) { return new Promise((res, rej) => { const r = this.tx("readwrite").put(v, k); r.onsuccess = res; r.onerror = () => rej(r.error); }); },
  del(k) { return new Promise((res, rej) => { const r = this.tx("readwrite").delete(k); r.onsuccess = res; r.onerror = () => rej(r.error); }); },
  clear() { return new Promise((res, rej) => { const r = this.tx("readwrite").clear(); r.onsuccess = res; r.onerror = () => rej(r.error); }); },
};
const Store = {
  mode: "init", ready: false, err: "",
  async init() {
    try {
      await IDB.open();
      state.items = await IDB.all();
      this.mode = "idb";
      try { navigator.storage?.persist?.(); } catch (e) {}
    } catch (e) {
      this.mode = "memory"; this.err = "noidb";
    }
    this.ready = true; renderAll();
  },
  put(id, obj) {
    state.items.set(id, obj);
    if (this.mode === "idb") IDB.put(id, obj).catch(() => toast("Memoria del telefono piena: elimina qualche slab"));
  },
  del(id) {
    state.items.delete(id);
    if (this.mode === "idb") IDB.del(id).catch(() => {});
  },
  all(kind) { return [...state.items.entries()].filter(([, v]) => v && v.kind === kind).map(([id, v]) => ({ id, ...v })); },
  get(id) { return state.items.get(id); }
};

/* ---------------- AI: Claude API with the user's own key ---------------- */
const SETTINGS_KEY = "gml-settings-v1";
const SET_DEFAULTS = { provider: "gemini", model: "claude-sonnet-5-5", gmodel: "gemini-flash-latest", key: "", gkey: "" };
function loadSettings() {
  try {
    const s = { ...SET_DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
    if (!localStorage.getItem(SETTINGS_KEY + "-p") && s.key && !s.gkey) s.provider = "claude"; // older installs with a Claude key
    return s;
  } catch (e) { return { ...SET_DEFAULTS }; }
}
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); localStorage.setItem(SETTINGS_KEY + "-p", "1"); } catch (e) {} }
const activeKey = () => settings.provider === "gemini" ? settings.gkey : settings.key;
const providerName = () => settings.provider === "gemini" ? "Gemini" : "Claude";
const settings = loadSettings();
const MODELS = { quick: "claude-haiku-5-5", complex: "claude-opus-5-5" };
const NO_KEY = "Per usare l'AI aggiungi una chiave API in Impostazioni (ingranaggio in alto): Gemini è gratis, Claude è a pagamento. Scansione, centratura e valutazione manuale funzionano anche senza.";
const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
function parseJSONLoose(t) {
  t = String(t || "").trim();
  try { return JSON.parse(t); } catch (e) {}
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) { try { return JSON.parse(f[1]); } catch (e) {} }
  const a = Math.min(...["{", "["].map(c => { const i = t.indexOf(c); return i < 0 ? Infinity : i; }));
  const b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (a < b) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  throw Object.assign(new Error("invalid_json"), { code: "invalid_json", text: t });
}
async function geminiCall(prompt, opts = {}) {
  if (!settings.gkey) throw Object.assign(new Error("no_key"), { code: "no_key" });
  const model = (opts.modelOverride || geminiWorking || settings.gmodel || "gemini-flash-latest").trim();
  const parts = [];
  const imgs = opts.images ? [].concat(opts.images) : [];
  for (const im of imgs) parts.push({ inline_data: { mime_type: im.type && /^image\/(jpeg|png|webp|heic|heif)$/.test(im.type) ? im.type : "image/jpeg", data: await blobToB64(im) } });
  parts.push({ text: prompt });
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", signal: opts.signal,
      headers: { "content-type": "application/json", "x-goog-api-key": settings.gkey },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { maxOutputTokens: opts.maxTokens ? Math.max(opts.maxTokens, 64) : 8192, temperature: 0.2, ...(opts.json ? { responseMimeType: "application/json" } : {}) } })
    });
  } catch (e) {
    if (e?.name === "AbortError") throw Object.assign(new Error("cancelled"), { code: "cancelled" });
    throw Object.assign(new Error("network"), { code: "network" });
  }
  let body = null; try { body = await res.json(); } catch (e) {}
  if (!res.ok) {
    const msg = body?.error?.message || "", st = body?.error?.status || "";
    const det = body?.error?.details || [];
    const rd = det.find(d => /RetryInfo/.test(d["@type"] || ""))?.retryDelay;
    const retryMs = rd ? Math.ceil(parseFloat(rd) * 1000) : 0;
    const perDay = JSON.stringify(det).match(/PerDay/i);
    const quota = res.status === 429 || st === "RESOURCE_EXHAUSTED";
    const code = /API_KEY_INVALID|API key not valid/i.test(msg) || res.status === 401 ? "bad_key"
      : quota ? (!perDay && (!retryMs || retryMs <= 35000) ? "g_quota_rpm" : "g_quota")
      : res.status === 404 ? "model" : res.status === 403 ? "forbidden"
      : (res.status === 503 || res.status === 500) ? "overloaded"
      : /location is not supported|region/i.test(msg) ? "g_region" : "http_" + res.status;
    throw Object.assign(new Error(code), { code, detail: msg.slice(0, 160), retryMs, model });
  }
  const cand = body?.candidates?.[0];
  const text = (cand?.content?.parts || []).map(p => p.text || "").join("");
  if (!text) {
    const why = cand?.finishReason || body?.promptFeedback?.blockReason || "";
    throw Object.assign(new Error("empty"), { code: /SAFETY|BLOCK|PROHIBITED/i.test(why) ? "g_blocked" : "empty", detail: why });
  }
  return text;
}
/* Retries + Gemini model fallback. Free Gemini models are often busy (503) or hit
 * a per-minute quota (429): wait and retry, then try other Flash models the key can use. */
let geminiWorking = "", geminiList = null;
const RETRY_CODES = ["overloaded", "network", "g_quota_rpm", "rate_limited", "empty"];
const FALLBACK_CODES = ["overloaded", "model", "g_quota", "g_quota_rpm", "empty"];
function sleep(ms, signal) {
  return new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(new Error("cancelled"), { code: "cancelled" })); }, { once: true });
  });
}
async function geminiAlternates(exclude) {
  if (!geminiList) {
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": settings.gkey } });
      const j = await r.json();
      geminiList = (j.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map(m => String(m.name || "").replace(/^models\//, ""))
        .filter(n => /gemini/i.test(n) && /flash/i.test(n) && !/image|tts|live|embed|audio|native|robot|computer|exp|preview/i.test(n));
      const ver = n => parseFloat((n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]);
      geminiList.sort((a, b) => (/latest/.test(b) - /latest/.test(a)) || (ver(b) - ver(a)) || (/lite/.test(a) - /lite/.test(b)));
    } catch (e) { geminiList = []; }
    if (!geminiList.length) geminiList = ["gemini-flash-latest", "gemini-flash-lite-latest"];
  }
  return geminiList.filter(n => !exclude.includes(n));
}
async function aiCall(prompt, opts = {}) {
  const gem = settings.provider === "gemini";
  const tried = [];
  let model = gem ? (geminiWorking || settings.gmodel || "gemini-flash-latest") : null;
  let lastErr = null;
  for (let round = 0; round < 4; round++) {
    const waits = [2000, 5000];
    for (let a = 0; a <= waits.length; a++) {
      try {
        const t = gem ? await geminiCall(prompt, { ...opts, modelOverride: model }) : await claudeCall(prompt, opts);
        if (gem && model !== (settings.gmodel || "gemini-flash-latest")) { if (geminiWorking !== model) toast(`Uso ${model}: l'altro modello era occupato`); geminiWorking = model; }
        return t;
      } catch (e) {
        lastErr = e;
        if (e.code === "cancelled" || !RETRY_CODES.includes(e.code) || a === waits.length) break;
        if (e.code === "g_quota_rpm" && (e.retryMs || 0) > 20000) break;   // long wait: switch model instead
        toast(`${providerName()} occupato, riprovo (${a + 1}/${waits.length})…`);
        await sleep(Math.max(waits[a], Math.min(e.retryMs || 0, 20000)), opts.signal);
      }
    }
    if (!gem || !FALLBACK_CODES.includes(lastErr?.code)) break;
    tried.push(model);
    const alt = await geminiAlternates(tried);
    if (!alt.length) break;
    model = alt[0];
    toast(`Provo un altro modello: ${model}`);
  }
  if (gem && tried.length > 1 && lastErr) lastErr.triedAll = true;
  throw lastErr;
}
async function claudeCall(prompt, opts = {}) {
  if (!settings.key) throw Object.assign(new Error("no_key"), { code: "no_key" });
  const model = opts.modelTier === "complex" ? MODELS.complex : opts.modelTier === "quick" ? MODELS.quick : (settings.model || "claude-sonnet-5-5");
  const content = [];
  const imgs = opts.images ? [].concat(opts.images) : [];
  for (const im of imgs) content.push({ type: "image", source: { type: "base64", media_type: im.type && /^image\/(jpeg|png|gif|webp)$/.test(im.type) ? im.type : "image/jpeg", data: await blobToB64(im) } });
  content.push({ type: "text", text: prompt });
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: opts.signal,
      headers: { "content-type": "application/json", "x-api-key": settings.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model, max_tokens: opts.maxTokens || 4096, messages: [{ role: "user", content }] })
    });
  } catch (e) {
    if (e?.name === "AbortError") throw Object.assign(new Error("cancelled"), { code: "cancelled" });
    throw Object.assign(new Error("network"), { code: "network" });
  }
  let body = null; try { body = await res.json(); } catch (e) {}
  if (!res.ok) {
    const msg = body?.error?.message || "";
    const code = res.status === 401 ? "bad_key" : res.status === 403 ? "forbidden" : res.status === 429 ? "rate_limited"
      : (res.status === 529 || res.status === 503) ? "overloaded" : /credit|billing|balance/i.test(msg) ? "billing"
      : res.status === 404 ? "model" : "http_" + res.status;
    throw Object.assign(new Error(code), { code, detail: msg });
  }
  return (body?.content || []).filter(c => c.type === "text").map(c => c.text).join("");
}
const AI = { json: async (p, o = {}) => parseJSONLoose(await aiCall(p + "\n\nRispondi solo con il JSON richiesto, senza testo prima o dopo.", { ...o, json: true })) };
async function getAI() { return activeKey() ? { s: AI, images: true } : null; }
function aiErr(e) {
  switch (e?.code) {
    case "no_key": return NO_KEY;
    case "bad_key": return "La chiave API non è valida. Controllala in Impostazioni.";
    case "forbidden": return "La chiave API non ha i permessi per questa richiesta.";
    case "billing": return "Credito API esaurito: ricarica su console.anthropic.com › Billing.";
    case "rate_limited": return "Troppe richieste in poco tempo. Aspetta un minuto e riprova.";
    case "g_quota_rpm": return "Hai fatto troppe richieste a Gemini in un minuto (limite gratuito). Aspetta 1 minuto e riprova.";
    case "g_quota": return `Hai finito le richieste gratuite di oggi${e.triedAll ? " su tutti i modelli Gemini disponibili" : ""}. Si azzerano ogni giorno; intanto puoi passare a Claude in Impostazioni.`;
    case "g_region": return "Gemini non è disponibile nel tuo paese con questa chiave.";
    case "g_blocked": return "Gemini ha bloccato la risposta per i suoi filtri. Riprova con un'altra foto.";
    case "empty": return "L'AI non ha restituito una risposta. Riprova.";
    case "overloaded": return `I server di ${providerName()} sono pieni in questo momento${e.triedAll ? ": ho riprovato più volte e con altri modelli" : ""}. Riprova tra qualche minuto${settings.provider === "gemini" ? ", oppure passa a Claude in Impostazioni" : ""}.`;
    case "model": return "Modello non trovato o non disponibile per la tua chiave. Controlla il nome del modello in Impostazioni.";
    case "network": return "Nessuna connessione a internet, oppure la richiesta è stata bloccata.";
    case "invalid_json": return "La risposta dell'AI non era leggibile. Premi di nuovo per riprovare.";
    case "cancelled": return "Operazione annullata.";
    default: return "Richiesta non riuscita" + (e?.code ? " (" + e.code + (e.detail ? ": " + e.detail : "") + ")" : "") + ". Riprova.";
  }
}

/* ---------------- images ---------------- */
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("decode")); i.src = src; }); }
async function resizeTo(img, max, q = 0.82, type = "image/jpeg") {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, type, q));
  return { blob, dataURL: c.toDataURL(type, q), w: c.width, h: c.height };
}
async function pickImage(file, side) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const big = await resizeTo(img, 1800, 0.9);
    const thumb = await resizeTo(img, side === "front" ? 440 : 300, 0.78);
    state[side] = { blob: big.blob, thumb: thumb.dataURL, img, url };
    state[side + "URL"] = url;
    if (side === "front" && !cent.img) setCentImage(img, "front");
    renderGrade();
  } catch (e) {
    URL.revokeObjectURL(url);
    toast("Formato immagine non supportato: scatta in JPG o PNG");
  }
}


/* ---------------- scanner intake ---------------- */
async function useScan(res, side) {
  if (!res || !res.blob) return false;
  await pickImage(res.blob, side);
  if (res.cropped && res.inner && state[side]) {
    const img = state[side].img, sx = img.naturalWidth / 1100, sy = img.naturalHeight / 1536;
    cent.side = side; cent.img = img;
    cent.outer = [[0, 0], [img.naturalWidth, 0], [img.naturalWidth, img.naturalHeight], [0, img.naturalHeight]];
    cent.inner = res.inner.map(p => [p[0] * sx, p[1] * sy]);
    cent.mode = "inner";
    analyzeCentering();
    const cs = combinedCentScore();
    if (cs != null) { $("#m-centering").value = cs; $("#m-centering-v").textContent = f1(cs); }
    if (!res.innerReliable) toast("Centratura automatica incerta: controllala in Centratura");
  }
  return true;
}
async function startScan(side, offerBack) {
  if (!window.GMLScanner) { $("#cam-" + side).click(); return; }
  const res = await window.GMLScanner.open(side, { offerBack });
  if (!res) return;
  await useScan(res, side);
  if (res.next) startScan("back", false);
}
async function intakeFile(file, side) {
  if (!window.GMLScanner) { pickImage(file, side); return; }
  try {
    const res = await window.GMLScanner.processStill(file, side, {});
    if (!res) return;
    if (res.retry) { $("#in-" + side).click(); return; }
    await useScan(res, side);
  } catch (e) { pickImage(file, side); }
}

/* ---------------- grading math ---------------- */
function finalScore(s) {
  const v = [s.centering, s.corners, s.edges, s.surface].map(Number);
  const avg = v.reduce((a, b) => a + b, 0) / 4;
  const f = Math.min(avg, Math.min(...v) + 1);
  return clamp(Math.floor(f * 2 + 1e-9) / 2, 1, 10);
}
function gradeLabel(g) {
  if (g >= 10) return "GEM MINT"; if (g >= 9.5) return "GEM MT"; if (g >= 9) return "MINT"; if (g >= 8.5) return "NM-MT+";
  if (g >= 8) return "NM-MT"; if (g >= 7.5) return "NM+"; if (g >= 7) return "NM"; if (g >= 6) return "EX-MT"; if (g >= 5) return "EX";
  if (g >= 4) return "VG-EX"; if (g >= 3) return "VG"; if (g >= 2) return "GOOD"; return "POOR";
}
const f1 = n => (Number(n) || 0).toFixed(1);

/* ---------------- grading standards (PSA · BGS · CGC) ---------------- */
// Centering values are the share of the LARGER border, 50–100 (55 = 55/45).
const normW = v => { v = Number(v); if (!(v > 0)) return null; if (v < 50) v = 100 - v; return clamp(v, 50, 100); };
const ratioTxt = w => w == null ? "–" : `${Math.round(w)}/${100 - Math.round(w)}`;
// Beckett: front both ways, back worst side
function bgsCentFront(a, b) {
  const hi = Math.max(a, b), lo = Math.min(a, b);
  if (hi <= 51) return 10; if (lo <= 51 && hi <= 55) return 9.5; if (hi <= 55) return 9; if (hi <= 60) return 8.5;
  if (hi <= 65) return 8; if (hi <= 75) return 7; if (hi <= 85) return 6; if (hi <= 90) return 5; return 4;
}
function bgsCentBack(w) { if (w <= 60) return 10; if (w <= 70) return 9; if (w <= 80) return 8.5; if (w <= 90) return 8; if (w <= 95) return 7; return 6; }
// PSA: max grade allowed by centering
function psaCentFront(w) { if (w <= 55) return 10; if (w <= 60) return 9; if (w <= 65) return 8; if (w <= 70) return 7; if (w <= 80) return 6; if (w <= 85) return 5; if (w <= 90) return 3; return 2; }
function psaCentBack(w) { if (w <= 75) return 10; if (w <= 90) return 9; return 4; }
// CGC: max grade allowed by centering
function cgcCentFront(w) { if (w <= 55) return 10; if (w <= 57.5) return 9.5; if (w <= 60) return 9; if (w <= 65) return 8; if (w <= 70) return 7; if (w <= 75) return 6; if (w <= 85) return 4.5; if (w <= 90) return 3.5; return 2; }
function cgcCentBack(w) { if (w <= 75) return 10; if (w <= 90) return 9; return 8; }
function centeringFromRatios(c) {
  if (!c || c.fLR == null || c.fTB == null) return null;
  const f = bgsCentFront(c.fLR, c.fTB);
  const b = c.bLR != null && c.bTB != null ? bgsCentBack(Math.max(c.bLR, c.bTB)) : 10;
  return Math.min(f, b);
}
const PSA_NAMES = { 10: "GEM MT", 9: "MINT", 8: "NM-MT", 7: "NM", 6: "EX-MT", 5: "EX", 4: "VG-EX", 3: "VG", 2: "GOOD", 1: "PR" };
const CGC_NAMES = { 10: "GEM MINT", 9.5: "MINT+", 9: "MINT", 8.5: "NM/MINT+", 8: "NM/MINT", 7.5: "NM+", 7: "NM", 6.5: "EX/NM+", 6: "EX/NM", 5.5: "EX+", 5: "EX", 4.5: "VG/EX+", 4: "VG/EX", 3.5: "VG+", 3: "VG", 2.5: "GOOD+", 2: "GOOD", 1.5: "FAIR", 1: "POOR" };
function bgsName(g) { if (g >= 10) return "PRISTINE"; if (g >= 9.5) return "GEM MINT"; if (g >= 9) return "MINT"; if (g >= 8.5) return "NM-MT+"; if (g >= 8) return "NM-MT"; if (g >= 7.5) return "NM+"; if (g >= 7) return "NM"; if (g >= 6.5) return "EX-MT+"; if (g >= 6) return "EX-MT"; if (g >= 5) return "EX"; if (g >= 4) return "VG-EX"; if (g >= 3) return "VG"; if (g >= 2) return "GOOD"; return "POOR"; }
function companyGrades(s) {
  const v = [s.centering, s.corners, s.edges, s.surface].map(Number);
  const overall = finalScore(s); const c = s.cent || null;
  const fW = c && c.fLR != null ? Math.max(c.fLR, c.fTB ?? c.fLR) : null;
  const bW = c && c.bLR != null ? Math.max(c.bLR, c.bTB ?? c.bLR) : null;
  const low = Math.min(...v); const lowName = ["centratura", "angoli", "bordi", "superficie"][v.indexOf(low)];
  // BGS
  const n10 = v.filter(x => x >= 10).length;
  let bgs = overall, bgsL = bgsName(overall), bgsWhy = `subgrado più basso: ${lowName} ${f1(low)}`;
  if (n10 === 4) { bgs = 10; bgsL = "BLACK LABEL"; bgsWhy = "tutti e 4 i subgradi a 10"; }
  else if (n10 >= 3 && low >= 9.5) { bgs = 10; bgsL = "PRISTINE"; bgsWhy = "tre 10 e un 9.5"; }
  // PSA
  let psa = overall >= 9.5 ? 10 : Math.max(1, Math.floor(overall + 1e-9)), psaWhy = overall >= 9.5 ? "condizioni da Gem Mint" : `condizioni da ${psa}`;
  if (fW != null) { const cap = psaCentFront(fW); if (cap < psa) { psa = cap; psaWhy = `centratura fronte ${ratioTxt(fW)} (max ${cap})`; } }
  if (bW != null) { const cap = psaCentBack(bW); if (cap < psa) { psa = cap; psaWhy = `centratura retro ${ratioTxt(bW)} (max ${cap})`; } }
  // CGC
  let cgc = overall >= 9.5 ? 10 : overall, cgcL, cgcWhy = overall >= 9.5 ? "condizioni da Gem Mint" : `subgrado più basso: ${lowName} ${f1(low)}`;
  if (fW != null) { const cap = cgcCentFront(fW); if (cap < cgc) { cgc = cap; cgcWhy = `centratura fronte ${ratioTxt(fW)} (max ${cap})`; } }
  if (bW != null) { const cap = cgcCentBack(bW); if (cap < cgc) { cgc = cap; cgcWhy = `centratura retro ${ratioTxt(bW)} (max ${cap})`; } }
  cgcL = (n10 === 4 && fW != null && fW <= 51 && cgc === 10) ? "PRISTINE" : (CGC_NAMES[cgc] || "");
  if (cgcL === "PRISTINE") cgcWhy = "perfetta, centratura 50/50";
  return { psa: { g: psa, l: PSA_NAMES[psa] || "", why: psaWhy }, bgs: { g: bgs, l: bgsL, why: bgsWhy }, cgc: { g: cgc, l: cgcL, why: cgcWhy } };
}
function companyHTML(s) {
  const G = companyGrades(s);
  const card = (k, n) => `<div class="house"><span>${n}</span><b>${k === "psa" ? G[k].g : f1(G[k].g)}</b><em>${esc(G[k].l)}</em><small>${esc(G[k].why)}</small></div>`;
  return `<div><div class="hdr-row" style="margin-bottom:6px"><span class="eyebrow">Voto per casa di grading</span><button class="btn sm ghost" data-help="standards" style="min-height:30px;padding:4px 10px">Criteri</button></div><div class="houses">${card("psa", "PSA")}${card("bgs", "BECKETT")}${card("cgc", "CGC")}</div></div>`;
}
function centLine(s) {
  const c = s.cent;
  if (c && c.fLR != null) return `Centratura${c.measured ? " misurata" : " stimata"}: fronte <span class="mono">${ratioTxt(c.fLR)} SX-DX · ${ratioTxt(c.fTB)} A-B</span>${c.bLR != null ? ` · retro <span class="mono">${ratioTxt(c.bLR)} · ${ratioTxt(c.bTB)}</span>` : ""}`;
  return s.ratio ? `Centratura stimata: <span class="mono">${esc(s.ratio)}</span>` : "";
}

/* ---------------- grading flow ---------------- */
const RUBRIC = `CRITERI UFFICIALI BECKETT (BGS) per i subgradi angoli, bordi, superficie:
- 10: angoli perfetti a occhio nudo e Mint sotto lente; bordi perfetti a occhio nudo e quasi perfetti sotto lente; superficie senza print spot, colore e lucentezza perfetti, nessun graffio né print line metallica.
- 9.5: angoli Mint a occhio nudo, minime imperfezioni sotto lente; bordi quasi Mint, al massimo un puntino di usura sotto esame attento; superficie con pochissimi print spot visibili solo con esame attento, lucentezza perfetta.
- 9: angoli Mint da vicino, un puntino di usura sotto esame attento; bordi quasi Mint con chipping poco evidente; superficie con qualche puntino di stampa o una piccola macchia, uno o due graffietti appena visibili, una print line leggera.
- 8.5: angoli netti a occhio nudo, lievi imperfezioni da vicino; bordi abbastanza lisci con puntini di chipping visibili; superficie con pochi print spot, graffi molto lievi o una print line sottile.
- 8: usura molto lieve su 2-3 angoli; bordi leggermente ruvidi, chipping o notching minimo; superficie con print spot evidenti, graffi lievi, qualche print line, lieve macchia di cera sul retro.
- 7: angoli sfilacciati su tutti e 4 o piccola ammaccatura; bordi visibilmente ruvidi con chipping evidente ma senza layering; perdita di lucentezza e graffi lievi, nessuno scuffing.
- 6: angoli leggermente arrotondati o con layering; bordi con chipping o notching pesante; pieghe minime, scuffing lieve, poca lucentezza.
- 5 o meno: pieghe evidenti, angoli arrotondati, macchie, scritte, strappi.
CENTRATURA (rapporto tra bordo più largo e più stretto): PSA 10 richiede circa 55/45 sul fronte e 75/25 sul retro, PSA 9 circa 60/40 fronte e 90/10 retro. BGS 9.5 richiede 50/50 su un asse e 55/45 sull'altro, BGS 9 55/45 su entrambi; retro 60/40 per 10/9.5. CGC Gem Mint 10 richiede 55/45 fronte e 75/25 retro, CGC 9 60/40.`;

const GRADE_PROMPT = (centNote) => `Sei un grader professionista di carte collezionabili con esperienza PSA, BGS (Beckett) e CGC.
Ti invio ${state.back ? "2 foto: la PRIMA è il FRONTE, la SECONDA è il RETRO" : "1 foto: il FRONTE"} di una carta (Pokémon o altro TCG).
1) Identifica la carta: nome, set, numero di collezione, gioco.
2) Valuta solo ciò che è visibile: centratura (rapporto bordi sinistra/destra e alto/basso, fronte e retro), angoli (whitening, arrotondamenti, pieghe), bordi (chipping, whitening, tagli irregolari), superficie (graffi, linee sull'holo, ammaccature, macchie, stampa).
${centNote ? "Misura di centratura fatta dall'utente con uno strumento: " + centNote + ". Usala come dato affidabile per la centratura.\n" : ""}
${RUBRIC}

Regole: subgradi da 1 a 10 a passi di 0.5, applicando i criteri Beckett qui sopra in modo severo. Misura la centratura dei bordi stampati: per ogni asse indica la percentuale del bordo più largo (50 = perfetta, 55 = 55/45). Se la foto è sfocata, riflessa o tagliata, abbassa "confidence" e dillo nella nota. Se non è una carta collezionabile, metti "is_card": false.
"note" in italiano, 3-5 frasi: punti di forza, difetti specifici con posizione (es. angolo in basso a sinistra del retro), e quale criterio di PSA, Beckett e CGC limita il voto.
Rispondi SOLO con JSON in questa forma:
{"is_card":true,"name":"Charizard","set":"Base Set","number":"4/102","game":"Pokémon","type":"fire","centering":9.5,"corners":8.0,"edges":8.5,"surface":9.0,"centering_front":{"lr":55,"tb":52},"centering_back":{"lr":60,"tb":55},"confidence":"alta|media|bassa","defects":["whitening angolo in basso a sinistra (retro)"],"note":"..."}
Se non hai il retro, "centering_back": null.
"type" è uno tra fire, water, grass, electric, psychic, fighting, dark, steel, dragon, fairy, normal.`;

async function analyze() {
  if (!state.front || state.busy) return;
  const ai = await getAI();
  if (!ai) { state.aiError = NO_KEY; renderGrade(); return; }
  if (!ai.images) { state.aiError = aiErr({ code: "images_unavailable" }); renderGrade(); return; }
  state.busy = true; state.aiError = ""; state.ctl = new AbortController(); renderGrade();
  const imgs = [state.front.blob]; if (state.back) imgs.push(state.back.blob);
  const mf = cent.results.front?.img === state.front.img ? cent.results.front : null;
  const mb = state.back && cent.results.back?.img === state.back.img ? cent.results.back : null;
  const cm = [mf && `fronte ${mf.lrTxt} sinistra/destra, ${mf.tbTxt} alto/basso`, mb && `retro ${mb.lrTxt} sinistra/destra, ${mb.tbTxt} alto/basso`].filter(Boolean).join("; ");
  try {
    const r = await ai.s.json(GRADE_PROMPT(cm), { images: imgs, signal: state.ctl.signal, modelTier: $("#accuracy").value });
    if (!r || r.is_card === false) { state.aiError = "Non riconosco una carta collezionabile nella foto. Inquadra solo la carta, dritta e a fuoco."; return; }
    const sub = {}; for (const k of ["centering", "corners", "edges", "surface"]) sub[k] = clamp(half(r[k] ?? 8), 1, 10);
    const c = { fLR: normW(r.centering_front?.lr), fTB: normW(r.centering_front?.tb), bLR: state.back ? normW(r.centering_back?.lr) : null, bTB: state.back ? normW(r.centering_back?.tb) : null, measured: false };
    if (mf) { c.fLR = mf.lrW; c.fTB = mf.tbW; c.measured = true; }
    if (mb) { c.bLR = mb.lrW; c.bTB = mb.tbW; c.measured = true; }
    const cs = centeringFromRatios(c); if (cs != null) sub.centering = cs;
    const fin = finalScore(sub);
    const slab = {
      kind: "slab", t: Date.now(), saved: false, manual: false,
      name: String(r.name || "Carta sconosciuta"), set: String(r.set || ""), number: String(r.number || ""), game: String(r.game || "Pokémon"), type: String(r.type || "normal"),
      ...sub, final: fin, label: gradeLabel(fin),
      cent: c.fLR != null ? c : null, ratio: "", confidence: String(r.confidence || ""),
      defects: Array.isArray(r.defects) ? r.defects.slice(0, 8).map(String) : [], note: String(r.note || ""),
      front: state.front.thumb, back: state.back?.thumb || ""
    };
    const id = uid("slab");
    Store.put(id, slab); pruneHistory();
    bumpCounter();
    state.result = id;
  } catch (e) {
    state.aiError = aiErr(e);
  } finally {
    state.busy = false; state.ctl = null; renderAll();
    if (state.result) $("#result").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
}
function bumpCounter() {
  const m = Store.get("meta") || { kind: "meta", graded: 0 };
  Store.put("meta", { ...m, kind: "meta", graded: (m.graded || 0) + 1 });
}
function pruneHistory() {
  const hist = Store.all("slab").filter(s => !s.saved).sort((a, b) => b.t - a.t);
  hist.slice(HIST_MAX).forEach(s => Store.del(s.id));
}
function manualSlab() {
  const sub = {}; for (const k of ["centering", "corners", "edges", "surface"]) sub[k] = Number($("#m-" + k).value);
  const fin = finalScore(sub);
  const slab = { kind: "slab", t: Date.now(), saved: false, manual: true, name: $("#m-name").value.trim() || "Carta senza nome", set: "", number: "", game: "", type: "normal",
    ...sub, final: fin, label: gradeLabel(fin), cent: null, ratio: "", confidence: "", defects: [], note: "Valutazione inserita a mano.",
    front: state.front?.thumb || "", back: state.back?.thumb || "" };
  const id = uid("slab"); Store.put(id, slab); pruneHistory(); state.result = id; renderAll(); toast("Slab creato");
  $("#result").scrollIntoView({ block: "start" });
}

/* ---------------- render: grade ---------------- */
function slotFace(side) {
  const d = state[side];
  const busy = state.busy && d;
  if (!d) return `<div class="ph">${ICON.camera}<span>${side === "front" ? "Aggiungi il fronte" : "Aggiungi il retro"}</span><span style="font-size:11.5px">${side === "front" ? "obbligatorio" : "facoltativo"} · tocca per la galleria</span></div>`;
  return `<img src="${d.thumb}" alt="${side === "front" ? "Fronte" : "Retro"} della carta"><span class="pencil" aria-hidden="true">${ICON.pencil}</span>${busy ? '<span class="scan"></span>' : ""}`;
}
function renderGrade() {
  const m = Store.get("meta"); const n = m?.graded || 0;
  for (const side of ["front", "back"]) {
    $("#face-" + side).innerHTML = slotFace(side);
    $("#slot-" + side).classList.toggle("has", !!state[side]);
  }
  const btn = $("#btn-analyze");
  btn.disabled = !state.front;
  btn.innerHTML = state.busy
    ? `<span class="spin" aria-hidden="true"></span><span>Annulla analisi</span>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 16v-4M12 16V8M16 16v-6"/></svg><span>Analizza con AI</span>`;
  $("#ai-state").innerHTML = state.busy
    ? `<div class="notice info"><span class="spin" aria-hidden="true"></span><span>${providerName()} sta esaminando centratura, angoli, bordi e superficie. Ci vogliono di solito 15–40 secondi.</span></div>`
    : state.aiError ? `<div class="notice bad">${ICON.warn}<span>${esc(state.aiError)}</span></div>` : "";
  const r = state.result && Store.get(state.result);
  $("#result").innerHTML = r ? resultHTML({ id: state.result, ...r }) : "";
}
/* Apple Watch–style progress ring */
function ringSVG(v, size, stroke) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, f = clamp(Number(v) / 10, 0, 1);
  const col = v >= 9 ? "var(--accent)" : v >= 7 ? "var(--sun)" : "var(--bad)";
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(C * f).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}
function resultHTML(r) {
  const tiles = [["centering", "Centratura"], ["surface", "Superficie"], ["edges", "Bordi"], ["corners", "Angoli"]]
    .map(([k, l]) => `<div class="sub">${ringSVG(r[k], 46, 6)}<div><div class="k">${l}</div><div class="v">${f1(r[k])}</div></div></div>`).join("");
  return `<div class="panel" style="display:flex;flex-direction:column;gap:14px">
    <div class="result-head"><span class="eyebrow">Carta rilevata</span><h2>${esc(r.name)}${r.number ? " " + esc(r.number) : ""}</h2>${r.set ? `<span class="muted small">${esc(r.set)}${r.game ? " · " + esc(r.game) : ""}</span>` : ""}</div>
    <div class="final">
      <div class="final-ring">${ringSVG(r.final, 124, 12)}<div class="final-num"><div class="n">${f1(r.final)}</div><div class="l">SU 10</div></div></div>
      <div class="final-info"><div class="eyebrow">Voto finale · scala Beckett</div><div class="final-label">${esc(r.label)}</div>${r.confidence ? `<div class="conf-pill"><i></i>Affidabilità ${esc(r.confidence)}</div>` : ""}</div>
    </div>
    <div class="subs">${tiles}</div>
    ${companyHTML(r)}
    ${centLine(r) ? `<div class="small muted">${centLine(r)}</div>` : ""}
    <div class="note"><h3>${ICON.spark}${r.manual ? "Nota" : "Nota AI"}</h3><p>${esc(r.note)}</p>${r.defects?.length ? `<ul class="defects">${r.defects.map(d => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}</div>
    <div class="row">
      <button class="btn sm" data-act="open-slab" data-id="${r.id}">Apri slab</button>
      <button class="btn sm" data-act="to-center">Misura centratura</button>
      <button class="btn sm" data-act="slab-to-pf" data-id="${r.id}">Aggiungi al portfolio</button>
    </div>
    <p class="small muted" style="margin:0">Pre-grading indicativo da foto: non sostituisce la valutazione di una casa di grading.</p>
  </div>`;
}

/* ---------------- centering tool ---------------- */
const cent = { img: null, side: "front", mode: "outer", outer: null, inner: null, drag: null, result: null, forFront: false, results: {} };
const cv = $("#c-canvas"), loupe = $("#c-loupe");
function defaultQuads(w, h) {
  const o = (fx, fy) => [[w * fx, h * fy], [w * (1 - fx), h * fy], [w * (1 - fx), h * (1 - fy)], [w * fx, h * (1 - fy)]];
  return { outer: o(0.04, 0.03), inner: o(0.1, 0.075) };
}
function setCentImage(img, side) {
  cent.img = img; cent.side = side || cent.side;
  const q = defaultQuads(img.naturalWidth, img.naturalHeight);
  cent.outer = q.outer; cent.inner = q.inner; cent.mode = "outer"; cent.result = null;
  renderCentering(); drawCent();
}
function stageGeom() {
  const W = $("#c-stage").clientWidth || 340;
  const img = cent.img; if (!img) return null;
  const maxH = Math.min(window.innerHeight * 0.62, 640);
  let s = W / img.naturalWidth; if (img.naturalHeight * s > maxH) s = maxH / img.naturalHeight;
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  return { W, H: dh, s, ox: (W - dw) / 2, oy: 0, dw, dh };
}
function drawCent() {
  const has = !!cent.img;
  $("#c-empty").hidden = has; cv.hidden = !has;
  if (!has) return;
  const g = stageGeom(); const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(g.W * dpr); cv.height = Math.round(g.H * dpr); cv.style.height = g.H + "px";
  const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.fillStyle = "#0B0F14"; x.fillRect(0, 0, g.W, g.H);
  x.drawImage(cent.img, g.ox, g.oy, g.dw, g.dh);
  const P = p => [g.ox + p[0] * g.s, g.oy + p[1] * g.s];
  const css = getComputedStyle(document.documentElement);
  const colO = css.getPropertyValue("--outer").trim(), colI = css.getPropertyValue("--inner").trim();
  for (const [q, col, act] of [[cent.outer, colO, cent.mode === "outer"], [cent.inner, colI, cent.mode === "inner"]]) {
    x.globalAlpha = act ? 1 : 0.55; x.strokeStyle = col; x.lineWidth = 2; x.beginPath();
    q.forEach((p, i) => { const [a, b] = P(p); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.closePath(); x.stroke();
    q.forEach(p => { const [a, b] = P(p); x.beginPath(); x.arc(a, b, act ? 8 : 5, 0, Math.PI * 2); x.fillStyle = col; x.fill(); x.lineWidth = 2; x.strokeStyle = "#fff"; x.stroke(); });
  }
  x.globalAlpha = 1;
}
function drawLoupe(pt) {
  const g = stageGeom(); const L = loupe.getContext("2d"); const S = 256, zoom = 4;
  const src = 256 / (g.s * zoom); // image px shown
  L.fillStyle = "#000"; L.fillRect(0, 0, S, S);
  L.imageSmoothingEnabled = false;
  L.drawImage(cent.img, pt[0] - src / 2, pt[1] - src / 2, src, src, 0, 0, S, S);
  const col = cent.mode === "outer" ? "#FFB547" : "#63E6BE";
  L.strokeStyle = col; L.lineWidth = 2;
  L.beginPath(); L.moveTo(S / 2, 20); L.lineTo(S / 2, S - 20); L.moveTo(20, S / 2); L.lineTo(S - 20, S / 2); L.stroke();
  loupe.style.borderColor = col;
  const [sx] = [g.ox + pt[0] * g.s];
  loupe.style.left = (sx < g.W / 2 ? g.W - 140 : 12) + "px"; loupe.style.top = "12px";
}
function evPt(e) {
  const r = cv.getBoundingClientRect(); const g = stageGeom();
  return [((e.clientX - r.left) - g.ox) / g.s, ((e.clientY - r.top) - g.oy) / g.s];
}
cv.addEventListener("pointerdown", e => {
  if (!cent.img) return;
  const g = stageGeom(); const p = evPt(e); const q = cent[cent.mode];
  let best = -1, bd = 1e9;
  q.forEach((c, i) => { const d = Math.hypot((c[0] - p[0]) * g.s, (c[1] - p[1]) * g.s); if (d < bd) { bd = d; best = i; } });
  if (bd > 44) return;
  cent.drag = { i: best, dx: q[best][0] - p[0], dy: q[best][1] - p[1] };
  cv.setPointerCapture(e.pointerId); loupe.hidden = false; drawLoupe(q[best]); e.preventDefault();
});
cv.addEventListener("pointermove", e => {
  if (!cent.drag) return;
  const p = evPt(e); const q = cent[cent.mode]; const img = cent.img;
  q[cent.drag.i] = [clamp(p[0] + cent.drag.dx, 0, img.naturalWidth), clamp(p[1] + cent.drag.dy, 0, img.naturalHeight)];
  cent.result = null; drawCent(); drawLoupe(q[cent.drag.i]);
});
const endDrag = () => { if (cent.drag) { cent.drag = null; loupe.hidden = true; renderCentering(); } };
cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
window.addEventListener("resize", () => { if (state.view === "centering") drawCent(); });

function solve(A, b) {
  const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
  return [...solve(A, b), 1];
}
const applyH = (H, [x, y]) => { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };
function analyzeCentering() {
  if (!cent.img) { toast("Carica prima una foto"); return; }
  const H = homography(cent.outer, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  const q = cent.inner.map(p => applyH(H, p));
  const L = (q[0][0] + q[3][0]) / 2, R = 1 - (q[1][0] + q[2][0]) / 2, T = (q[0][1] + q[1][1]) / 2, B = 1 - (q[3][1] + q[2][1]) / 2;
  if ([L, R, T, B].some(v => !(v > 0)) || L + R >= 1 || T + B >= 1) { cent.result = { error: true }; renderCentering(); return; }
  const lr = L / (L + R) * 100, tb = T / (T + B) * 100;
  const lrW = Math.max(lr, 100 - lr), tbW = Math.max(tb, 100 - tb), worst = Math.max(lrW, tbW), fr = cent.side === "front";
  const r = { lr, tb, lrW, tbW, worst, img: cent.img, lrTxt: `${Math.round(lr)}/${Math.round(100 - lr)}`, tbTxt: `${Math.round(tb)}/${Math.round(100 - tb)}`,
    score: fr ? bgsCentFront(lrW, tbW) : bgsCentBack(worst), psa: fr ? psaCentFront(worst) : psaCentBack(worst), cgc: fr ? cgcCentFront(worst) : cgcCentBack(worst), side: cent.side };
  cent.result = r; cent.results[cent.side] = r; cent.forFront = cent.side === "front";
  renderCentering();
}
function combinedCentScore() {
  const s = Object.values(cent.results).map(r => r.score);
  return s.length ? Math.min(...s) : null;
}
function renderCentering() {
  const o = cent.mode === "outer";
  const st = $("#c-step"); st.className = "step " + (o ? "outer" : "inner");
  $("#c-step-t").textContent = o ? "Passo 1: bordo esterno" : "Passo 2: bordo interno";
  $("#c-step-d").textContent = o ? "Trascina le maniglie arancioni sui 4 angoli esterni della carta" : "Trascina le maniglie verdi sugli angoli del riquadro stampato (dove finisce il bordo)";
  $("#c-switch-t").textContent = o ? "Passa all'interno" : "Torna all'esterno";
  $("#c-switch").className = "btn " + (o ? "tone-inner" : "tone-outer");
  $("#c-side-front").setAttribute("aria-pressed", cent.side === "front");
  $("#c-side-back").setAttribute("aria-pressed", cent.side === "back");
  const r = cent.result; const box = $("#c-result");
  if (!r) { box.innerHTML = ""; drawCent(); return; }
  if (r.error) { box.innerHTML = `<div class="notice bad">${ICON.warn}<span>Il riquadro interno deve stare tutto dentro quello esterno. Sistema le maniglie e riprova.</span></div>`; drawCent(); return; }
  const current = state.result && Store.get(state.result);
  const comb = combinedCentScore();
  box.innerHTML = `<div class="panel" style="display:flex;flex-direction:column;gap:12px">
    <div class="hdr-row"><span class="eyebrow">Risultato · ${r.side === "front" ? "fronte" : "retro"}</span><span class="muted small mono">peggior lato ${Math.round(r.worst)}%</span></div>
    <div class="ratios">
      <div class="ratio"><div class="small muted">Sinistra / Destra</div><div class="v">${r.lrTxt}</div><div class="bar-split"><i style="width:${r.lr}%"></i><i style="width:${100 - r.lr}%"></i></div></div>
      <div class="ratio"><div class="small muted">Alto / Basso</div><div class="v">${r.tbTxt}</div><div class="bar-split"><i style="width:${r.tb}%"></i><i style="width:${100 - r.tb}%"></i></div></div>
    </div>
    <div class="houses">
      <div class="house"><span>PSA</span><b>${r.psa}</b><small>voto massimo</small></div>
      <div class="house"><span>BECKETT</span><b>${f1(r.score)}</b><small>subgrado centratura</small></div>
      <div class="house"><span>CGC</span><b>${f1(r.cgc)}</b><small>voto massimo</small></div>
    </div>
    <p class="small muted" style="margin:0">${r.side === "front" ? "Fronte: PSA 10 fino a 55/45, PSA 9 fino a 60/40. Beckett 9.5 vuole 50/50 su un asse e 55/45 sull'altro. CGC 10 fino a 55/45." : "Retro: PSA 10 fino a 75/25, PSA 9 fino a 90/10. Beckett 10 fino a 60/40. CGC 10 fino a 75/25."} ${Object.keys(cent.results).length === 2 ? `Fronte e retro misurati: subgrado Beckett combinato <b class="mono">${f1(comb)}</b>.` : "Misura anche l'altro lato per un voto completo."} <button class="btn sm ghost" data-help="standards" style="min-height:28px;padding:2px 10px">Tutti i criteri</button></p>
    ${current ? `<button class="btn primary block" data-act="apply-cent">Applica la centratura misurata allo slab di ${esc(current.name)}</button>` : ""}
  </div>`;
  drawCent();
}
async function useSideImage(side) {
  const d = state[side];
  cent.side = side;
  if (d) setCentImage(d.img, side); else { cent.result = null; renderCentering(); }
}

/* ---------------- slab rendering ---------------- */
function slabHTML(s) {
  return `<div class="slab" role="img" aria-label="Slab ${esc(s.name)} voto ${f1(s.final)}">
    <div class="slab-label">
      <div><div class="nm">${esc(s.name)}${s.number ? " " + esc(s.number) : ""}</div>
        <div class="sl"><span>Centering</span><span>${f1(s.centering)}</span><span>Surface</span><span>${f1(s.surface)}</span><span>Edges</span><span>${f1(s.edges)}</span><span>Corners</span><span>${f1(s.corners)}</span></div></div>
      <div class="gr"><div class="lg">GRADSCAN</div><div class="g">${f1(s.final)}</div><div class="t">${esc(s.label)}</div></div>
    </div>
    <div class="slab-window">${s.front ? `<img src="${s.front}" alt="">` : artHTML({ name: s.name, number: s.number, type: s.type })}</div>
  </div>`;
}
function renderSlabs() {
  const all = Store.all("slab").sort((a, b) => b.t - a.t);
  const hist = all.filter(s => !s.saved), saved = all.filter(s => s.saved);
  $("#s-count-h").textContent = `${hist.length}/${HIST_MAX}`;
  $("#s-count-s").textContent = `${saved.length}/${SAVED_MAX}`;
  $("#s-tab-history").setAttribute("aria-pressed", state.slabTab === "history");
  $("#s-tab-saved").setAttribute("aria-pressed", state.slabTab === "saved");
  const list = state.slabTab === "history" ? hist : saved;
  const box = $("#slab-list");
  if (!Store.ready) { box.innerHTML = `<div class="panel empty"><span class="spin"></span><span class="muted">Carico i tuoi slab…</span></div>`; return; }
  if (!list.length) {
    box.innerHTML = `<div class="panel empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8 7h8"/><rect x="8" y="10" width="8" height="8" rx="1"/></svg>
      <b>${state.slabTab === "history" ? "Nessuno slab recente" : "Nessuno slab salvato"}</b>
      <span class="muted small">${state.slabTab === "history" ? "Ogni carta che valuti compare qui come slab digitale. La cronologia tiene le ultime 10." : "Premi Salva su uno slab della cronologia per tenerlo (fino a 100)."}</span>
      ${state.slabTab === "history" ? `<button class="btn primary" data-go="grade">Valuta una carta</button>` : ""}</div>`;
    return;
  }
  box.innerHTML = list.map(s => `<div class="panel slab-item">
    <div class="slab-actions">
      <button class="btn sm save-btn" data-act="save" data-id="${s.id}" aria-pressed="${!!s.saved}">${ICON.bookmark}${s.saved ? "Salvato" : "Salva"}</button>
      <span class="spacer"></span>
      <button class="act zoom" data-act="zoom" data-id="${s.id}" aria-label="Ingrandisci">${ICON.zoom}</button>
      <button class="act share" data-act="share" data-id="${s.id}" aria-label="Condividi">${ICON.share}</button>
      ${state.confirmDel === s.id ? `<button class="act del confirm" data-act="del" data-id="${s.id}">Elimina?</button>` : `<button class="act del" data-act="del" data-id="${s.id}" aria-label="Elimina">${ICON.trash}</button>`}
    </div>
    ${slabHTML(s)}
    <div class="small muted mono">${new Date(s.t).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}${s.manual ? " · manuale" : ""}</div>
  </div>`).join("");
}

async function slabCanvas(s) {
  try { await document.fonts.ready; } catch (e) {}
  const W = 900, H = 1380, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  x.fillStyle = "#0B0F14"; x.fillRect(0, 0, W, H);
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.roundRect(X, Y, w, h, r); };
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#EEF2F6"); g.addColorStop(1, "#B9C2CE");
  rr(50, 40, W - 100, H - 80, 34); x.fillStyle = g; x.fill();
  rr(80, 70, W - 160, 270, 18); x.fillStyle = "#0F151D"; x.fill();
  x.fillStyle = "#F5F7FA"; x.font = "800 38px Manrope, Arial, sans-serif";
  let nm = (s.name + (s.number ? " " + s.number : "")).toUpperCase(); while (x.measureText(nm).width > 470 && nm.length > 4) nm = nm.slice(0, -2) + "…";
  x.fillText(nm, 110, 130);
  x.fillStyle = "#63E6BE"; x.fillRect(110, 155, 5, 150);
  x.font = "800 24px Manrope, Arial, sans-serif";
  [["CENTERING", s.centering], ["SURFACE", s.surface], ["EDGES", s.edges], ["CORNERS", s.corners]].forEach(([k, v], i) => {
    x.fillStyle = "#63E6BE"; x.fillText(k, 130, 185 + i * 36); x.fillStyle = "#fff"; x.fillText(f1(v), 470, 185 + i * 36);
  });
  x.strokeStyle = "#2A3442"; x.lineWidth = 2; x.beginPath(); x.moveTo(570, 95); x.lineTo(570, 315); x.stroke();
  x.textAlign = "center"; x.fillStyle = "#63E6BE"; x.font = "800 22px Manrope, Arial, sans-serif"; x.fillText("GRADSCAN", 695, 130);
  x.fillStyle = "#fff"; x.font = "800 110px Manrope, Arial, sans-serif"; x.fillText(f1(s.final), 695, 250);
  x.fillStyle = "#63E6BE"; x.font = "800 22px Manrope, Arial, sans-serif"; x.fillText(s.label, 695, 295); x.textAlign = "left";
  rr(80, 370, W - 160, H - 470, 18); x.fillStyle = "#0F151D"; x.fill();
  if (s.front) {
    try {
      const im = await loadImg(s.front); const bw = W - 220, bh = H - 530;
      const sc = Math.min(bw / im.naturalWidth, bh / im.naturalHeight); const dw = im.naturalWidth * sc, dh = im.naturalHeight * sc;
      x.save(); rr((W - dw) / 2, 400 + (bh - dh) / 2, dw, dh, 12); x.clip(); x.drawImage(im, (W - dw) / 2, 400 + (bh - dh) / 2, dw, dh); x.restore();
    } catch (e) {}
  }
  return c;
}
async function shareSlab(s) {
  const text = `${s.name}${s.number ? " " + s.number : ""} — Voto ${f1(s.final)} (${s.label}) · Centratura ${f1(s.centering)} · Angoli ${f1(s.corners)} · Bordi ${f1(s.edges)} · Superficie ${f1(s.surface)} — pre-grading GradScan`;
  const fname = `slab-${(s.name || "carta").replace(/[^\w\-]+/g, "-").toLowerCase()}.png`;
  let blob = null;
  try { const c = await slabCanvas(s); blob = await new Promise(r => c.toBlob(r, "image/png")); } catch (e) {}
  if (blob && navigator.canShare) {
    const file = new File([blob], fname, { type: "image/png" });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
  }
  if (blob) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fname;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Immagine dello slab scaricata"); return;
  }
  try { await navigator.clipboard.writeText(text); toast("Testo dello slab copiato"); }
  catch (e) { openModal(`<h2>Condividi slab</h2><textarea class="field" rows="5" style="width:100%" readonly>${esc(text)}</textarea><button class="btn block" data-close>Chiudi</button>`); }
}
function zoomSlab(s) {
  openModal(`<div class="hdr-row"><h2>${esc(s.name)}${s.number ? " " + esc(s.number) : ""}</h2><button class="icon-btn" data-close aria-label="Chiudi">✕</button></div>
    <div style="display:flex;justify-content:center;padding:10px 0">${slabHTML(s)}</div>
    ${s.front || s.back ? `<div class="slots">${s.back ? `<div><img src="${s.back}" alt="Retro" style="border-radius:10px;width:100%"><div class="slot-name">Retro</div></div>` : ""}${s.front ? `<div><img src="${s.front}" alt="Fronte" style="border-radius:10px;width:100%"><div class="slot-name">Fronte</div></div>` : ""}</div>` : ""}
    ${companyHTML(s)}
    ${centLine(s) ? `<div class="small muted">${centLine(s)}</div>` : ""}
    <div class="note"><h3>${ICON.spark}Nota</h3><p>${esc(s.note)}</p>${s.defects?.length ? `<ul class="defects">${s.defects.map(d => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}</div>`);
}

/* ---------------- card art ---------------- */
function artHTML(c) {
  const [c1, c2] = TYPE_COL[String(c.type || "").toLowerCase()] || TYPE_COL.normal;
  return `<div class="art" style="--c1:${c1};--c2:${c2}" aria-hidden="true"><span class="a-name">${esc(c.name || "")}</span><span class="a-glyph"></span><span class="a-text"><i></i><i style="width:80%"></i><i style="width:60%"></i></span><span class="a-num">${esc(c.number || "")}</span></div>`;
}

/* ---------------- portfolio ---------------- */
const RANGES = { "7D": 7, "1M": 30, "3M": 91, "6M": 182, "Max": Infinity };
function holdings() { return Store.all("holding").sort((a, b) => (a.t || 0) - (b.t || 0)); }
function totalValue() { return holdings().reduce((a, h) => a + (Number(h.price) || 0) * (h.qty || 0), 0); }
function recordSnapshot() {
  const v = Math.round(totalValue() * 100) / 100;
  const h = Store.get("phist") || { kind: "phist", pts: [] };
  const pts = (h.pts || []).slice(); const now = Date.now();
  const last = pts[pts.length - 1];
  if (last && last[1] === v) return;
  if (last && now - last[0] < 60000) pts[pts.length - 1] = [now, v]; else pts.push([now, v]);
  Store.put("phist", { kind: "phist", pts: pts.slice(-500), example: h.example && holdings().some(x => x.example) });
}
function addHolding(o) {
  const ex = holdings().find(h => h.name === o.name && (h.set || "") === (o.set || "") && (h.variant || "") === (o.variant || ""));
  if (ex) Store.put(ex.id, { ...strip(ex), qty: (ex.qty || 0) + 1 });
  else Store.put(uid("hold"), { kind: "holding", t: Date.now(), name: o.name, set: o.set || "", number: o.number || "", game: o.game || "Pokémon", variant: o.variant || "Normal", type: o.type || "normal", price: Number(o.price) || 0, qty: 1, ...(o.example ? { example: true } : {}) });
  recordSnapshot(); renderAll(); toast("Aggiunto al portfolio");
}
const strip = o => { const { id, ...r } = o; return r; };
function loadExamplePortfolio() {
  const ex = [
    ["First Partner Illustration Collection (Series 1)", "First Partner Collection", "", "Sealed", "grass", 67.61, 1],
    ["First Partner Illustration Collection (Series 2)", "First Partner Collection", "", "Sealed", "water", 64.54, 1],
    ["Charizard ex", "Obsidian Flames", "223/197", "Holo", "fire", 98.40, 1],
    ["Umbreon VMAX", "Evolving Skies", "215/203", "Holo", "dark", 1290.00, 1],
    ["Pikachu", "Celebrations", "005/025", "Holo", "electric", 4.85, 3],
    ["Gardevoir ex", "Scarlet & Violet", "086/198", "Holo", "psychic", 3.10, 2],
    ["Radiant Greninja", "Astral Radiance", "046/189", "Holo", "water", 3.60, 2],
    ["Mew ex", "151", "205/165", "Holo", "psychic", 61.20, 1],
  ];
  ex.forEach((e, i) => Store.put(uid("hold"), { kind: "holding", t: Date.now() + i, name: e[0], set: e[1], number: e[2], game: "Pokémon", variant: e[3], type: e[4], price: e[5], qty: e[6], example: true }));
  const total = ex.reduce((a, e) => a + e[5] * e[6], 0);
  const pts = []; const now = Date.now(); let v = total * 0.82;
  for (let d = 200; d >= 1; d--) { v = v * (1 + (Math.sin(d * 1.7) * 0.012 + 0.0011)); pts.push([now - d * 86400000, Math.round(v * 100) / 100]); }
  pts.push([now, Math.round(total * 100) / 100]);
  Store.put("phist", { kind: "phist", pts, example: true });
  renderAll(); toast("Dati di esempio caricati");
}
function clearExamples() {
  holdings().filter(h => h.example).forEach(h => Store.del(h.id));
  const ph = Store.get("phist"); if (ph?.example) Store.del("phist");
  recordSnapshot(); renderAll(); toast("Esempi rimossi");
}
function chartSVG(ptsAll, rangeKey) {
  const now = Date.now(); const days = RANGES[rangeKey];
  const from = days === Infinity ? (ptsAll[0]?.[0] ?? now) : now - days * 86400000;
  let pts = ptsAll.filter(p => p[0] >= from);
  const before = ptsAll.filter(p => p[0] < from).pop();
  if (before) pts.unshift([from, before[1]]);
  if (!pts.length) pts = [[from, totalValue()]];
  const cur = totalValue(); if (pts[pts.length - 1][0] < now) pts.push([now, cur]);
  if (pts.length === 1) pts.unshift([from === now ? now - 86400000 : from, pts[0][1]]);
  const W = 340, H = 170, pl = 4, pr = 4, pt = 12, pb = 8;
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1;
  const vs = pts.map(p => p[1]); let lo = Math.min(...vs), hi = Math.max(...vs); if (hi - lo < 1) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const X = t => pl + (t - t0) / Math.max(1, t1 - t0) * (W - pl - pr), Y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const line = pts.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ");
  const area = line + ` L${X(t1).toFixed(1)} ${H - pb} L${X(t0).toFixed(1)} ${H - pb} Z`;
  const grid = [0.25, 0.5, 0.75].map(f => `<line x1="0" x2="${W}" y1="${pt + f * (H - pt - pb)}" y2="${pt + f * (H - pt - pb)}" stroke="var(--line)" stroke-width="1"/>`).join("");
  const lp = pts[pts.length - 1];
  const delta = lp[1] - pts[0][1];
  return { delta, pct: pts[0][1] ? delta / pts[0][1] * 100 : 0, svg: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento del valore del portfolio">
    <defs><linearGradient id="pfg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".45"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    ${grid}<path d="${area}" fill="url(#pfg)"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(lp[0])}" cy="${Y(lp[1])}" r="4.5" fill="var(--fg)" stroke="var(--accent)" stroke-width="2.5"/></svg>` };
}
function renderPortfolio() {
  $("#p-tab-pf").setAttribute("aria-pressed", state.pTab === "pf");
  $("#p-tab-search").setAttribute("aria-pressed", state.pTab === "search");
  $("#p-main").hidden = state.pTab !== "pf"; $("#p-search").hidden = state.pTab !== "search";
  renderSearch();
  const hs = holdings(); const box = $("#p-main");
  if (!Store.ready) { box.innerHTML = `<div class="panel empty"><span class="spin"></span><span class="muted">Carico il portfolio…</span></div>`; return; }
  const total = totalValue(); const ph = Store.get("phist"); const ch = chartSVG(ph?.pts || [], state.range);
  const anyEx = hs.some(h => h.example);
  const statusNote = Store.mode === "memory" ? `<div class="notice warn">${ICON.warn}<span>Il browser non permette di salvare: i dati si perdono alla chiusura. Esci dalla navigazione privata.</span></div>` : "";
  const cards = hs.length ? hs.map(h => `<div class="hold">
      ${artHTML(h)}
      <div class="hold-info"><div class="nm">${esc(h.name)}${h.number ? ` <span class="muted mono small">${esc(h.number)}</span>` : ""}</div>
        <div class="meta">${esc(h.game)}${h.set ? " · " + esc(h.set) : ""}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${state.editPrice === h.id ? `<input class="price-edit" id="price-${h.id}" inputmode="decimal" value="${Number(h.price).toFixed(2)}" aria-label="Prezzo in dollari"><button class="btn sm" data-act="price-ok" data-id="${h.id}">OK</button>` : `<button class="price-pill" data-act="price-edit" data-id="${h.id}" aria-label="Modifica prezzo">${fmt$(h.price)}</button>`}<span class="small muted">${esc(h.variant)}</span>${h.example ? '<span class="tag-ex">esempio</span>' : ""}</div></div>
      <div class="stepper">${state.confirmHold === h.id ? `<button data-act="hold-del" data-id="${h.id}" style="width:auto;padding:0 10px;font-size:13px;color:var(--bad)">Rimuovi</button>` : `<button data-act="qty-" data-id="${h.id}" aria-label="Meno">−</button><span>${h.qty}</span><button data-act="qty+" data-id="${h.id}" aria-label="Più">+</button>`}</div>
    </div>`).join("")
    : `<div class="panel empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/></svg><b>Il portfolio è vuoto</b><span class="muted small">Aggiungi carte da Cerca, da uno slab o dalle opportunità di mercato.</span><div class="row" style="width:100%"><button class="btn primary" data-act="to-search">Cerca una carta</button><button class="btn" data-act="load-ex">Carica esempio</button></div></div>`;
  box.innerHTML = `<div class="pf-card">
      <div class="hdr-row"><span class="t">Portfolio</span>${anyEx ? '<span class="tag-ex">dati di esempio</span>' : ""}</div>
      <div class="v">${fmt$(total)}</div>
      <div class="delta ${ch.delta >= 0 ? "up" : "down"}">${ch.delta >= 0 ? "▲" : "▼"} ${fmt$(Math.abs(ch.delta))} (${ch.pct >= 0 ? "+" : ""}${ch.pct.toFixed(1)}%) · ${state.range}</div>
      <div class="chart" style="margin-top:10px">${ch.svg}</div>
      <div class="ranges">${Object.keys(RANGES).map(k => `<button data-range="${k}" aria-pressed="${state.range === k}">${k}</button>`).join("")}</div>
    </div>
    ${statusNote}
    <div class="hdr-row"><h2>Le mie carte</h2><span class="muted small mono">${hs.reduce((a, h) => a + h.qty, 0)} carte</span></div>
    ${hs.length ? `<div class="row"><button class="btn sm" data-act="refresh-prices" ${state.refreshBusy ? "disabled" : ""}>${state.refreshBusy ? '<span class="spin"></span>Aggiorno…' : "Aggiorna prezzi con AI"}</button>${anyEx ? `<button class="btn sm tone-bad" data-act="clear-ex">Rimuovi esempi</button>` : ""}</div>` : ""}
    <div class="list">${cards}</div>
    ${hs.length ? `<p class="small muted" style="margin:0">Tocca un prezzo per correggerlo. I prezzi stimati dall'AI non sono quotazioni in tempo reale: verifica su TCGplayer, Cardmarket o eBay venduti.</p>` : ""}`;
}
function renderSearch() {
  const b = $("#ps-results");
  b.innerHTML = state.searchBusy ? `<div class="notice info"><span class="spin"></span><span>Cerco e stimo il prezzo…</span></div>`
    : state.searchErr ? `<div class="notice bad">${ICON.warn}<span>${esc(state.searchErr)}</span></div>`
    : state.searchRes.map((r, i) => `<div class="hold">${artHTML(r)}<div class="hold-info"><div class="nm">${esc(r.name)} ${r.number ? `<span class="muted mono small">${esc(r.number)}</span>` : ""}</div><div class="meta">${esc(r.set || "")} · ${esc(r.variant || "Normal")}</div><span class="price-pill" style="align-self:flex-start">~${fmt$(r.price)}</span></div><button class="btn sm primary" data-act="add-res" data-i="${i}">Aggiungi</button></div>`).join("");
}
async function doSearch() {
  const q = $("#ps-q").value.trim(); if (!q) { toast("Scrivi il nome di una carta"); return; }
  const ai = await getAI(); if (!ai) { state.searchErr = NO_KEY; renderSearch(); return; }
  state.searchBusy = true; state.searchErr = ""; renderSearch();
  const game = $("#ps-game").value;
  try {
    const r = await ai.s.json(`Trova fino a 5 carte singole o prodotti sigillati realmente esistenti del gioco "${game}" che corrispondono alla ricerca: "${q}". Per ognuno stima il prezzo di mercato medio attuale in USD in condizioni raw Near Mint (o sigillato), usando le tue conoscenze; non hai dati in tempo reale.
Rispondi solo con un array JSON: [{"name":"Umbreon VMAX","set":"Evolving Skies","number":"215/203","variant":"Holo","type":"dark","price":1290.0}]. variant tra Normal, Holo, Reverse Holo, Sealed. type tra fire, water, grass, electric, psychic, fighting, dark, steel, dragon, fairy, normal.`, { modelTier: "quick" });
    state.searchRes = (Array.isArray(r) ? r : []).slice(0, 5).map(x => ({ ...x, game, price: Number(x.price) || 0 }));
    if (!state.searchRes.length) state.searchErr = "Nessuna carta trovata. Prova con nome e set, es. \"Mew ex 151\".";
  } catch (e) { state.searchErr = aiErr(e); }
  state.searchBusy = false; renderSearch();
}
async function refreshPrices() {
  const hs = holdings(); if (!hs.length) return;
  const ai = await getAI(); if (!ai) { toast("Aggiungi la chiave API in Impostazioni, oppure correggi i prezzi a mano"); return; }
  state.refreshBusy = true; renderPortfolio();
  try {
    const list = hs.map((h, i) => `${i}. ${h.game} — ${h.name} ${h.number} (${h.set}, ${h.variant})`).join("\n");
    const r = await ai.s.json(`Stima il prezzo di mercato medio in USD (raw Near Mint o sigillato) per ciascun elemento, con le tue conoscenze di mercato più recenti:\n${list}\nRispondi solo con un array JSON [{"i":0,"price":12.5}].`, { modelTier: "default" });
    let n = 0;
    (Array.isArray(r) ? r : []).forEach(x => { const h = hs[x.i]; const p = Number(x.price); if (h && p > 0) { Store.put(h.id, { ...strip(h), price: Math.round(p * 100) / 100 }); n++; } });
    recordSnapshot(); toast(`${n} prezzi aggiornati`);
  } catch (e) { toast(aiErr(e)); }
  state.refreshBusy = false; renderAll();
}

/* ---------------- market ---------------- */
const EX_WORTH = [
  { name: "Charizard", set: "Pokémon GO", number: "010/078", type: "fire", score: 72, liquidity: 100, growth: 60, demand: 80, forums: 75, risk: 45, raw: 3.94, roi1: "10-20%", roi3: "30-60%", roi5: "50-100%", why: "Charizard ha sempre domanda; versione economica di un set molto stampato, quindi crescita lenta ma liquidità altissima." },
  { name: "Radiant Greninja", set: "SWSH10: Astral Radiance", number: "046/189", type: "water", score: 66, liquidity: 90, growth: 55, demand: 70, forums: 65, risk: 40, raw: 3.25, roi1: "5-15%", roi3: "25-45%", roi5: "40-80%", why: "Carta giocata e amata dai collezionisti di Greninja; tiratura alta limita il potenziale." },
  { name: "Gardevoir ex", set: "Scarlet & Violet", number: "086/198", type: "psychic", score: 58, liquidity: 75, growth: 50, demand: 60, forums: 55, risk: 50, raw: 1.80, roi1: "0-10%", roi3: "15-35%", roi5: "30-60%", why: "Prezzo basso dopo l'uscita dal formato competitivo; dipende dall'interesse dei collezionisti." },
];
const EX_FLIP = [
  { name: "Light Toxtricity", set: "SWSH Black Star Promo", number: "SWSH137", type: "electric", raw: 6.15, psa10: 2499, psa9: 45.89, bgs10: 3249, cgc10: 387, gem_rate: 4, why: "Promo con PSA 10 rarissimi per problemi di stampa: il 10 vale centinaia di volte il raw, ma la probabilità è bassa." },
  { name: "Greninja [Gold Star]", set: "SWSH Black Star Promo", number: "SWSH144", type: "water", raw: 14.5, psa10: 1060, psa9: 62, bgs10: 1400, cgc10: 210, gem_rate: 9, why: "Promo Gold Star con forte richiesta dai fan di Greninja; centratura spesso difettosa." },
];
function scoreCls(n) { return n >= 75 ? "hi" : n >= 55 ? "mid" : "lo"; }
function barHTML(lab, v, risk) {
  const col = risk ? "var(--bad)" : v >= 75 ? "var(--good)" : v >= 50 ? "var(--warn)" : "var(--bad)";
  return `<div class="bar"><div class="lb"><span>${lab}</span><b>${Math.round(v)}</b></div><div class="tr"><i style="width:${clamp(v, 0, 100)}%;background:${col}"></i></div></div>`;
}
function renderMarket() {
  $("#m-tab-worth").setAttribute("aria-pressed", state.mTab === "worth");
  $("#m-tab-flip").setAttribute("aria-pressed", state.mTab === "flip");
  $("#m-worth").hidden = state.mTab !== "worth"; $("#m-flip").hidden = state.mTab !== "flip";
  $("#m-title").textContent = state.mTab === "worth" ? "Da comprare" : "Grade Flip";
  const wl = state.worth || EX_WORTH, wex = !state.worth;
  $("#w-go").disabled = state.worthBusy; $("#f-go").disabled = state.flipBusy;
  $("#w-state").innerHTML = state.worthBusy ? `<div class="notice info"><span class="spin"></span><span>${providerName()} sta analizzando liquidità, domanda e rischio…</span></div>`
    : state.worthErr ? `<div class="notice bad">${ICON.warn}<span>${esc(state.worthErr)}</span></div>`
    : wex ? `<div class="notice warn">${ICON.info}<span>Dati di esempio. Scegli gioco e fascia di prezzo e premi “Trova opportunità con AI”.</span></div>` : "";
  $("#w-list").innerHTML = wl.map((c, i) => `<div class="mk">
    <div class="mk-head"><div style="min-width:0"><div class="nm">${esc(c.name)}</div><div class="sub2">${esc(c.set)}${c.number ? " #" + esc(c.number) : ""}</div></div><span class="score ${scoreCls(c.score)}">${Math.round(c.score)}</span></div>
    <div class="mk-body">${artHTML(c)}<div class="bars">${barHTML("Liquidità", c.liquidity)}${barHTML("Crescita", c.growth)}${barHTML("Domanda", c.demand)}${barHTML("Community", c.forums)}${barHTML("Rischio", c.risk, true)}</div></div>
    <div class="money"><span class="eyebrow">Prezzo raw</span><div class="big">${fmt$(c.raw)}</div><span class="eyebrow">ROI stimato</span>
      <div class="roi"><div><span>1 ANNO</span><b>${esc(c.roi1)}</b></div><div><span>3 ANNI</span><b>${esc(c.roi3)}</b></div><div><span>5 ANNI</span><b>${esc(c.roi5)}</b></div></div></div>
    ${c.why ? `<p class="why">${esc(c.why)}</p>` : ""}
    <div class="row">${wex ? '<span class="tag-ex">esempio</span>' : ""}<button class="btn sm" data-act="mk-add" data-src="worth" data-i="${i}">Aggiungi al portfolio</button></div>
  </div>`).join("");

  const fl = state.flip || EX_FLIP, fex = !state.flip; const fee = Number($("#f-fee").value) || 0;
  $("#f-state").innerHTML = state.flipBusy ? `<div class="notice info"><span class="spin"></span><span>${providerName()} sta cercando carte con il miglior salto di valore da raw a graded…</span></div>`
    : state.flipErr ? `<div class="notice bad">${ICON.warn}<span>${esc(state.flipErr)}</span></div>`
    : fex ? `<div class="notice warn">${ICON.info}<span>Dati di esempio. Imposta i filtri e premi “Trova grade flip con AI”.</span></div>` : "";
  $("#f-list").innerHTML = fl.map((c, i) => {
    const raw = Number(c.raw) || 0, p10 = Number(c.psa10) || 0, p9 = Number(c.psa9) || 0, gem = clamp(Number(c.gem_rate) || 0, 0, 100) / 100;
    const profit = p10 - raw - fee; const mult = raw ? Math.round(p10 / raw) : 0;
    const ev = gem * p10 + (1 - gem) * p9 - raw - fee;
    const mini = (h, g, v) => `<div class="mini"><div class="case"><div class="hd">${h}</div>${artHTML(c)}</div><div class="gl">${h} ${g}</div><div class="pr">${v ? fmt$0(v) : "–"}</div></div>`;
    return `<div class="mk">
      <div class="mk-head"><div style="min-width:0"><div class="nm">${esc(c.name)} ${c.number ? "#" + esc(c.number) : ""}</div><div class="sub2">${esc(c.set || "")}</div></div><span class="score hi">${mult}X</span></div>
      <div class="flip-art">${artHTML(c)}</div>
      <div class="flip-row"><div class="flip-box"><span>RAW</span><b>${fmt$(raw)}</b></div><div class="arrow">${ICON.arrow}</div><div class="flip-box profit"><span>PROFITTO PSA 10</span><b>${profit >= 0 ? "+" : "−"}${fmt$0(Math.abs(profit))}</b></div></div>
      <div class="mini-slabs">${mini("PSA", 10, p10)}${mini("BGS", 10, c.bgs10)}${mini("CGC", 10, c.cgc10)}</div>
      <div class="hdr-row small"><span class="muted">PSA 9 <b class="mono" style="color:var(--fg)">${p9 ? fmt$(p9) : "–"}</b></span><span class="muted">Prob. PSA 10 <b class="mono" style="color:var(--fg)">${Math.round(gem * 100)}%</b></span></div>
      <div class="notice ${ev >= 0 ? "info" : "warn"}" style="font-size:13px"><span>Valore atteso dopo il grading (con costo $${fee}): <b class="mono" style="color:${ev >= 0 ? "var(--good)" : "var(--bad)"}">${ev >= 0 ? "+" : "−"}${fmt$(Math.abs(ev))}</b></span></div>
      ${c.why ? `<p class="why">${esc(c.why)}</p>` : ""}
      <div class="row">${fex ? '<span class="tag-ex">esempio</span>' : ""}<button class="btn sm" data-act="mk-add" data-src="flip" data-i="${i}">Aggiungi al portfolio</button></div>
    </div>`;
  }).join("");
}
async function findWorth() {
  const ai = await getAI(); if (!ai) { state.worthErr = NO_KEY; renderMarket(); return; }
  state.worthBusy = true; state.worthErr = ""; renderMarket();
  try {
    const r = await ai.s.json(`Sei un analista del mercato delle carte collezionabili. Gioco: ${$("#w-game").value}. Fascia di prezzo raw: ${$("#w-price").value} (USD).
Proponi 5 carte singole realmente esistenti, acquistabili raw Near Mint in quella fascia, con il miglior rapporto potenziale/rischio per un collezionista nel lungo periodo. Usa le tue conoscenze di mercato: non hai prezzi in tempo reale, quindi stima con prudenza.
Per ognuna: liquidity, growth, demand, forums (attenzione della community), risk da 0 a 100; score complessivo 0-100; raw prezzo USD; ROI stimati come intervalli percentuali; why = una frase in italiano.
Rispondi solo con un array JSON, ordinato per score decrescente: [{"name":"Charizard","set":"Pokémon GO","number":"010/078","type":"fire","score":72,"liquidity":100,"growth":60,"demand":80,"forums":75,"risk":45,"raw":3.94,"roi1":"10-20%","roi3":"30-60%","roi5":"50-100%","why":"..."}]
type tra fire, water, grass, electric, psychic, fighting, dark, steel, dragon, fairy, normal (per giochi non Pokémon scegli il colore più vicino).`, { modelTier: "default" });
    const arr = (Array.isArray(r) ? r : []).filter(x => x && x.name).map(x => ({ ...x, game: $("#w-game").value, score: +x.score || 0, liquidity: +x.liquidity || 0, growth: +x.growth || 0, demand: +x.demand || 0, forums: +x.forums || 0, risk: +x.risk || 0, raw: +x.raw || 0 }));
    if (arr.length) state.worth = arr; else state.worthErr = "Nessun risultato. Prova un'altra fascia di prezzo.";
  } catch (e) { state.worthErr = aiErr(e); }
  state.worthBusy = false; renderMarket();
}
async function findFlip() {
  const ai = await getAI(); if (!ai) { state.flipErr = NO_KEY; renderMarket(); return; }
  state.flipBusy = true; state.flipErr = ""; renderMarket();
  try {
    const r = await ai.s.json(`Sei un esperto di grading e mercato delle carte collezionabili. Categoria: ${$("#f-game").value}. Era: ${$("#f-era").value}. Prezzo raw: ${$("#f-raw").value} (USD).
Trova 5 carte singole realmente esistenti in quella fascia raw dove il salto di valore tra raw e PSA 10 è più grande. Stima con le tue conoscenze di mercato (non hai prezzi in tempo reale): raw, psa10, psa9, bgs10 (Black Label escluso), cgc10 in USD, e gem_rate = percentuale stimata di copie che prendono PSA 10 (0-100). why = una frase in italiano sul perché del salto e sui rischi.
Rispondi solo con un array JSON ordinato per psa10/raw decrescente: [{"name":"Light Toxtricity","set":"SWSH Black Star Promo","number":"SWSH137","type":"electric","raw":6.15,"psa10":2499,"psa9":45.89,"bgs10":3249,"cgc10":387,"gem_rate":4,"why":"..."}]
type tra fire, water, grass, electric, psychic, fighting, dark, steel, dragon, fairy, normal.`, { modelTier: "default" });
    const arr = (Array.isArray(r) ? r : []).filter(x => x && x.name).map(x => ({ ...x, game: $("#f-game").value }));
    if (arr.length) state.flip = arr; else state.flipErr = "Nessun risultato. Prova un'altra fascia.";
  } catch (e) { state.flipErr = aiErr(e); }
  state.flipBusy = false; renderMarket();
}

/* ---------------- header + nav ---------------- */
function renderSync() {
  const s = $("#sync"); if (!s) return;
  if (activeKey()) { s.className = "sync ok"; s.textContent = "● " + providerName(); }
  else { s.className = "sync local"; s.textContent = "● AI spenta"; }
}
function go(view, push = true) {
  state.view = view;
  $$(".view[data-view]").forEach(v => v.hidden = v.dataset.view !== view);
  $$(".tabbar button").forEach(b => { if (b.dataset.go === view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (push && location.hash !== "#" + view) { try { history.replaceState(null, "", "#" + view); } catch (e) { location.hash = view; } }
  if (view === "centering") requestAnimationFrame(drawCent);
  window.scrollTo(0, 0);
}
function renderAll() { renderSync(); renderGrade(); renderSlabs(); renderPortfolio(); renderMarket(); }

/* ---------------- modal / toast ---------------- */
function openModal(html) { $("#modal-box").innerHTML = html; $("#modal").hidden = false; }
function closeModal() { $("#modal").hidden = true; $("#modal-box").innerHTML = ""; }
$("#modal").addEventListener("click", e => { if (e.target.id === "modal" || e.target.closest("[data-close]")) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });
let tt; function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2600); }

const HELP = {
  standards: `<div class="hdr-row"><h2>Criteri PSA · Beckett · CGC</h2><button class="icon-btn" data-close aria-label="Chiudi">✕</button></div>
    <p class="small">I quattro subgradi seguono la scala Beckett. Il voto PSA e CGC parte dalle stesse condizioni e viene limitato dalle soglie di centratura di ciascuna casa. Il voto finale Beckett pesa molto il subgrado più basso: non supera mai il più basso di oltre un punto.</p>
    <div class="std-table"><table><thead><tr><th>Centratura fronte</th><th>PSA</th><th>Beckett</th><th>CGC</th></tr></thead><tbody>
      <tr><td>50/50</td><td>10</td><td>10</td><td>Pristine 10</td></tr>
      <tr><td>50/50 + 55/45</td><td>10</td><td>9.5</td><td>10</td></tr>
      <tr><td>55/45</td><td>10</td><td>9</td><td>10</td></tr>
      <tr><td>60/40</td><td>9</td><td>8.5</td><td>9</td></tr>
      <tr><td>65/35</td><td>8</td><td>8</td><td>8</td></tr>
      <tr><td>70/30</td><td>7</td><td>7</td><td>7</td></tr>
      <tr><td>75/25</td><td>6</td><td>7</td><td>6</td></tr>
      <tr><td>85/15</td><td>5</td><td>6</td><td>4.5</td></tr>
      <tr><td>90/10</td><td>3</td><td>5</td><td>3.5</td></tr>
    </tbody></table></div>
    <div class="std-table"><table><thead><tr><th>Centratura retro</th><th>PSA</th><th>Beckett</th><th>CGC</th></tr></thead><tbody>
      <tr><td>60/40</td><td>10</td><td>10</td><td>10</td></tr>
      <tr><td>70/30</td><td>10</td><td>9</td><td>10</td></tr>
      <tr><td>75/25</td><td>10</td><td>8.5</td><td>10</td></tr>
      <tr><td>90/10</td><td>9</td><td>8</td><td>9</td></tr>
    </tbody></table></div>
    <p class="small"><b>Beckett Black Label</b>: tutti e quattro i subgradi a 10. <b>Pristine 10</b>: tre 10 e un 9.5. <b>CGC Pristine 10</b>: carta perfetta con centratura 50/50. <b>PSA 10</b>: angoli perfetti a occhio nudo, nessuna macchia, lucentezza originale.</p>
    <p class="small muted">Le soglie PSA per i voti sotto il 9 sono approssimate: PSA tiene conto anche dell'aspetto generale. Fonti: <a href="https://www.beckett.com/grading/scale" target="_blank" rel="noopener">Beckett grading scale</a>, <a href="https://www.cgccards.com/card-grading/grading-scale/" target="_blank" rel="noopener">CGC grading scale</a>, <a href="https://www.psacard.com/gradingstandards" target="_blank" rel="noopener">PSA grading standards</a>.</p>
    <button class="btn primary block" data-close>Ho capito</button>`,
  centering: `<h2>Come misurare la centratura</h2>
    <p>1. Trascina le maniglie <b style="color:var(--outer)">arancioni</b> sui 4 angoli esterni della carta. Funziona anche con foto un po' storte: il calcolo corregge la prospettiva.</p>
    <p>2. Premi “Passa all'interno” e porta le maniglie <b style="color:var(--inner)">verdi</b> sugli angoli del riquadro stampato, dove finisce il bordo giallo (o blu sul retro).</p>
    <p>3. “Analizza centratura” calcola i rapporti sinistra/destra e alto/basso. Mentre trascini, la lente ti mostra il punto ingrandito.</p>
    <p class="small muted">Il risultato mostra il voto massimo PSA e CGC e il subgrado Beckett per quella centratura.</p>
    <button class="btn primary block" data-close>Ho capito</button>`,
  market: `<h2>Come leggere i punteggi</h2>
    <p><b>Liquidità</b>: quanto è facile rivenderla in fretta. <b>Crescita</b>: andamento del prezzo e potenziale. <b>Domanda</b>: quanti la cercano. <b>Community</b>: quanto se ne parla nei forum e social. <b>Rischio</b>: ristampe, calo di interesse, tiratura alta (più basso è meglio).</p>
    <p><b>Grade Flip</b> mostra quanto vale la carta gradata rispetto al raw. Il moltiplicatore è PSA 10 ÷ raw. Il valore atteso tiene conto della probabilità reale di prendere un 10.</p>
    <p class="small muted">Sono stime dell'AI basate su conoscenze di mercato, non prezzi in tempo reale né consulenza finanziaria. Controlla i venduti recenti su eBay, TCGplayer, Cardmarket o PriceCharting prima di comprare.</p>
    <button class="btn primary block" data-close>Ho capito</button>`
};


/* ---------------- settings ---------------- */
function openSettings() {
  const g = settings.provider === "gemini";
  openModal(`<div class="hdr-row"><h2>Impostazioni</h2><button class="icon-btn" data-close aria-label="Chiudi">✕</button></div>
    <div class="field-wrap"><label>Intelligenza artificiale</label>
      <div class="seg" role="group" aria-label="Fornitore AI">
        <button data-set="prov-gemini" aria-pressed="${g}">Gemini · gratis</button>
        <button data-set="prov-claude" aria-pressed="${!g}">Claude · pagamento</button>
      </div></div>
    <div id="set-gemini" ${g ? "" : "hidden"} style="display:flex;flex-direction:column;gap:12px">
      <div class="field-wrap"><label for="set-gkey">Chiave API di Gemini</label>
        <input id="set-gkey" class="field mono" type="password" autocomplete="off" spellcheck="false" placeholder="AIza..." value="${esc(settings.gkey || "")}"></div>
      <p class="small muted" style="margin:0">Creala gratis su <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> › Create API key. Il piano gratuito ha un limite di richieste al minuto e al giorno.</p>
      <div class="field-wrap"><label for="set-gmodel">Modello Gemini</label>
        <input id="set-gmodel" class="field mono" autocomplete="off" spellcheck="false" value="${esc(settings.gmodel || "gemini-flash-latest")}"></div>
      <p class="small muted" style="margin:0">Lascia <span class="mono">gemini-flash-latest</span> se non sai cosa scegliere: punta sempre all'ultimo modello Flash.</p>
    </div>
    <div id="set-claude" ${g ? "hidden" : ""} style="display:flex;flex-direction:column;gap:12px">
      <div class="field-wrap"><label for="set-key">Chiave API di Claude</label>
        <input id="set-key" class="field mono" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-..." value="${esc(settings.key || "")}"></div>
      <p class="small muted" style="margin:0">La crei su <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> › API Keys. Si paga a consumo con credito prepagato, separato dall'abbonamento Claude.</p>
      <div class="field-wrap"><label for="set-model">Modello per il grading standard</label>
        <select id="set-model" class="field">
          <option value="claude-sonnet-5-5" ${settings.model === "claude-sonnet-5-5" ? "selected" : ""}>Claude Sonnet 5.5 · bilanciato</option>
          <option value="claude-opus-5-5" ${settings.model === "claude-opus-5-5" ? "selected" : ""}>Claude Opus 5.5 · più accurato</option>
          <option value="claude-haiku-5-5" ${settings.model === "claude-haiku-5-5" ? "selected" : ""}>Claude Haiku 5.5 · più veloce ed economico</option>
        </select></div>
    </div>
    <p class="small muted" style="margin:0">Le chiavi restano salvate solo su questo telefono e vengono inviate solo a Google (Gemini) o ad Anthropic (Claude).</p>
    <div id="set-msg"></div>
    <div class="row"><button class="btn primary" data-set="save">Salva</button><button class="btn" data-set="test">Prova la chiave</button></div>
    ${(settings.key || settings.gkey) ? `<button class="btn ghost tone-bad" data-set="forget">Rimuovi le chiavi da questo telefono</button>` : ""}
    <details class="manual"><summary><span>Dati dell'app</span></summary>
      <p class="small muted" style="margin:10px 0">Slab e portfolio sono salvati solo su questo telefono (${state.items.size} elementi). Se cancelli i dati del browser li perdi.</p>
      <div class="row"><button class="btn sm" data-set="export">Esporta backup</button><label class="btn sm" for="set-import">Importa backup</label><input type="file" id="set-import" accept="application/json" class="sr"></div>
      <div style="margin-top:10px">${state.confirmWipe ? `<button class="btn sm tone-bad" data-set="wipe2">Conferma: cancella tutto</button>` : `<button class="btn sm ghost tone-bad" data-set="wipe">Cancella tutti i dati</button>`}</div>
    </details>`);
  $("#set-import").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text()); let n = 0;
      for (const [id, v] of Object.entries(data.items || {})) { if (v && v.kind) { Store.put(id, v); n++; } }
      renderAll(); toast(`${n} elementi importati`); closeModal();
    } catch (err) { toast("File di backup non valido"); }
  });
}
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-set]"); if (!b) return;
  const a = b.dataset.set, msg = $("#set-msg");
  const readForm = () => {
    settings.key = $("#set-key").value.trim(); settings.model = $("#set-model").value;
    settings.gkey = $("#set-gkey").value.trim(); settings.gmodel = $("#set-gmodel").value.trim() || "gemini-flash-latest";
    settings.provider = $('[data-set="prov-gemini"]').getAttribute("aria-pressed") === "true" ? "gemini" : "claude";
  };
  if (a === "prov-gemini" || a === "prov-claude") {
    const g = a === "prov-gemini";
    $('[data-set="prov-gemini"]').setAttribute("aria-pressed", g); $('[data-set="prov-claude"]').setAttribute("aria-pressed", !g);
    $("#set-gemini").hidden = !g; $("#set-claude").hidden = g; msg.innerHTML = ""; return;
  }
  if (a === "save") { readForm(); geminiWorking = ""; geminiList = null; saveSettings(settings); renderSync(); closeModal(); toast(activeKey() ? `Impostazioni salvate · AI: ${providerName()}` : "Salvato · manca la chiave API"); }
  else if (a === "test") {
    readForm(); geminiWorking = ""; geminiList = null; msg.innerHTML = `<div class="notice info"><span class="spin"></span><span>Provo la chiave…</span></div>`;
    try { await aiCall("Rispondi solo con: OK", { modelTier: "quick", maxTokens: 16 }); msg.innerHTML = `<div class="notice info" style="color:var(--good)">Chiave ${providerName()} funzionante. Ricorda di premere Salva.</div>`; }
    catch (err) { msg.innerHTML = `<div class="notice bad">${ICON.warn}<span>${esc(aiErr(err))}</span></div>`; }
  }
  else if (a === "forget") { settings.key = ""; settings.gkey = ""; saveSettings(settings); renderSync(); closeModal(); toast("Chiavi rimosse da questo telefono"); }
  else if (a === "export") {
    const blob = new Blob([JSON.stringify({ app: "gradscan", v: 1, t: Date.now(), items: Object.fromEntries(state.items) })], { type: "application/json" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = `gradscan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(el); el.click(); el.remove(); toast("Backup scaricato");
  }
  else if (a === "wipe") { state.confirmWipe = true; openSettings(); }
  else if (a === "wipe2") { state.confirmWipe = false; state.items = new Map(); state.result = null; try { await IDB.clear(); } catch (err) {} renderAll(); closeModal(); toast("Dati cancellati"); }
});

/* ---------------- events ---------------- */
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]"); if (g) { go(g.dataset.go); return; }
  const h = e.target.closest("[data-help]"); if (h) { openModal(HELP[h.dataset.help]); return; }
  const r = e.target.closest("[data-range]"); if (r) { state.range = r.dataset.range; renderPortfolio(); return; }
  const a = e.target.closest("[data-act]"); if (!a) { if (state.confirmDel || state.confirmHold) { state.confirmDel = state.confirmHold = null; renderSlabs(); renderPortfolio(); } return; }
  const id = a.dataset.id, act = a.dataset.act, s = id ? Store.get(id) : null;
  if (act !== "del") state.confirmDel = null;
  if (act !== "hold-del" && act !== "qty-") state.confirmHold = null;
  switch (act) {
    case "open-slab": state.slabTab = s?.saved ? "saved" : "history"; renderSlabs(); go("slabs"); break;
    case "to-center": useSideImage("front"); go("centering"); break;
    case "slab-to-pf": if (s) { addHolding({ name: s.name, set: s.set, number: s.number, game: s.game, variant: "Graded", type: s.type, price: 0 }); toast("Aggiunto: imposta il prezzo nel portfolio"); } break;
    case "apply-cent": {
      const cur = state.result && Store.get(state.result); if (!cur || !Object.keys(cent.results).length) break;
      const c = { ...(cur.cent || { fLR: null, fTB: null, bLR: null, bTB: null }), measured: true };
      if (cent.results.front) { c.fLR = cent.results.front.lrW; c.fTB = cent.results.front.tbW; }
      if (cent.results.back) { c.bLR = cent.results.back.lrW; c.bTB = cent.results.back.tbW; }
      const sc = centeringFromRatios(c) ?? combinedCentScore();
      const sub = { centering: sc, corners: cur.corners, edges: cur.edges, surface: cur.surface }; const fin = finalScore(sub);
      Store.put(state.result, { ...cur, centering: sc, final: fin, label: gradeLabel(fin), cent: c });
      renderAll(); toast(`Centratura ${f1(sc)} applicata · voto ${f1(fin)}`); break;
    }
    case "save": if (s) {
      if (!s.saved && Store.all("slab").filter(x => x.saved).length >= SAVED_MAX) { toast("Hai già 100 slab salvati: eliminane uno"); break; }
      Store.put(id, { ...s, saved: !s.saved }); renderAll(); toast(s.saved ? "Tolto dai salvati" : "Slab salvato");
    } break;
    case "zoom": if (s) zoomSlab(s); break;
    case "share": if (s) shareSlab(s); break;
    case "del": if (state.confirmDel === id) { Store.del(id); if (state.result === id) state.result = null; state.confirmDel = null; renderAll(); toast("Slab eliminato"); } else { state.confirmDel = id; renderSlabs(); } break;
    case "qty+": if (s) { Store.put(id, { ...s, qty: (s.qty || 0) + 1 }); recordSnapshot(); renderPortfolio(); } break;
    case "qty-": if (s) { if ((s.qty || 0) <= 1) { state.confirmHold = id; renderPortfolio(); } else { Store.put(id, { ...s, qty: s.qty - 1 }); recordSnapshot(); renderPortfolio(); } } break;
    case "hold-del": Store.del(id); state.confirmHold = null; recordSnapshot(); renderPortfolio(); toast("Rimosso dal portfolio"); break;
    case "price-edit": state.editPrice = id; renderPortfolio(); const inp = $("#price-" + id); inp?.focus(); inp?.select(); break;
    case "price-ok": { const v = parseFloat(String($("#price-" + id)?.value || "").replace(",", ".")); if (s && v >= 0) { Store.put(id, { ...s, price: Math.round(v * 100) / 100 }); recordSnapshot(); } state.editPrice = null; renderPortfolio(); break; }
    case "to-search": state.pTab = "search"; renderPortfolio(); break;
    case "load-ex": loadExamplePortfolio(); break;
    case "clear-ex": clearExamples(); break;
    case "refresh-prices": refreshPrices(); break;
    case "add-res": { const x = state.searchRes[+a.dataset.i]; if (x) addHolding(x); break; }
    case "mk-add": { const src = a.dataset.src === "worth" ? (state.worth || EX_WORTH) : (state.flip || EX_FLIP); const x = src[+a.dataset.i]; if (x) addHolding({ name: x.name, set: x.set, number: x.number, game: x.game || "Pokémon", variant: "Normal", type: x.type, price: x.raw }); break; }
  }
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.classList.contains("price-edit")) { const id = e.target.id.slice(6); document.querySelector(`[data-act="price-ok"][data-id="${id}"]`)?.click(); } });

for (const side of ["front", "back"]) {
  $("#in-" + side).addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) intakeFile(f, side); });
  $("#cam-" + side).addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) intakeFile(f, side); });
  const slot = $("#slot-" + side);
  slot.addEventListener("dragover", e => { e.preventDefault(); slot.classList.add("drag"); });
  slot.addEventListener("dragleave", () => slot.classList.remove("drag"));
  slot.addEventListener("drop", e => { e.preventDefault(); slot.classList.remove("drag"); const f = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith("image/")); if (f) intakeFile(f, side); });
}
document.addEventListener("paste", e => {
  if (state.view !== "grade") return;
  const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith("image/"));
  if (f) { e.preventDefault(); intakeFile(f, state.front ? "back" : "front"); }
});
$("#btn-settings").addEventListener("click", openSettings);
const darkMQ = matchMedia("(prefers-color-scheme: dark)");
const effectiveTheme = () => document.documentElement.dataset.theme || (darkMQ.matches ? "dark" : "light");
function syncThemeUI() {
  const t = effectiveTheme();
  $("#btn-theme").setAttribute("aria-label", t === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro");
  $$('meta[name="theme-color"]').forEach(m => { m.removeAttribute("media"); m.setAttribute("content", t === "dark" ? "#0B0F14" : "#F2F4F7"); });
  if (state.view === "centering") drawCent();
}
$("#btn-theme").addEventListener("click", () => {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("gml-theme", next); } catch (e) {}
  syncThemeUI(); toast(next === "dark" ? "Tema scuro" : "Tema chiaro");
});
darkMQ.addEventListener?.("change", syncThemeUI);
syncThemeUI();
$("#btn-scan").addEventListener("click", () => startScan("front", true));
document.addEventListener("click", e => { const b = e.target.closest("[data-scan]"); if (b) startScan(b.dataset.scan, false); });
$("#btn-analyze").addEventListener("click", () => { if (state.busy) state.ctl?.abort(); else analyze(); });
$("#btn-to-center").addEventListener("click", () => { useSideImage("front"); go("centering"); });
["centering", "corners", "edges", "surface"].forEach(k => $("#m-" + k).addEventListener("input", e => $("#m-" + k + "-v").textContent = f1(e.target.value)));
$("#btn-manual").addEventListener("click", manualSlab);

$("#c-file").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const url = URL.createObjectURL(f);
  try { const img = await loadImg(url); setCentImage(img, cent.side); } catch (err) { toast("Formato immagine non supportato"); }
});
$("#c-side-front").addEventListener("click", () => useSideImage("front"));
$("#c-side-back").addEventListener("click", () => useSideImage("back"));
$("#c-reset").addEventListener("click", () => { if (!cent.img) return; const q = defaultQuads(cent.img.naturalWidth, cent.img.naturalHeight); cent[cent.mode] = q[cent.mode]; cent.result = null; renderCentering(); });
$("#c-switch").addEventListener("click", () => { cent.mode = cent.mode === "outer" ? "inner" : "outer"; renderCentering(); });
$("#c-analyze").addEventListener("click", analyzeCentering);

$("#s-tab-history").addEventListener("click", () => { state.slabTab = "history"; renderSlabs(); });
$("#s-tab-saved").addEventListener("click", () => { state.slabTab = "saved"; renderSlabs(); });
$("#btn-resync").addEventListener("click", async () => { if (Store.mode === "idb") { try { state.items = await IDB.all(); } catch (e) {} } renderAll(); toast("Dati ricaricati"); });

$("#p-tab-pf").addEventListener("click", () => { state.pTab = "pf"; renderPortfolio(); });
$("#p-tab-search").addEventListener("click", () => { state.pTab = "search"; renderPortfolio(); });
$("#ps-go").addEventListener("click", doSearch);
$("#ps-q").addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });
$("#pm-add").addEventListener("click", () => {
  const name = $("#pm-name").value.trim(); const price = parseFloat($("#pm-price").value.replace(",", "."));
  if (!name) { toast("Inserisci il nome della carta"); return; }
  addHolding({ name, set: $("#pm-set").value.trim(), variant: $("#pm-var").value, price: price >= 0 ? price : 0, game: $("#ps-game").value });
  $("#pm-name").value = $("#pm-set").value = $("#pm-price").value = "";
});

$("#m-tab-worth").addEventListener("click", () => { state.mTab = "worth"; renderMarket(); });
$("#m-tab-flip").addEventListener("click", () => { state.mTab = "flip"; renderMarket(); });
$("#w-go").addEventListener("click", findWorth);
$("#f-go").addEventListener("click", findFlip);
$("#f-fee").addEventListener("input", () => renderMarket());

for (const sel of ["#ps-game", "#w-game", "#f-game"]) $(sel).innerHTML = GAMES.map(g => `<option>${g}</option>`).join("");

/* ---------------- boot ---------------- */
const VIEWS = ["grade", "centering", "slabs", "portfolio", "market"];
const fromHash = () => { const h = location.hash.slice(1); return VIEWS.includes(h) ? h : "grade"; };
window.addEventListener("hashchange", () => go(fromHash(), false));
go(fromHash(), false);
renderAll();
Store.init();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("./sw.js").catch(() => {});
})();
