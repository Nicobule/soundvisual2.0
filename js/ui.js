"use strict";
/* ==========================================================================
   Interfaccia: costruisce schede e controlli e li collega al motore (engine.js, fx.js).
   Ogni controllo è descritto una volta sola, qui: slider, scelte, interruttori e
   schede degli effetti. Su telefono le schede stanno in basso (pannello a scomparsa).
   ========================================================================== */

const app = $("app"), stage = $("stage"), panelsEl = $("panels"), tabsEl = $("tabs");
const isMobile = () => matchMedia("(max-width: 899px)").matches;
// Pannello a scomparsa in basso: solo su schermi stretti e non di taglio (lì il pannello sta di lato)
const sheetMode = () => isMobile() && !matchMedia("(max-height: 520px) and (orientation: landscape)").matches;

/* ---------- Piccoli costruttori di elementi ---------- */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}
const svg = (inner, vb = "0 0 24 24", extra = "") => h("span", { html: `<svg viewBox="${vb}" aria-hidden="true" ${extra}>${inner}</svg>` }).firstChild;

const fmt = {
  n2: v => (+v).toFixed(2), n1: v => (+v).toFixed(1), int: v => String(Math.round(v)),
  pct: v => Math.round(v * 100) + "%", x: v => (+v).toFixed(1) + "×",
  signed: v => (v > 0 ? "+" : "") + Math.round(v * 100) + "%", deg: v => Math.round(v) + "°",
};

// Slider con nome e valore; get/set collegano il controllo al motore
function slider({ label, min, max, step = 0.01, get, set, f = fmt.n2, after }) {
  const out = h("output"), inp = h("input", { type: "range", min, max, step });
  const paint = () => { out.textContent = f(+inp.value); inp.style.setProperty("--p", (inp.value - inp.min) / (inp.max - inp.min) * 100 + "%"); };
  inp.value = get();
  paint();
  inp.addEventListener("input", () => { set(+inp.value); paint(); needsDraw = true; after && after(); });
  inp.refresh = () => { inp.value = get(); paint(); };
  return h("label", { class: "row" }, h("span", { class: "lbl" }, label), out, inp);
}
// Scelta tra poche voci (una sola attiva)
function seg({ options, get, set, cls = "", label }) {
  const box = h("div", { class: "seg " + cls, role: "group", "aria-label": label });
  const btns = options.map(([value, text, extra]) => {
    const b = h("button", { type: "button", "aria-pressed": String(get() === value), "aria-label": extra && extra.aria }, extra && extra.node ? extra.node : text);
    b.addEventListener("click", () => { set(value); show(); needsDraw = true; });
    box.append(b);
    return [value, b];
  });
  const show = () => btns.forEach(([v, b]) => b.setAttribute("aria-pressed", String(get() === v)));
  box.refresh = show;
  return box;
}
function row(label, ...kids) { return h("div", { class: "row text" }, h("span", { class: "lbl" }, label), ...kids); }
function sec(title, note, ...kids) {
  return h("section", { class: "sec" }, title && h("h2", {}, title), note && h("p", { class: "note" }, note), ...kids);
}

/* ---------- Schede ---------- */
const TAB_ICONS = {
  stile: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  colore: '<path d="M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0c0-4.3 6-10.5 6-10.5z"/>',
  effetti: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  moto: '<path d="M3 12c2.2-6.5 4.3-6.5 6 0s3.8 6.5 6 0 3.6-6.5 6 0"/>',
  altro: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
};
const TABS = [["stile", "Stile"], ["colore", "Colore"], ["effetti", "Effetti"], ["moto", "Movimento"], ["altro", "Avanzate"]];
let activeTab = "stile";
const panels = {}, tabBtns = {};
function setTab(name, fromTap) {
  if (fromTap && sheetMode() && name === activeTab && app.dataset.sheet === "open") app.dataset.sheet = "closed";
  else { activeTab = name; app.dataset.sheet = "open"; }
  for (const [id] of TABS) {
    const on = id === activeTab;
    tabBtns[id].setAttribute("aria-selected", String(on));
    tabBtns[id].tabIndex = on ? 0 : -1;
    panels[id].hidden = !on;
  }
}
for (const [id, text] of TABS) {
  tabBtns[id] = h("button", { type: "button", role: "tab", id: "tab-" + id, "aria-controls": "panel-" + id, onclick: () => setTab(id, true) },
    svg(TAB_ICONS[id]), h("span", { class: "t" }, text));
  tabsEl.append(tabBtns[id]);
  panels[id] = h("div", { class: "panel", role: "tabpanel", id: "panel-" + id, "aria-labelledby": "tab-" + id, hidden: true });
  panelsEl.append(panels[id]);
}
tabsEl.addEventListener("keydown", e => {   // frecce tra le schede
  const i = TABS.findIndex(([id]) => id === activeTab);
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    const nx = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length][0];
    setTab(nx);
    tabBtns[nx].focus();
  }
});

/* ---------- Scheda Stile ---------- */
const S_ICONS = {
  ascii: '<text x="15" y="17" text-anchor="middle">@#:</text>',
  braille: '<text x="15" y="18" text-anchor="middle">⣿⠶</text>',
  testo: '<text x="15" y="17" text-anchor="middle">Aa</text>',
  contorni: '<text x="15" y="17" text-anchor="middle">/\\|</text>',
  matrix: '<text x="15" y="17" text-anchor="middle">ｱ0</text>',
  emoji: '<text x="15" y="18" text-anchor="middle" style="font-size:16px">🌗</text>',
  retino: '<g fill="currentColor" stroke="none"><circle cx="5.5" cy="12" r="2"/><circle cx="14" cy="12" r="3.6"/><circle cx="24" cy="12" r="5.2"/></g>',
  dithering: '<g fill="currentColor" stroke="none"><rect x="4" y="4" width="5" height="5"/><rect x="14" y="4" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/><rect x="19" y="9" width="5" height="5"/><rect x="4" y="14" width="5" height="5"/><rect x="14" y="14" width="5" height="5"/></g>',
  pixel: '<g fill="currentColor" stroke="none"><rect x="4" y="4" width="7" height="7" opacity=".35"/><rect x="12" y="4" width="7" height="7" opacity=".7"/><rect x="20" y="4" width="6" height="7"/><rect x="4" y="12" width="7" height="7"/><rect x="12" y="12" width="7" height="7" opacity=".35"/><rect x="20" y="12" width="6" height="7" opacity=".7"/></g>',
  tratteggio: '<path d="M5 19 13 5M11 19 19 5M17 19 25 5M5 6l8 13M11 6l8 13"/>',
  puntini: '<g fill="currentColor" stroke="none"><circle cx="6" cy="8" r="1.4"/><circle cx="12" cy="15" r="1.4"/><circle cx="16" cy="6" r="1.4"/><circle cx="22" cy="13" r="1.4"/><circle cx="9" cy="19" r="1.4"/><circle cx="24" cy="19" r="1.4"/></g>',
  linee: '<path d="M3 8c3-5 5-5 8 0s5 5 8 0 4-3 8 0M3 17c3-5 5-5 8 0s5 5 8 0 4-3 8 0"/>',
  croci: '<path d="M7 12h6M10 9v6M18 7h6M21 4v6M19 18h6M22 15v6"/>',
  mosaico: '<g fill="currentColor" stroke="none"><rect x="4" y="4" width="10" height="7" rx="1.5"/><rect x="16" y="4" width="10" height="7" rx="1.5" opacity=".55"/><rect x="4" y="13" width="10" height="7" rx="1.5" opacity=".55"/><rect x="16" y="13" width="10" height="7" rx="1.5"/></g>',
  esagoni: '<path d="M8 4.5 12 7v4.6L8 14 4 11.6V7zM18 4.5 22 7v4.6L18 14l-4-2.4V7zM13 13.5 17 16v4.6L13 23l-4-2.4V16z" transform="translate(2 -2) scale(.95)"/>',
  voronoi: '<path d="M4 4 12 3l5 6-3 8-9 2zM17 9l9-1M14 17l12 3M12 3l-1 7M5 19l4-5"/>',
  pennellate: '<path d="M5 18c4-3 7-9 11-12M11 20c4-3 7-8 11-11M17 20c3-2 5-5 8-8"/>',
};
const STYLE_META = [
  ["Caratteri", [["ascii", "ASCII"], ["braille", "Braille"], ["testo", "Testo"], ["contorni", "Contorni"], ["matrix", "Matrix"], ["emoji", "Emoji"]]],
  ["Forme", [["retino", "Retino"], ["dithering", "Dithering"], ["pixel", "Pixel"], ["tratteggio", "Tratteggio"], ["puntini", "Puntini"], ["linee", "Linee"], ["croci", "Croci"], ["mosaico", "Mosaico"], ["esagoni", "Esagoni"]]],
  ["Artistici", [["voronoi", "Vetrata"], ["pennellate", "Pennellate"]]],
];
const STYLE_LABEL = Object.fromEntries(STYLE_META.flatMap(([, list]) => list));
const styleTiles = {};
const styleOpts = {};
let colsRow;

function buildStile() {
  const p = panels.stile;
  const groups = STYLE_META.map(([title, list], gi) => h("div", {},
    h("p", { class: "sub" }, title),
    h("div", { class: "tiles" }, list.map(([id, name]) => {
      const b = h("button", { type: "button", class: "tile", "aria-pressed": "false", title: name + (STYLE_ORDER.indexOf(id) < 9 ? "  (tasto " + (STYLE_ORDER.indexOf(id) + 1) + ")" : "") },
        svg(S_ICONS[id], "0 0 30 24"), name);
      b.addEventListener("click", () => setStyle(id));
      styleTiles[id] = b;
      return b;
    }))));
  p.append(sec("Stile", null, groups));

  // Opzioni che compaiono solo con lo stile corrispondente
  const phrase = h("input", { type: "text", value: "ASCII ART", maxlength: 200, spellcheck: "false", "aria-label": "Frase" });
  phrase.addEventListener("input", () => { const c = [...phrase.value.replace(/\s+/g, "")]; TEXT = c.length ? c : [..."ASCII"]; needsDraw = true; });
  const ramp = h("input", { type: "text", value: EMOJI.join(""), spellcheck: "false", "aria-label": "Rampa di emoji" });
  const setRamp = s => { const c = [...s.replace(/\s+/g, "")]; if (c.length > 1) { EMOJI = c; needsDraw = true; } };
  ramp.addEventListener("input", () => setRamp(ramp.value));
  const presets = h("div", { class: "seg small", role: "group", "aria-label": "Rampe pronte" },
    [["Lune", "🌑🌘🌗🌖🌕"], ["Quadrati", "⬛🟫🟥🟧🟨⬜"], ["Frutta", "🫐🍇🍎🍊🍋"]].map(([name, set]) => {
      const b = h("button", { type: "button" }, name);
      b.addEventListener("click", () => { ramp.value = set; setRamp(set); });
      return b;
    }));
  styleOpts.testo = h("div", { class: "opts" }, row("Frase che compone l'immagine", phrase));
  styleOpts.contorni = h("div", { class: "opts" }, slider({ label: "Soglia dei contorni", min: 0.02, max: 0.6, step: 0.01, get: () => EDGE, set: v => { EDGE = v; } }));
  styleOpts.pixel = h("div", { class: "opts" }, slider({ label: "Livelli di colore", min: 2, max: 8, step: 1, get: () => LEVELS, set: v => { LEVELS = v; }, f: fmt.int }));
  styleOpts.emoji = h("div", { class: "opts" }, row("Dal buio al chiaro", ramp), presets);
  styleOpts.voronoi = h("div", { class: "opts" }, slider({ label: "Grandezza delle tessere", min: 1.5, max: 8, step: 0.1, get: () => VORO, set: v => { VORO = v; }, f: fmt.n1 }));
  colsRow = slider({ label: "Quantità di segni", min: 20, max: 300, step: 1, get: () => colsPending || D.w, set: setCols, f: fmt.int });
  p.append(sec("Dettaglio", null,
    colsRow,
    slider({ label: "Grandezza dei segni", min: 0.2, max: 3, step: 0.05, get: () => SIZE, set: v => { SIZE = v; applyFont(); } }),
    ...Object.values(styleOpts)));
}
hooks.style = name => {
  for (const [id, b] of Object.entries(styleTiles)) b.setAttribute("aria-pressed", String(id === name));
  for (const [id, el] of Object.entries(styleOpts)) el.classList.toggle("show", id === name);
  stage.style.background = STYLES[name].bg();
  // Gli stili più pesanti accettano meno segni per riga, così restano fluidi
  const cap = STYLES[name].maxCols || 300, ci = colsRow.querySelector("input");
  ci.max = cap;
  if ((colsPending || D.w) > cap) setCols(cap);
  ci.refresh();
};

/* ---------- Scheda Colore ---------- */
const PAL_META = [
  ["originale", "Originale"], ["fosforo", "Fosforo"], ["ambra", "Ambra"], ["duotone", "Duotone"], ["gameboy", "Game Boy"],
  ["termico", "Termico"], ["neon", "Neon"], ["blueprint", "Blueprint"], ["seppia", "Seppia"], ["gradiente", "Gradiente"],
];
const PAL_LABEL = Object.fromEntries(PAL_META);
const grStops = stops => `linear-gradient(90deg, ${stops.map(([t, c]) => `${css(c)} ${Math.round(t * 100)}%`).join(", ")})`;
const SWATCH = {
  originale: () => "linear-gradient(90deg, #d4503c, #e8b04a, #58a874, #3f7dd0)",
  fosforo: () => "linear-gradient(90deg, #000, #32ff5a)",
  ambra: () => "linear-gradient(90deg, #0a0500, #ffb01e)",
  duotone: () => `linear-gradient(90deg, ${css(duo.a)}, ${css(duo.b)})`,
  gameboy: () => grStops(GB.map((c, k) => [k / 3, c])),
  termico: () => grStops(R_THERMAL), neon: () => grStops(R_NEON), blueprint: () => grStops(R_BLUE), seppia: () => grStops(R_SEPIA),
  gradiente: () => grStops([[0, grad.a], [0.5, grad.b], [1, grad.c]]),
};
const palTiles = {};
const hexToRgb = s => [1, 3, 5].map(k => parseInt(s.slice(k, k + 2), 16));
const rgbToHex = c => "#" + c.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
let palPickers;

function buildColore() {
  const p = panels.colore;
  p.append(sec("Palette", null, h("div", { class: "tiles pal-grid" }, PAL_META.map(([id, name]) => {
    const b = h("button", { type: "button", class: "tile pal", "aria-pressed": "false" }, h("span", { class: "sw" }), name);
    b.addEventListener("click", () => setPalette(id));
    palTiles[id] = b;
    return b;
  }))));
  const picker = (obj, key, id) => {
    const i = h("input", { type: "color", value: rgbToHex(obj[key]), "aria-label": "Colore " + id });
    i.addEventListener("input", () => { obj[key] = hexToRgb(i.value); refreshSwatches(); setPalette(palette); });
    return i;
  };
  palPickers = {
    duotone: h("div", { class: "colors" }, picker(duo, "a", "scuro"), picker(duo, "b", "chiaro")),
    gradiente: h("div", { class: "colors" }, picker(grad, "a", "1"), picker(grad, "b", "2"), picker(grad, "c", "3")),
  };
  p.querySelector(".sec").append(palPickers.duotone, palPickers.gradiente);
  const adj = (k, extra = {}) => ({ get: () => ADJ[k], set: v => { ADJ[k] = v; scheduleRebuild(); }, ...extra });
  const sliders = [
    slider({ label: "Luminosità", min: -0.5, max: 0.5, step: 0.01, f: fmt.signed, ...adj("bright") }),
    slider({ label: "Contrasto", min: 0.4, max: 2, step: 0.01, f: fmt.pct, ...adj("contrast") }),
    slider({ label: "Saturazione", min: 0, max: 2.5, step: 0.01, f: fmt.pct, ...adj("sat") }),
    slider({ label: "Tinta", min: -180, max: 180, step: 1, f: fmt.deg, ...adj("hue") }),
    slider({ label: "Posterizzazione", min: 0, max: 8, step: 1, f: v => v < 2 ? "Off" : v + " livelli", ...adj("post") }),
  ];
  const inv = h("button", { type: "button", class: "btn", "aria-pressed": "false" }, "Inverti i colori");
  inv.addEventListener("click", () => { ADJ.invert = !ADJ.invert; inv.setAttribute("aria-pressed", String(ADJ.invert)); inv.classList.toggle("on", ADJ.invert); scheduleRebuild(); });
  const reset = h("button", { type: "button", class: "btn reset" }, "Azzera le regolazioni");
  reset.addEventListener("click", () => {
    Object.assign(ADJ, { bright: 0, contrast: 1, sat: 1, hue: 0, invert: false, post: 0 });
    sliders.forEach(r => r.querySelector("input").refresh());
    inv.setAttribute("aria-pressed", "false"); inv.classList.remove("on");
    scheduleRebuild();
  });
  p.append(sec("Regolazioni", "Cambiano i colori dell'immagine prima che diventi arte.", sliders, h("div", { class: "actions" }, inv), reset));
}
function refreshSwatches() { for (const [id, b] of Object.entries(palTiles)) b.querySelector(".sw").style.background = SWATCH[id](); }
hooks.palette = name => {
  for (const [id, b] of Object.entries(palTiles)) b.setAttribute("aria-pressed", String(id === name));
  for (const [id, el] of Object.entries(palPickers)) el.hidden = id !== name;
  stage.style.background = STYLES[style].bg();
};

/* ---------- Scheda Effetti ---------- */
const fxGroups = {};
const fxCards = {};
function refreshMarks() {
  const any = keys => keys.some(k => fx[k].on);
  const map = { glitch: ["rgb", "vhs", "grain", "psort", "glitch"], distorsioni: ["dwave", "fish", "swirl", "mirror", "kal", "ripple"], tracking: ["blob"], finali: ["crt", "bloom"] };
  for (const [g, keys] of Object.entries(map)) fxSegBtns[g].classList.toggle("has-on", any(keys));
  tabBtns.effetti.classList.toggle("has-on", any(Object.values(map).flat()));
}
function fxCard(key, title, desc, body, after) {
  const head = h("button", { type: "button", class: "fx-head", role: "switch" }, h("div", { class: "txt" }, h("h3", {}, title), h("p", {}, desc)), h("span", { class: "switch" }));
  const bodyEl = h("div", { class: "fx-body" }, body);
  const card = h("section", { class: "fx" }, head, bodyEl);
  const show = () => { const on = fx[key].on; head.setAttribute("aria-checked", String(on)); card.classList.toggle("on", on); bodyEl.hidden = !on; };
  head.addEventListener("click", () => { fx[key].on = !fx[key].on; show(); needsDraw = true; after && after(); refreshMarks(); });
  show();
  fxCards[key] = card;
  return card;
}
const amount = (key, label = "Intensità", min = 0.1, max = 3, after) =>
  slider({ label, min, max, step: 0.05, get: () => fx[key].v, set: v => { fx[key].v = v; }, after });
let fxSegBtns;
const BLOB_COLORS = [["#ffffff", "Bianco"], ["#ff6a3d", "Arancio"], ["#5cf08a", "Verde"], ["#4fd1ff", "Azzurro"], ["#ffe14d", "Giallo"], ["img", "Dall'immagine"]];

function buildEffetti() {
  const p = panels.effetti;
  const GROUPS = [["glitch", "Glitch"], ["distorsioni", "Distorsioni"], ["tracking", "Tracking"], ["finali", "Finali"]];
  let group = "glitch";
  const segEl = h("div", { class: "seg", role: "group", "aria-label": "Categorie di effetti" });
  fxSegBtns = {};
  const showGroup = () => GROUPS.forEach(([id]) => { fxSegBtns[id].setAttribute("aria-pressed", String(id === group)); fxGroups[id].hidden = id !== group; });
  for (const [id, name] of GROUPS) {
    fxSegBtns[id] = h("button", { type: "button", "aria-pressed": "false" }, name);
    fxSegBtns[id].addEventListener("click", () => { group = id; showGroup(); });
    segEl.append(fxSegBtns[id]);
    fxGroups[id] = h("div", { class: "group" });
  }
  const rebuild = () => scheduleRebuild();

  fxGroups.glitch.append(
    fxCard("rgb", "Separazione RGB", "I canali colore si staccano ai bordi.", [amount("rgb", "Forza")]),
    fxCard("vhs", "VHS", "Righe che ondeggiano e una fascia di disturbo che sale.", [amount("vhs")]),
    fxCard("grain", "Rumore di pellicola", "Grana che cambia a ogni fotogramma.", [amount("grain", "Quantità")]),
    fxCard("psort", "Pixel sorting", "Le zone chiare si allungano in strisce ordinate.", [
      amount("psort", "Lunghezza", 0.1, 3, rebuild),
      seg({ label: "Direzione", options: [["h", "Orizzontale"], ["v", "Verticale"]], get: () => opt.psDir, set: v => { opt.psDir = v; rebuild(); } }),
      slider({ label: "Soglia minima", min: 0, max: 1, step: 0.01, f: fmt.pct, get: () => opt.psLo, set: v => { opt.psLo = v; }, after: rebuild }),
      slider({ label: "Soglia massima", min: 0, max: 1, step: 0.01, f: fmt.pct, get: () => opt.psHi, set: v => { opt.psHi = v; }, after: rebuild }),
    ], rebuild),
    fxCard("glitch", "Glitch", "Strisce spostate e un riflesso rosso, a scatti.", [amount("glitch", "Intensità", 0.1, 3)]),
  );
  fxGroups.distorsioni.append(
    fxCard("dwave", "Ondulazione", "L'immagine ondeggia come sott'acqua.", [amount("dwave", "Ampiezza", 0.1, 3)]),
    fxCard("fish", "Fisheye", "Ingrandisce il centro come una lente.", [
      slider({ label: "Forza", min: 0.1, max: 2.5, step: 0.05, get: () => fx.fish.v, set: v => { fx.fish.v = v; } }),
      seg({ label: "Dove", options: [["centro", "Centro"], ["puntatore", "Puntatore"]], get: () => opt.fishAt, set: v => { opt.fishAt = v; } }),
    ]),
    fxCard("swirl", "Vortice", "Fa girare l'immagine attorno a un punto.", [
      slider({ label: "Forza", min: -2, max: 2, step: 0.05, get: () => fx.swirl.v, set: v => { fx.swirl.v = v; } }),
      seg({ label: "Dove", options: [["centro", "Centro"], ["puntatore", "Puntatore"]], get: () => opt.swirlAt, set: v => { opt.swirlAt = v; } }),
    ]),
    fxCard("mirror", "Specchio", "Riflette metà immagine sull'altra.", [
      seg({ label: "Asse", options: [["h", "Orizzontale"], ["v", "Verticale"], ["hv", "Entrambi"]], get: () => opt.mirror, set: v => { opt.mirror = v; } }),
    ]),
    fxCard("kal", "Caleidoscopio", "Ripete uno spicchio dell'immagine, ruotando.", [
      slider({ label: "Spicchi", min: 2, max: 12, step: 1, f: fmt.int, get: () => opt.kal, set: v => { opt.kal = v; } }),
      slider({ label: "Rotazione", min: 0, max: 3, step: 0.05, get: () => fx.kal.v, set: v => { fx.kal.v = v; } }),
    ]),
    fxCard("ripple", "Increspatura al tocco", "Un clic o un tocco manda un'onda che sposta i segni.", [amount("ripple", "Forza", 0.1, 3)]),
  );
  const markBlobs = () => markBlobsDirty();
  fxGroups.tracking.append(
    fxCard("blob", "Blob tracking", "Trova le zone che spiccano e le segue con riquadri, sigle e linee. Il cursore o il dito è un punto tracciato.", [
      h("p", { class: "sub" }, "Cosa cercare"),
      seg({ label: "Modo", options: [["chiari", "Chiari"], ["scuri", "Scuri"], ["bordi", "Bordi"], ["colore", "Colore"]], get: () => BLOB.mode, set: v => { BLOB.mode = v; markBlobs(); } }),
      slider({ label: "Soglia", min: 0.1, max: 0.95, step: 0.01, f: fmt.pct, get: () => BLOB.thr, set: v => { BLOB.thr = v; }, after: markBlobs }),
      slider({ label: "Dimensione minima", min: 0.1, max: 4, step: 0.1, f: v => v.toFixed(1) + "%", get: () => BLOB.min, set: v => { BLOB.min = v; }, after: markBlobs }),
      slider({ label: "Quanti al massimo", min: 1, max: 40, step: 1, f: fmt.int, get: () => BLOB.max, set: v => { BLOB.max = v; }, after: markBlobs }),
      h("p", { class: "sub" }, "Aspetto"),
      seg({ label: "Forma", options: [["angoli", "Angoli"], ["riquadro", "Riquadro"], ["cerchio", "Cerchio"]], get: () => BLOB.shape, set: v => { BLOB.shape = v; } }),
      seg({ label: "Colore", cls: "colorpick", options: BLOB_COLORS.map(([v, name]) => [v, name, { aria: name, node: v === "img" ? h("span", { style: "font-size:11px;padding:0 4px" }, "Foto") : h("span", { class: "chip", style: "background:" + v }) }]), get: () => BLOB.color, set: v => { BLOB.color = v; } }),
      slider({ label: "Linee verso i vicini", min: 0, max: 4, step: 1, f: v => v < 1 ? "Nessuna" : fmt.int(v), get: () => BLOB.links, set: v => { BLOB.links = v; } }),
      seg({ label: "Etichette", options: [[true, "Con etichette"], [false, "Senza"]], get: () => BLOB.labels, set: v => { BLOB.labels = v; } }),
    ], markBlobs),
  );
  fxGroups.finali.append(
    fxCard("crt", "CRT", "Righe di scansione e angoli scuri da vecchio monitor.", [amount("crt", "Intensità", 0, 2)]),
    fxCard("bloom", "Bloom", "Un alone luminoso attorno ai segni.", [amount("bloom", "Intensità", 0, 3)]),
  );
  p.append(sec(null, null, segEl, ...GROUPS.map(([id]) => fxGroups[id])));
  showGroup();
  refreshMarks();
}

/* ---------- Scheda Movimento ---------- */
function buildMoto() {
  panels.moto.append(
    sec("Puntatore", "Muovi il cursore sull'immagine, o trascina il dito, per agitare i segni.",
      slider({ label: "Raggio", min: 1, max: 30, step: 1, f: fmt.int, get: () => RADIUS, set: v => { RADIUS = v; } }),
      slider({ label: "Spinta", min: 0, max: 10, step: 0.1, f: fmt.n1, get: () => PUSH, set: v => { PUSH = v; } })),
    sec("Sfondo", "L'immagine non sta mai ferma: queste regolazioni decidono quanto respira.",
      slider({ label: "Velocità dell'onda", min: 0, max: 5, step: 0.1, f: fmt.n1, get: () => SPEED, set: v => { SPEED = v; } }),
      slider({ label: "Variazione dei segni", min: 0, max: 4, step: 0.1, f: fmt.n1, get: () => VARY, set: v => { VARY = v; } })));
}

/* ---------- Scheda Avanzate: suono, prestazioni, statistiche ---------- */
let micBtn, fileBtn, meterFill, soundFx;
// Gli effetti del suono sono "in attesa" finché non si accende microfono o file audio
const soundLive = () => soundFx.classList.toggle("live", !!micStream || !audioEl.paused);
function buildAltro() {
  const p = panels.altro;
  micBtn = h("button", { type: "button", class: "btn", "aria-pressed": "false" }, "Microfono");
  fileBtn = h("button", { type: "button", class: "btn" }, "File audio");
  meterFill = h("div");
  micBtn.addEventListener("click", toggleMic);
  fileBtn.addEventListener("click", () => { if (!audioEl.paused) stopAudioFile(); else { $("audioFile").value = ""; $("audioFile").click(); } });
  $("audioFile").addEventListener("change", () => { const f = $("audioFile").files[0]; if (f) playAudioFile(f); });
  const bandBtns = ["bassi", "medi", "alti"].map(b => {
    const el = h("button", { type: "button", "aria-pressed": String(BANDS[b].on) }, b[0].toUpperCase() + b.slice(1));
    el.addEventListener("click", () => { BANDS[b].on = !BANDS[b].on; el.setAttribute("aria-pressed", String(BANDS[b].on)); });
    return el;
  });
  const sensitivity = slider({ label: "Sensibilità", min: 0.2, max: 5, step: 0.1, f: fmt.n1, get: () => SENS, set: v => { SENS = v; } });
  p.append(
    sec("Suono reattivo", "L'immagine vibra a ritmo di voce o musica. Resta spento finché non lo accendi e non pesa sulle prestazioni.",
      h("div", { class: "actions" }, micBtn, fileBtn), h("div", { class: "meter" }, meterFill), sensitivity,
      soundFx = h("div", { class: "soundfx" },
        fxCard("spec", "Spettro", "Ogni colonna trema con la sua frequenza.", [amount("spec", "Intensità", 0, 4)]),
        fxCard("wave", "Onda", "La forma d'onda deforma l'immagine.", [amount("wave", "Intensità", 0, 4), h("div", { class: "seg small", role: "group", "aria-label": "Fasce" }, bandBtns)]),
        fxCard("bass", "Bassi", "Sobbalzo e onda d'urto a ogni colpo di basso.", [amount("bass", "Intensità", 0, 4)]),
        fxCard("chaos", "Caos dal volume", "Più forte è il suono, più i segni cambiano.", [amount("chaos", "Intensità", 0, 4)]))),
    sec("Prestazioni", "Una qualità più bassa disegna meno pixel e fa girare meglio l'arte su telefoni e computer lenti.",
      seg({ label: "Qualità", options: [["bassa", "Bassa"], ["media", "Media"], ["piena", "Piena"]], get: () => quality, set: v => { quality = v; autoLevel = null; fit(); draw(performance.now()); } }),
      (() => {
        const head = h("button", { type: "button", class: "fx-head", role: "switch", "aria-checked": String(autoQ) }, h("div", { class: "txt" }, h("h3", {}, "Qualità automatica"), h("p", {}, "Scende da sola se il disegno rallenta.")), h("span", { class: "switch" }));
        head.addEventListener("click", () => { autoQ = !autoQ; head.setAttribute("aria-checked", String(autoQ)); if (!autoQ && autoLevel) { autoLevel = null; fit(); draw(performance.now()); } });
        return h("div", { class: "fx on" }, head);
      })()),
    sec("Statistiche", null,
      h("div", { class: "fps" }, h("span", { id: "stFps" }, "0"), h("small", {}, "FPS")),
      h("canvas", { id: "stSpark", class: "spark", role: "img", "aria-label": "FPS negli ultimi secondi" }),
      h("dl", { class: "stat" }, [
        ["FPS min / medio", "stFpsRange"], ["Disegno", "stMs"], ["animazione", "stAnim", 1], ["segni", "stCellsMs", 1], ["effetti", "stPost", 1],
        ["Risoluzione", "stRes"], ["Qualità", "stQ"], ["Griglia", "stGrid"], ["Celle", "stCells"], ["Stile", "stStyle"], ["Palette", "stPal"],
        ["Celle agitate", "stAgit"], ["Onde attive", "stShocks"], ["Blob", "stBlob"], ["Suono", "stSound"], ["Stato", "stState"],
      ].map(([name, id, sub]) => [h("dt", { class: sub ? "s" : "" }, name), h("dd", { id, class: sub ? "s" : "", "data-sub": sub ? "1" : null }, "–")]))),
    sec("Scorciatoie", null, h("dl", { class: "keys" }, [
      ["1–9 · ← →", "cambia stile"], ["I", "carica un'immagine"], ["S", "salva un PNG"], ["R", "avvia o ferma la registrazione"],
      ["M", "accende o spegne il microfono"], ["H", "nasconde i controlli"], ["F", "apre le statistiche"], ["Spazio", "pausa"],
    ].map(([k, d]) => [h("dt", {}, k), h("dd", {}, d)]))));
}
hooks.mic = on => { micBtn.classList.toggle("on", on); micBtn.setAttribute("aria-pressed", String(on)); soundLive(); };
hooks.file = name => { fileBtn.classList.toggle("on", !!name); fileBtn.textContent = name ? "■ " + name : "File audio"; fileBtn.title = name || ""; soundLive(); };
let lastMeter = -1;
hooks.meter = lv => { if (lv !== lastMeter) { lastMeter = lv; meterFill.style.width = lv * 100 + "%"; } };

/* ---------- Statistiche (aggiornate solo se la scheda è visibile) ---------- */
let statsLast = 0;
const fpsHistory = [];
const st = id => $(id);
function setStat(id, text, level) { const el = st(id); el.textContent = text; el.className = (el.dataset.sub ? "s " : "") + (level || ""); }
function statsVisible() { return activeTab === "altro" && !app.hasAttribute("data-zen") && (!sheetMode() || app.dataset.sheet === "open"); }
function updateStats(t) {
  if (!statsVisible() || t - statsLast < 250) return;
  statsLast = t;
  while (frameTimes.length && t - frameTimes[0] >= 1000) { frameTimes.shift(); drawMs.shift(); }
  const fps = paused ? 0 : frameTimes.length;
  const ms = drawMs.length ? drawMs.reduce((a, b) => a + b, 0) / drawMs.length : 0;
  const stopped = paused || idle;
  st("stFps").textContent = fps;
  st("stFps").style.color = stopped ? "#73737b" : fps < 12 ? "#ef5a5f" : fps < 18 ? "#e5a84d" : "";
  setStat("stMs", stopped ? "–" : ms.toFixed(1) + " ms", ms > 50 ? "bad" : ms > 35 ? "warn" : "");
  setStat("stAnim", timing.anim.toFixed(1) + " ms"); setStat("stCellsMs", timing.cells.toFixed(1) + " ms"); setStat("stPost", timing.post.toFixed(1) + " ms");
  const active = fpsHistory.filter(v => v > 0);
  st("stFpsRange").textContent = active.length ? `${Math.min(...active)} / ${Math.round(active.reduce((a, b) => a + b, 0) / active.length)}` : "–";
  st("stRes").textContent = `${cv.width}×${cv.height} · ${(cv.width / boxW).toFixed(2)}×`;
  const q = currentQuality();
  setStat("stQ", q + (autoQ ? (q !== quality ? " (auto ↓)" : " (auto)") : ""), q !== quality ? "warn" : "");
  st("stAgit").textContent = total ? Math.round(agitated / total * 100) + "%" : "–";
  st("stGrid").textContent = `${D.w} × ${D.h}`;
  st("stCells").textContent = total.toLocaleString("it-IT");
  st("stStyle").textContent = STYLE_LABEL[style];
  st("stPal").textContent = PAL_LABEL[palette];
  st("stShocks").textContent = String(shocks.length);
  st("stBlob").textContent = fx.blob.on ? String(blobs.length) : "spento";
  const src = [micStream && "mic", !audioEl.paused && "audio"].filter(Boolean).join(" + ");
  st("stSound").textContent = snd.active ? `${src} ${Math.round(snd.rms * 100)}%` : "spento";
  setStat("stState", recorder ? "● Registrazione" : paused ? "In pausa" : !srcImg ? "Senza immagine" : idle ? "Ferma (risparmio)" : "In esecuzione", recorder ? "bad" : paused || idle ? "warn" : "");
  fpsHistory.push(fps);
  if (fpsHistory.length > 40) fpsHistory.shift();
  drawSpark();
}
function drawSpark() {
  const c = st("stSpark"), dpr = window.devicePixelRatio || 1, w = c.clientWidth, hgt = c.clientHeight;
  if (!w) return;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hgt * dpr); }
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, hgt);
  const y = v => hgt - 1 - Math.min(v, 25) / 25 * (hgt - 2);
  g.strokeStyle = "#44444a"; g.setLineDash([2, 3]);
  g.beginPath(); g.moveTo(0, y(20)); g.lineTo(w, y(20)); g.stroke();
  g.setLineDash([]); g.strokeStyle = "#ededee"; g.lineWidth = 1.3;
  g.beginPath();
  fpsHistory.forEach((v, k) => { const x = w - (fpsHistory.length - 1 - k) * (w / 39); k ? g.lineTo(x, y(v)) : g.moveTo(x, y(v)); });
  g.stroke();
}
hooks.tick = updateStats;

/* ---------- Barra, registrazione, pausa e modalità solo arte ---------- */
const recBtn = $("btnRec");
hooks.rec = sec => {
  recBtn.classList.toggle("on", sec !== null);
  $("recLbl").textContent = sec === null ? "Registra" : `Ferma ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  recBtn.setAttribute("aria-label", sec === null ? "Registra un video" : "Ferma la registrazione");
};
function togglePause() { paused = !paused; $("btnPause").setAttribute("aria-pressed", String(paused)); $("btnPause").setAttribute("aria-label", paused ? "Riprendi" : "Pausa"); }
function toggleZen() { app.toggleAttribute("data-zen"); }
recBtn.addEventListener("click", toggleRecording);
$("btnSave").addEventListener("click", saveFrame);
$("btnPause").addEventListener("click", togglePause);
$("btnZen").addEventListener("click", toggleZen);
$("zenOff").addEventListener("click", toggleZen);

/* ---------- Immagine: file, esempio, trascinamento ---------- */
const emptyEl = $("empty");
function onLoaded() { emptyEl.classList.remove("show"); colsRow.querySelector("input").refresh(); }
function pickImage() { $("imageFile").value = ""; $("imageFile").click(); }

/* ---------- Memoria del browser ----------
   Immagine e impostazioni si salvano sul dispositivo (IndexedDB e localStorage, nulla
   esce dal browser), così se la pagina si ricarica (condivisione, scheda scartata dal
   telefono, aggiornamento) si riparte da dove eri. */
const SETTINGS_KEY = "sva-impostazioni-v1";
const kvOpen = () => new Promise((res, rej) => {
  const r = indexedDB.open("sound-visual-art", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("kv");
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function kvSet(key, value) {
  try {
    const db = await kvOpen();
    await new Promise((res, rej) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(value, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
  } catch (e) { /* memoria non disponibile (navigazione privata): si lavora senza */ }
}
async function kvGet(key) {
  try {
    const db = await kvOpen();
    const v = await new Promise((res, rej) => { const q = db.transaction("kv").objectStore("kv").get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    db.close();
    return v;
  } catch (e) { return undefined; }
}
const keepImage = file => loadImageFile(file, () => { onLoaded(); kvSet("image", file); });
const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      style, palette, duo, grad, ADJ, opt, BLOB, SIZE, SPEED, VARY, RADIUS, PUSH, quality, autoQ, cols: D.w,
      fx: Object.fromEntries(Object.entries(fx).map(([k, o]) => [k, pick(o, ["on", "v"])])),
    }));
  } catch (e) { /* spazio esaurito o bloccato: pazienza */ }
}
function loadSettings() {
  let s;
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch (e) { return null; }
  if (!s || typeof s !== "object") return null;
  const num = (v, d) => typeof v === "number" && isFinite(v) ? v : d;
  if (s.style in STYLES) {/* applicato all'avvio da setStyle */} else s.style = "ascii";
  if (s.palette in PALETTES) palette = s.palette;
  if (Array.isArray(s.duo && s.duo.a) && Array.isArray(s.duo.b)) { duo.a = s.duo.a; duo.b = s.duo.b; }
  if (s.grad && ["a", "b", "c"].every(k => Array.isArray(s.grad[k]))) Object.assign(grad, s.grad);
  for (const [dst, src] of [[ADJ, s.ADJ], [opt, s.opt], [BLOB, s.BLOB]]) if (src) for (const k of Object.keys(dst)) if (k in src && typeof src[k] === typeof dst[k]) dst[k] = src[k];
  SIZE = num(s.SIZE, SIZE); SPEED = num(s.SPEED, SPEED); VARY = num(s.VARY, VARY); RADIUS = num(s.RADIUS, RADIUS); PUSH = num(s.PUSH, PUSH);
  if (Q_LEVELS.includes(s.quality)) quality = s.quality;
  if (typeof s.autoQ === "boolean") autoQ = s.autoQ;
  if (s.fx) for (const k of Object.keys(fx)) if (s.fx[k]) { fx[k].on = !!s.fx[k].on; fx[k].v = num(s.fx[k].v, fx[k].v); }
  if (num(s.cols, 0) >= 20) colsPending = Math.min(300, s.cols);
  return s;
}
let saveTimer = 0;
const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveSettings, 400); };
$("btnImage").addEventListener("click", pickImage);
$("emptyPick").addEventListener("click", pickImage);
$("imageFile").addEventListener("change", () => { const f = $("imageFile").files[0]; if (f) keepImage(f); });

// Immagine di prova disegnata al volo: un tramonto con montagne
function makeSample() {
  const W = 1200, H = 800, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, H * 0.75);
  sky.addColorStop(0, "#2f5fb0"); sky.addColorStop(0.5, "#e8744a"); sky.addColorStop(1, "#ffe3a0");
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const sun = g.createRadialGradient(780, 470, 10, 780, 470, 330);
  sun.addColorStop(0, "rgba(255,250,220,1)"); sun.addColorStop(0.18, "rgba(255,226,150,.95)"); sun.addColorStop(1, "rgba(255,150,70,0)");
  g.fillStyle = sun; g.fillRect(0, 0, W, H);
  g.fillStyle = "#fff6d8"; g.beginPath(); g.arc(780, 470, 74, 0, 7); g.fill();
  const layer = (base, amp, color, seed) => {
    g.fillStyle = color; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, base - amp * (Math.sin(x * 0.006 + seed) * 0.6 + Math.sin(x * 0.017 + seed * 2.3) * 0.3 + Math.sin(x * 0.041 + seed) * 0.1));
    g.lineTo(W, H); g.fill();
  };
  layer(560, 90, "#c06a4a", 1); layer(620, 100, "#8a4a48", 3); layer(700, 90, "#4a3040", 5); layer(770, 50, "#1c1420", 8);
  for (let k = 0; k < 70; k++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`; g.fillRect(Math.random() * W, Math.random() * H * 0.25, 3, 3); }
  c.toBlob(blob => keepImage(new File([blob], "esempio.png", { type: "image/png" })));
}
$("emptySample").addEventListener("click", makeSample);
let dragDepth = 0;
addEventListener("dragenter", e => { e.preventDefault(); dragDepth++; document.body.classList.add("dragging"); });
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dragging"); } });
addEventListener("dragover", e => e.preventDefault());
addEventListener("drop", e => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove("dragging");
  const f = e.dataTransfer && e.dataTransfer.files[0];
  if (!f) return;
  if (f.type.startsWith("image/")) keepImage(f);
  else if (f.type.startsWith("audio/")) playAudioFile(f);
});

/* ---------- Tastiera ---------- */
addEventListener("keydown", e => {
  const target = e.target instanceof Element ? e.target : document.body;
  if (target.matches("input[type=text], input[type=color]")) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const onSlider = target.matches("input[type=range]"), onTab = target.matches("[role=tab]");
  if (e.code === "ArrowRight" && !onSlider && !onTab) cycleStyle(1);
  else if (e.code === "ArrowLeft" && !onSlider && !onTab) cycleStyle(-1);
  else if (e.code === "Space" && !target.matches("button")) { e.preventDefault(); togglePause(); }
  else if (e.code === "KeyS") saveFrame();
  else if (e.code === "KeyR") toggleRecording();
  else if (e.code === "KeyM") toggleMic();
  else if (e.code === "KeyH") toggleZen();
  else if (e.code === "KeyF") setTab("altro");
  else if (e.code === "KeyI") pickImage();
  else if (/^Digit[1-9]$/.test(e.code)) setStyle(STYLE_ORDER[+e.code.slice(5) - 1]);
});

/* ---------- Avvio ---------- */
hooks.error = msg => alert(msg);
if (isMobile()) colsPending = 64;   // schermi piccoli: meno segni, più leggibili
const saved = loadSettings();       // impostazioni dell'ultima volta, se ci sono
buildStile();
buildColore();
buildEffetti();
buildMoto();
buildAltro();
refreshSwatches();
setTab("stile");
app.dataset.sheet = "closed";       // su telefono l'arte parte a tutto schermo
if (!isMobile()) app.dataset.sheet = "open";
hooks.palette(palette);
setStyle(saved ? saved.style : "ascii");
let toastTimer = 0;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
}
// Rimette l'ultima immagine e dice che l'ha fatto: così si capisce se la pagina si è ricaricata
kvGet("image").then(f => { if (f && !srcImg) loadImageFile(f, () => { onLoaded(); toast("Pagina ricaricata: ho rimesso la tua immagine e le impostazioni."); }); });
$("dock").addEventListener("input", persist);
$("dock").addEventListener("click", persist);
addEventListener("keydown", persist);
addEventListener("pagehide", saveSettings);
document.addEventListener("visibilitychange", () => { if (document.hidden) saveSettings(); });
let roQueued = false;
new ResizeObserver(() => {
  if (roQueued) return;
  roQueued = true;
  requestAnimationFrame(() => { roQueued = false; fit(); needsDraw = true; draw(performance.now()); });
}).observe(stage);
document.fonts && document.fonts.ready.then(() => { fit(); needsDraw = true; });
requestAnimationFrame(loop);
