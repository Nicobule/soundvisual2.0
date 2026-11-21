"use strict";
/* ==========================================================================
   Sound Visual Art, motore di disegno
   Ogni fotogramma calcola, per ogni cella della griglia, una luminosità animata
   e la passa allo stile scelto (ASCII, Braille, Esagoni…), che decide solo COME
   disegnarla. Le distorsioni lavorano sul "da dove leggere" la cella (mappa
   inversa): così non si formano mai buchi nell'immagine.
   Caricato per primo: i file fx.js e ui.js usano ciò che definisce qui.
   ========================================================================== */

const $ = id => document.getElementById(id);
const cv = $("c"), ctx = cv.getContext("2d");

// Dati dell'immagine convertita (si riempiono da buildGrid)
const D = {
  w: 100, h: 28, chars: " .:-=+*#%@",
  lum: new Array(100 * 28).fill(0), rgb: new Array(100 * 28 * 3).fill(0), sub: null,
  color: true, invert: false, fg: "#000", bg: "#000",
};
const n = D.chars.length - 1;
const J = Math.max(1, n * 0.08);   // ampiezza della variazione dei caratteri
let CELL = 2;                      // altezza delle celle rispetto alla larghezza (vedi STYLES.aspect)
let EXTRA = 0;                     // colonne in più a destra (gli esagoni sfalsano le righe)

let total, base, jitter, fills, palRGB, disturb, edgeMag, edgeChar, edgeAng, dotOff, vBuf, dispX, dispY;

/* ---------------- Palette (ricolorano ogni cella da colore e luminosità) ---------------- */
let palette = "originale";
const duo = { a: [0x1b, 0x0b, 0x3a], b: [0xff, 0x5a, 0xc8] };
const grad = { a: [0x0b, 0x1d, 0x3a], b: [0x3f, 0xc1, 0xc9], c: [0xfc, 0xff, 0xe0] };
const GB = [[0x0f, 0x38, 0x0f], [0x30, 0x62, 0x30], [0x8b, 0xac, 0x0f], [0x9b, 0xbc, 0x0f]];
// Rampa a tappe: stops = [[t, [r,g,b]], …] con t crescente da 0 a 1
function ramp(stops, t) {
  t = Math.min(1, Math.max(0, t));
  for (let k = 1; k < stops.length; k++) {
    if (t <= stops[k][0]) {
      const [t0, c0] = stops[k - 1], [t1, c1] = stops[k], f = (t - t0) / (t1 - t0 || 1);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return stops[stops.length - 1][1];
}
const R_THERMAL = [[0, [2, 0, 24]], [0.25, [38, 8, 132]], [0.5, [196, 30, 94]], [0.75, [255, 156, 22]], [1, [255, 252, 206]]];
const R_NEON = [[0, [2, 2, 10]], [0.35, [0, 112, 255]], [0.68, [255, 36, 178]], [1, [214, 255, 250]]];
const R_BLUE = [[0, [6, 24, 86]], [1, [196, 228, 255]]];
const R_SEPIA = [[0, [22, 11, 4]], [0.6, [150, 100, 58]], [1, [252, 228, 184]]];
const css = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const PALETTES = {
  originale: { map: (r, g, b) => [r, g, b], bg: () => D.bg },
  fosforo:   { map: (r, g, b, t) => [t * 50, 40 + t * 215, t * 90], bg: () => "#020a04" },
  ambra:     { map: (r, g, b, t) => [40 + t * 215, 20 + t * 156, t * 30], bg: () => "#0a0500" },
  duotone:   { map: (r, g, b, t) => duo.a.map((a, k) => a + (duo.b[k] - a) * t), bg: () => css(duo.a) },
  gameboy:   { map: (r, g, b, t) => GB[Math.min(3, Math.floor(t * 4))], bg: () => "#0f380f" },
  termico:   { map: (r, g, b, t) => ramp(R_THERMAL, t), bg: () => "#020018" },
  neon:      { map: (r, g, b, t) => ramp(R_NEON, t), bg: () => "#02020a" },
  blueprint: { map: (r, g, b, t) => ramp(R_BLUE, t), bg: () => "#061856" },
  seppia:    { map: (r, g, b, t) => ramp(R_SEPIA, t), bg: () => "#160b04" },
  gradiente: { map: (r, g, b, t) => ramp([[0, grad.a], [0.5, grad.b], [1, grad.c]], t), bg: () => css(grad.a) },
};
function pageBg() { return D.color ? PALETTES[palette].bg() : D.bg; }
function applyPalette() {
  fills = [];
  palRGB = new Uint8ClampedArray(total * 3);
  if (!D.color) return;
  const map = PALETTES[palette].map;
  for (let i = 0; i < total; i++) {
    const c = map(D.rgb[i * 3], D.rgb[i * 3 + 1], D.rgb[i * 3 + 2], D.lum[i] / 255);
    palRGB[i * 3] = c[0]; palRGB[i * 3 + 1] = c[1]; palRGB[i * 3 + 2] = c[2];
    fills.push(`rgb(${palRGB[i * 3]},${palRGB[i * 3 + 1]},${palRGB[i * 3 + 2]})`);
  }
}

// Contorni: filtro di Sobel sulla luminosità. Per ogni cella forza e angolo del bordo,
// e il carattere che ne segue la direzione (- \ | /).
function findEdges() {
  edgeMag = new Float32Array(total);
  edgeAng = new Float32Array(total);
  edgeChar = new Array(total).fill("");
  const L = (x, y) => D.lum[Math.min(D.h - 1, Math.max(0, y)) * D.w + Math.min(D.w - 1, Math.max(0, x))];
  for (let y = 0, i = 0; y < D.h; y++) for (let x = 0; x < D.w; x++, i++) {
    const gx = L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1);
    const gy = (L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1)) / CELL;
    edgeMag[i] = Math.hypot(gx, gy) / 1020;
    edgeAng[i] = Math.atan2(gy, gx);
    const a = (Math.atan2(gy, gx) * 180 / Math.PI + 270) % 180;   // direzione del bordo, 0..180
    edgeChar[i] = a < 22.5 || a >= 157.5 ? "-" : a < 67.5 ? "\\" : a < 112.5 ? "|" : "/";
  }
}

function setPixels() {
  total = D.w * D.h;
  base = Float32Array.from(D.lum, l => l * n / 255);
  jitter = new Float32Array(total);
  disturb = new Float32Array(total);
  vBuf = new Float32Array(total);
  dispX = new Float32Array(total);
  dispY = new Float32Array(total);
  dotOff = Float32Array.from({ length: total * 8 }, () => Math.random() * 0.8 - 0.4);
  applyPalette();
  findEdges();
}
setPixels();

/* ---------------- Misure e qualità ---------------- */
let cw, ch, baseFont;
let SIZE = 1;              // grandezza dei segni rispetto alla cella (1 = la riempiono)
function applyFont() {
  ctx.font = `${baseFont * SIZE}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
}
// boxW × boxH è l'area del canvas (px CSS); ox, oy spostano la griglia per centrarla.
// Durante una registrazione il canvas NON cambia dimensione (gli encoder video non lo
// sopportano): la griglia si adatta dentro il riquadro già esistente.
let boxW = 0, boxH = 0, ox = 0, oy = 0;

// Qualità = densità di pixel del canvas. Sui telefoni "piena" può valere 3×, cioè 9 volte
// i pixel: per questo di partenza i dispositivi touch usano "media".
const Q_LEVELS = ["bassa", "media", "piena"];
const Q_CAP = { bassa: 1, media: 1.5, piena: Infinity };
const COARSE = matchMedia("(pointer: coarse)").matches;
let quality = COARSE ? "media" : "piena", autoQ = true, autoLevel = null;
function currentQuality() {
  return autoQ && autoLevel && Q_LEVELS.indexOf(autoLevel) < Q_LEVELS.indexOf(quality) ? autoLevel : quality;
}
const qualityDpr = q => Math.min(window.devicePixelRatio || 1, Q_CAP[q]);

// L'area disponibile è quella del "palco" (la pagina meno pannello e barra)
function stageSize() {
  const s = $("stage");
  return [s.clientWidth, s.clientHeight];
}
function fit() {
  const locked = !!recorder;
  const dpr = locked ? cv.width / boxW : qualityDpr(currentQuality());
  const [sw, sh] = stageSize();
  const pad = sw < 700 ? 8 : 24;
  const availW = locked ? boxW : Math.max(16, sw - pad * 2);
  const availH = locked ? boxH : Math.max(16, sh - pad * 2);
  EXTRA = STYLES[style].extra || 0;
  cw = Math.min(availW / (D.w + EXTRA), availH / (D.h * CELL));
  ch = cw * CELL;
  if (!locked) {
    boxW = cw * (D.w + EXTRA);
    boxH = ch * D.h;
    cv.style.width = boxW + "px";
    cv.style.height = boxH + "px";
    cv.width = Math.round(boxW * dpr);
    cv.height = Math.round(boxH * dpr);
  }
  ox = (boxW - cw * (D.w + EXTRA)) / 2;
  oy = (boxH - ch * D.h) / 2;
  ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
  ctx.font = "100px monospace";
  const ratio = ctx.measureText("M").width / 100;
  baseFont = Math.min(ch, cw / ratio);
  applyFont();
}

/* ---------------- Cursore, clic e onde d'urto ---------------- */
let RADIUS = 7;            // raggio d'azione in celle
let PUSH = 2.0;            // quanto i segni vengono spinti via (in celle)
let SPEED = 1;             // velocità dell'onda di sfondo (0 = ferma)
let VARY = 1;              // quanto spesso e quanto forte cambiano i segni (0 = immagine fissa)
let phase = 0, lastT = 0;
let mouse = null;          // posizione del cursore in celle, o null se fuori
const shocks = [];         // onde d'urto create dai clic
let agitated = 0;

function stir(t) {
  agitated = 0;
  for (let i = 0; i < total; i++) if ((disturb[i] *= 0.92) > 0.02) agitated++;
  const rip = fx.ripple.on && fx.ripple.v > 0;
  if (rip) { dispX.fill(0); dispY.fill(0); }
  if (mouse) touchArea(mouse.x, mouse.y, RADIUS, 1);
  for (let s = shocks.length - 1; s >= 0; s--) {
    const sh = shocks[s], r = (t - sh.t) * 0.04;
    if (r > Math.max(D.w, D.h * CELL)) { shocks.splice(s, 1); continue; }
    ring(sh.x, sh.y, r);
    if (rip) rippleRing(sh.x, sh.y, r);
  }
}
function touchArea(cx, cy, R, power) {
  const y0 = Math.max(0, Math.floor(cy - R / CELL)), y1 = Math.min(D.h - 1, Math.ceil(cy + R / CELL));
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(D.w - 1, Math.ceil(cx + R));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * CELL) / R;
    if (d < 1) { const i = y * D.w + x; disturb[i] = Math.max(disturb[i], (1 - d) * power); }
  }
}
// Anello di un'onda d'urto: si visitano solo le celle del quadrato che lo contiene
function ring(cx, cy, r) {
  const R = r + 2;
  const y0 = Math.max(0, Math.floor(cy - R / CELL)), y1 = Math.min(D.h - 1, Math.ceil(cy + R / CELL));
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(D.w - 1, Math.ceil(cx + R));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.abs(Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * CELL) - r);
    if (d < 2) { const i = y * D.w + x; disturb[i] = Math.max(disturb[i], (1 - d / 2) * 0.8); }
  }
}
// Increspatura: la stessa onda sposta (non solo agita) le celle, in senso radiale
function rippleRing(cx, cy, r) {
  const W = 4, R = r + W;
  const y0 = Math.max(0, Math.floor(cy - R / CELL)), y1 = Math.min(D.h - 1, Math.ceil(cy + R / CELL));
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(D.w - 1, Math.ceil(cx + R));
  const fade = Math.max(0, 1 - r / Math.max(D.w, D.h * CELL)), amp = fx.ripple.v * 2.2 * fade;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) * CELL, dist = Math.hypot(dx, dy);
    const d = Math.abs(dist - r);
    if (d >= W || dist < 0.001) continue;
    const a = Math.cos(d / W * Math.PI / 2) * Math.sin(d * 1.3) * amp, i = y * D.w + x;
    dispX[i] += dx / dist * a;
    dispY[i] += dy / dist * a;
  }
}
const MAX_SHOCKS = 8;
function addShock(x, y, t) {
  shocks.push({ x, y, t });
  if (shocks.length > MAX_SHOCKS) shocks.shift();
}

/* ---------------- Suono (facoltativo, nel menu Avanzate) ----------------
   Microfono e file audio entrano in un unico ingresso e da lì in un analizzatore
   che ogni fotogramma fornisce spettro e forma d'onda. Tre filtri separano bassi,
   medi e alti. Da spento non costa nulla: listen() esce subito. */
const hooks = { mic() {}, file() {}, meter() {}, error(msg) { alert(msg); } };
let audioCtx = null, input, analyser, recDest, freq, timeData, colBin;
const bandAn = {}, bandData = {};
const BANDS = {
  bassi: { on: true, boost: 1 },     // sotto 250 Hz
  medi:  { on: true, boost: 1.5 },   // 250 Hz – 4 kHz
  alti:  { on: true, boost: 3 },     // sopra 4 kHz
};
let micStream = null, micNode = null, fileNode = null;
const audioEl = new Audio();
audioEl.loop = true;
let SENS = 1;
const fx = {
  // Suono
  spec:  { on: true,  v: 1 },   // ogni colonna trema con la sua frequenza
  wave:  { on: true,  v: 1 },   // la forma d'onda deforma l'immagine
  bass:  { on: true,  v: 1 },   // sobbalzo e onda d'urto a ogni colpo di basso
  chaos: { on: false, v: 1 },   // il volume aumenta la variazione dei segni
  // Effetti finali (sopra qualunque stile)
  crt:    { on: false, v: 1 },
  glitch: { on: false, v: 1 },
  bloom:  { on: false, v: 1 },
  // Look retro e glitch
  rgb:   { on: false, v: 1 },   // separazione dei canali colore
  vhs:   { on: false, v: 1 },
  grain: { on: false, v: 1 },   // rumore di pellicola
  psort: { on: false, v: 1 },   // pixel sorting (v non usato: vedi opt)
  // Distorsioni
  dwave:  { on: false, v: 1 },
  fish:   { on: false, v: 1 },
  swirl:  { on: false, v: 1 },
  mirror: { on: false, v: 1 },
  kal:    { on: false, v: 1 },
  ripple: { on: false, v: 1 },
  // Tracking
  blob:   { on: false, v: 1 },
};
// Opzioni che non sono semplici intensità
const opt = {
  fishAt: "centro", swirlAt: "centro", mirror: "h", kal: 6,
  psDir: "h", psLo: 0.2, psHi: 0.85, psLen: 0.5,
};
const ADJ = { bright: 0, contrast: 1, sat: 1, hue: 0, invert: false, post: 0 };
const snd = { active: false, rms: 0, bass: 0, bassAvg: 0, kick: 0, lastBeat: 0 };
let colDy = new Float32Array(D.w);

function ensureAudio() {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.6;
  recDest = audioCtx.createMediaStreamDestination();   // per mettere l'audio nel video
  input = audioCtx.createGain();
  input.connect(analyser);
  analyser.connect(recDest);
  freq = new Uint8Array(analyser.frequencyBinCount);
  timeData = new Float32Array(analyser.fftSize);
  const filter = (type, f) => {
    const b = audioCtx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    return b;
  };
  const chains = {
    bassi: [filter("lowpass", 250)],
    medi:  [filter("highpass", 250), filter("lowpass", 4000)],
    alti:  [filter("highpass", 4000)],
  };
  for (const [band, chain] of Object.entries(chains)) {
    const an = audioCtx.createAnalyser();
    an.fftSize = 2048;
    chain.reduce((prev, node) => { prev.connect(node); return node; }, input).connect(an);
    bandAn[band] = an;
    bandData[band] = new Float32Array(an.fftSize);
  }
  mapColumns();
}
// Colonne → frequenze su scala logaritmica: bassi a sinistra (40 Hz), acuti a destra (12 kHz)
function mapColumns() {
  const nyq = audioCtx.sampleRate / 2;
  colBin = Array.from({ length: D.w }, (_, x) => {
    const f = 40 * Math.pow(12000 / 40, x / Math.max(1, D.w - 1));
    return Math.min(freq.length - 1, Math.round(f / nyq * freq.length));
  });
}
let micPending = false;
function stopMic() {
  if (!micStream) return;
  micStream.getTracks().forEach(tr => tr.stop());
  micNode.disconnect();
  micStream = micNode = null;
  hooks.mic(false);
}
async function toggleMic() {
  if (micPending) return;
  if (micStream) { stopMic(); return; }
  micPending = true;
  let stream;
  try {
    ensureAudio();
    await audioCtx.resume();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (err) {
    hooks.error("Microfono non disponibile: " + err.message);
    return;
  } finally {
    micPending = false;
  }
  micStream = stream;
  micNode = audioCtx.createMediaStreamSource(micStream);
  micNode.connect(input);   // non va agli altoparlanti: niente fischio di ritorno
  hooks.mic(true);
  micStream.getAudioTracks().forEach(tr => { tr.onended = stopMic; });
}
async function playAudioFile(file) {
  ensureAudio();
  await audioCtx.resume();
  if (!fileNode) {
    fileNode = audioCtx.createMediaElementSource(audioEl);
    fileNode.connect(input);
    fileNode.connect(audioCtx.destination);   // il file si sente dagli altoparlanti
  }
  if (audioEl.src) URL.revokeObjectURL(audioEl.src);
  audioEl.src = URL.createObjectURL(file);
  try {
    await audioEl.play();
  } catch (err) {
    hooks.error("Impossibile riprodurre questo file audio. Prova con un MP3, WAV, OGG o M4A.");
    return;
  }
  hooks.file(file.name);
}
function stopAudioFile() {
  audioEl.pause();
  hooks.file(null);
}

// Legge l'analizzatore e aggiorna livelli, colpi di basso e spostamenti delle colonne
function listen(t) {
  snd.active = !!audioCtx && (!!micStream || !audioEl.paused);
  if (!snd.active) {
    snd.rms *= 0.8; snd.bass *= 0.8; snd.kick *= 0.8;
    colDy.fill(0);
    hooks.meter(0);
    return;
  }
  analyser.getByteFrequencyData(freq);
  analyser.getFloatTimeDomainData(timeData);
  if (fx.wave.on) for (const band in BANDS)
    if (BANDS[band].on) bandAn[band].getFloatTimeDomainData(bandData[band]);

  let sum = 0;
  for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i];
  snd.rms = Math.min(1, Math.sqrt(sum / timeData.length) * 4 * SENS);
  hooks.meter(snd.rms);

  const bassTop = Math.max(2, Math.round(150 / (audioCtx.sampleRate / 2) * freq.length));
  let b = 0;
  for (let i = 1; i < bassTop; i++) b += freq[i];
  snd.bass = Math.min(1.5, b / (bassTop - 1) / 255 * SENS);
  const beat = snd.bass > 0.3 && snd.bass > snd.bassAvg * 1.25 + 0.05 && t - snd.lastBeat > 180;
  snd.bassAvg = snd.bassAvg * 0.9 + snd.bass * 0.1;
  snd.kick *= 0.8;
  if (beat && fx.bass.on && fx.bass.v > 0) {
    snd.lastBeat = t;
    snd.kick = 1;
    addShock(D.w / 2, D.h / 2, t);
  }
  for (let x = 0; x < D.w; x++) {
    let dy = 0;
    if (fx.spec.on) {
      const a = Math.min(1.5, Math.pow(freq[colBin[x]] / 255, 2) * SENS);
      dy += a * fx.spec.v * 0.8 * Math.sin(t * 0.06 + x * 1.7);
    }
    if (fx.wave.on) {
      const idx = Math.floor(x / D.w * timeData.length);
      let s = 0;
      for (const band in BANDS) if (BANDS[band].on) s += bandData[band][idx] * BANDS[band].boost;
      dy += s * SENS * fx.wave.v * 6;
    }
    colDy[x] = dy * ch;
  }
}

/* ---------------- Stili ----------------
   cell(i, x, y, px, py, v): i = cella da cui leggere colore e luminosità (con le
   distorsioni può essere diversa da quella disegnata), x e y = posizione naturale
   nella griglia, px e py = posizione in pixel, v = luminosità animata (0..1).
   "ink" = quanto la cella deve essere marcata: le zone chiare su sfondo scuro. */
const ink = v => D.color !== D.invert ? v : 1 - v;
const inkDark = v => D.invert ? 1 - v : v;
const TAU = Math.PI * 2;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const KATA = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789:.=*+-<>";
const GREENS = Array.from({ length: 25 }, (_, q) =>
  `rgb(${Math.round(30 * q / 24)},${Math.round(255 * q / 24)},${Math.round(80 * q / 24)})`);
let mHead = new Float32Array(0), mSpeed, mChar = new Uint8Array(0);
let rowPts = [];
let TEXT = [..."ASCIIART"];
let EDGE = 0.15;
let LEVELS = 4;
let VORO = 3;                        // grandezza delle tessere Voronoi, in celle
let EMOJI = [..."🌑🌘🌗🌖🌕"];       // rampa dello stile Emoji, dal buio al chiaro

const GRAYS = Array.from({ length: 33 }, (_, q) => { const g = Math.round(q * 255 / 32); return `rgb(${g},${g},${g})`; });
const colorCache = new Map();
function rgbStr(r, g, b) {
  const q = c => Math.min(255, Math.max(0, Math.round(c / 8) * 8));
  r = q(r); g = q(g); b = q(b);
  const key = (r << 16) | (g << 8) | b;
  let s = colorCache.get(key);
  if (!s) { s = `rgb(${r},${g},${b})`; colorCache.set(key, s); }
  return s;
}
function shade(i, v, levels) {
  if (!D.color) {
    let g = 1 - ink(v);
    if (levels) g = Math.round(g * (levels - 1)) / (levels - 1);
    return GRAYS[Math.round(g * 32)];
  }
  let r, g, b;
  if (palette === "originale") {
    const dv = (v - base[i] / n) * 255;
    r = D.rgb[i * 3] + dv; g = D.rgb[i * 3 + 1] + dv; b = D.rgb[i * 3 + 2] + dv;
  } else {
    [r, g, b] = PALETTES[palette].map(D.rgb[i * 3], D.rgb[i * 3 + 1], D.rgb[i * 3 + 2], Math.min(1, Math.max(0, v)));
  }
  if (levels) {
    const s = 255 / (levels - 1), q = c => Math.round(Math.min(255, Math.max(0, c)) / s) * s;
    r = q(r); g = q(g); b = q(b);
  }
  return rgbStr(r, g, b);
}

// Braille: ogni carattere ha 2×4 puntini, quindi 8 "pixel" per cella
const BR_DX = [0, 0, 0, 1, 1, 1, 0, 1], BR_DY = [0, 1, 2, 0, 1, 2, 3, 3];
const BR_T = [0, 6, 1, 4, 2, 5, 7, 3].map(t => (t + 0.5) / 8);

// Emoji: ogni simbolo della rampa viene disegnato una volta in una piccola tela
// e poi copiato (molto più veloce di scrivere l'emoji in ogni cella).
let emojiKey = "", emojiAtlas = [];
function ensureEmoji() {
  const dpr = cv.width / boxW || 1, g = Math.max(6, Math.ceil(cw * dpr * 1.25));
  const key = EMOJI.join("") + "|" + g;
  if (key === emojiKey) return;
  emojiKey = key;
  emojiAtlas = EMOJI.map(sym => {
    const c = document.createElement("canvas");
    c.width = c.height = g;
    const x = c.getContext("2d");
    x.font = `${Math.round(g * 0.78)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(sym, g / 2, g / 2 + g * 0.04);
    return c;
  });
}

// Voronoi: semi disposti su una griglia con scarto casuale; il poligono di ognuno si
// ricava tagliando un quadrato con le mediane dei semi vicini. Si ricalcola solo quando
// cambiano misure o grandezza.
let voroKey = "", voroCells = [];
function buildVoronoi() {
  const sp = cw * VORO, gW = cw * (D.w + EXTRA), gH = ch * D.h;
  const key = [sp.toFixed(2), gW.toFixed(1), gH.toFixed(1), D.w, D.h].join("|");
  if (key === voroKey) return;
  voroKey = key;
  const cols = Math.ceil(gW / sp) + 1, rows = Math.ceil(gH / sp) + 1;
  const seeds = [];
  let seed = 1234567;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // sempre gli stessi semi
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++)
    seeds.push([(i + 0.15 + rnd() * 0.7) * sp, (j + 0.15 + rnd() * 0.7) * sp]);
  voroCells = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const s = seeds[j * cols + i];
    if (s[0] > gW + sp * 0.5 || s[1] > gH + sp * 0.5) continue;
    let poly = [[s[0] - 3 * sp, s[1] - 3 * sp], [s[0] + 3 * sp, s[1] - 3 * sp], [s[0] + 3 * sp, s[1] + 3 * sp], [s[0] - 3 * sp, s[1] + 3 * sp]];
    for (let dj = -2; dj <= 2 && poly.length; dj++) for (let di = -2; di <= 2 && poly.length; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
      const q = seeds[jj * cols + ii];
      const nx = q[0] - s[0], ny = q[1] - s[1], mx = (q[0] + s[0]) / 2, my = (q[1] + s[1]) / 2;
      const out = [];
      for (let a = 0; a < poly.length; a++) {   // taglio di Sutherland–Hodgman
        const p = poly[a], r = poly[(a + 1) % poly.length];
        const dp = (p[0] - mx) * nx + (p[1] - my) * ny, dr = (r[0] - mx) * nx + (r[1] - my) * ny;
        if (dp <= 0) out.push(p);
        if ((dp <= 0) !== (dr <= 0)) {
          const f = dp / (dp - dr);
          out.push([p[0] + (r[0] - p[0]) * f, p[1] + (r[1] - p[1]) * f]);
        }
      }
      poly = out;
    }
    if (poly.length < 3) continue;
    const cx = Math.min(D.w - 1, Math.max(0, Math.floor(s[0] / cw))), cy = Math.min(D.h - 1, Math.max(0, Math.floor(s[1] / ch)));
    voroCells.push({ poly, c: cy * D.w + cx });
  }
}

const STYLES = {
  // Caratteri scelti in base alla luminosità (lo stile originale)
  ascii: {
    aspect: 2, bg: pageBg,
    begin() { if (!D.color) ctx.fillStyle = D.fg; },
    cell(i, x, y, px, py, v) {
      const c = D.chars[Math.round(v * n)];
      if (c === " ") return;
      if (D.color) ctx.fillStyle = fills[i];
      ctx.fillText(c, px, py);
    },
  },
  // Braille: 8 puntini per carattere, dettaglio molto più fine dell'ASCII
  braille: {
    aspect: 2, bg: pageBg,
    begin() { if (!D.color) ctx.fillStyle = D.fg; },
    cell(i, x, y, px, py, v) {
      if (!D.sub) return;
      const cx = i % D.w, cy = (i / D.w) | 0;   // la cella letta, anche con le distorsioni
      const dv = v - base[i] / n, W2 = D.w * 2;
      let bits = 0;
      for (let k = 0; k < 8; k++) {
        const l = D.sub[(cy * 4 + BR_DY[k]) * W2 + cx * 2 + BR_DX[k]] / 255 + dv;
        if (ink(l) > BR_T[k]) bits |= 1 << k;
      }
      if (!bits) return;
      if (D.color) ctx.fillStyle = fills[i];
      ctx.fillText(String.fromCharCode(0x2800 + bits), px, py);
    },
  },
  // Testo: l'immagine è composta dalla frase ripetuta; la luminosità decide il colore
  testo: {
    aspect: 2, bg: pageBg,
    begin() {},
    cell(i, x, y, px, py, v) {
      if (ink(v) < 0.08) return;
      ctx.fillStyle = shade(i, v);
      ctx.fillText(TEXT[i % TEXT.length], px, py);
    },
  },
  // Contorni: sui bordi un carattere orientato come la linea, all'interno puntini leggeri
  contorni: {
    aspect: 2, bg: pageBg,
    begin() {},
    cell(i, x, y, px, py, v) {
      const jump = v - base[i] / n;
      let c;
      if (edgeMag[i] + jump * 0.3 > EDGE) c = Math.abs(jump) > 0.4 ? "/\\|-"[Math.random() * 4 | 0] : edgeChar[i];
      else if (ink(v) > 0.6) c = ".";
      else return;
      ctx.fillStyle = D.color ? shade(i, Math.max(v, 0.85)) : D.fg;
      ctx.fillText(c, px, py);
    },
  },
  // Matrix: colonne di katakana verdi che cadono; l'immagine emerge nelle scie
  matrix: {
    aspect: 2, bg: () => "#000",
    begin() {
      if (mHead.length !== D.w || mChar.length !== total) {
        mHead = Float32Array.from({ length: D.w }, () => Math.random() * D.h * 2 - D.h);
        mSpeed = Float32Array.from({ length: D.w }, () => 0.3 + Math.random() * 0.7);
        mChar = Uint8Array.from({ length: total }, () => Math.random() * KATA.length);
      }
      const trail = D.h * 0.6;
      for (let x = 0; x < D.w; x++) {
        mHead[x] += mSpeed[x] * SPEED;
        if (mHead[x] - trail > D.h) { mHead[x] = -Math.random() * D.h * 0.5; mSpeed[x] = 0.3 + Math.random() * 0.7; }
      }
    },
    cell(i, x, y, px, py, v) {
      const d = mHead[x] - y, trail = D.h * 0.6;
      const head = d >= 0 && d < 1;
      const glow = d >= 0 && d < trail ? 1 - d / trail : 0;
      if (head || Math.random() < 0.04 * VARY) mChar[i] = Math.random() * KATA.length;
      const level = inkDark(v) * (0.35 + 0.65 * glow);
      if (!head && level < 0.04) return;
      ctx.fillStyle = head ? "#d8ffe0" : GREENS[Math.min(24, Math.round(level * 24))];
      ctx.fillText(KATA[mChar[i]], px, py);
    },
  },
  // Emoji: una rampa di simboli dal buio al chiaro (si scrive nelle opzioni)
  emoji: {
    aspect: 1, bg: pageBg, maxCols: 140,   // ogni cella è una copia d'immagine: pesa molto
    begin() { ensureEmoji(); },
    cell(i, x, y, px, py, v) {
      const k = Math.round(Math.min(1, Math.max(0, v)) * (emojiAtlas.length - 1)), s = cw * 1.15 * SIZE;
      ctx.drawImage(emojiAtlas[k], px - s / 2, py - s / 2, s, s);
    },
  },
  // Retino tipografico: un cerchio per cella, più grande dove c'è più "inchiostro"
  retino: {
    aspect: 1, bg: pageBg,
    begin() { ctx.fillStyle = D.fg; if (!D.color) ctx.beginPath(); },
    cell(i, x, y, px, py, v) {
      const r = Math.sqrt(ink(v)) * cw * 0.6 * SIZE;
      if (r < 0.3) return;
      if (D.color) { ctx.fillStyle = fills[i]; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill(); }
      else { ctx.moveTo(px + r, py); ctx.arc(px, py, r, 0, TAU); }
    },
    end() { if (!D.color) ctx.fill(); },
  },
  // Dithering ordinato (Bayer 4×4): ogni cella è un quadratino acceso o spento
  dithering: {
    aspect: 1, bg: pageBg,
    begin() { ctx.fillStyle = D.fg; if (!D.color) ctx.beginPath(); },
    cell(i, x, y, px, py, v) {
      if (ink(v) <= (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16) return;
      const s = cw * SIZE + 0.5;
      if (D.color) { ctx.fillStyle = fills[i]; ctx.fillRect(px - s / 2, py - s / 2, s, s); }
      else ctx.rect(px - s / 2, py - s / 2, s, s);
    },
    end() { if (!D.color) ctx.fill(); },
  },
  // Pixel art: quadrati pieni con pochi livelli di colore
  pixel: {
    aspect: 1, bg: pageBg,
    begin() {},
    cell(i, x, y, px, py, v) {
      const s = cw * SIZE + 0.5;
      ctx.fillStyle = shade(i, v, LEVELS);
      ctx.fillRect(px - s / 2, py - s / 2, s, s);
    },
  },
  // Tratteggio: da 0 a 4 strati di linee incrociate, come un'incisione a penna
  tratteggio: {
    aspect: 1, bg: pageBg,
    begin() {
      ctx.lineWidth = Math.max(0.7, cw * 0.1 * SIZE);
      ctx.lineCap = "round";
      if (!D.color) { ctx.strokeStyle = D.fg; ctx.beginPath(); }
    },
    cell(i, x, y, px, py, v) {
      const e = ink(v), h = cw * 0.5 * SIZE;
      if (e < 0.12) return;
      if (D.color) { ctx.strokeStyle = shade(i, v); ctx.beginPath(); }
      ctx.moveTo(px - h, py - h); ctx.lineTo(px + h, py + h);
      if (e > 0.35) { ctx.moveTo(px - h, py + h); ctx.lineTo(px + h, py - h); }
      if (e > 0.58) { ctx.moveTo(px - h, py); ctx.lineTo(px + h, py); }
      if (e > 0.8)  { ctx.moveTo(px, py - h); ctx.lineTo(px, py + h); }
      if (D.color) ctx.stroke();
    },
    end() { if (!D.color) ctx.stroke(); },
  },
  // Puntinismo: da 0 a 4 punti sparsi per cella, più fitti dove c'è più inchiostro
  puntini: {
    aspect: 1, bg: pageBg,
    begin() { if (!D.color) { ctx.fillStyle = D.fg; ctx.beginPath(); } },
    cell(i, x, y, px, py, v) {
      const count = Math.floor(ink(v) * 4.99);
      if (!count) return;
      if (Math.random() < 0.03 * VARY)
        for (let k = 0; k < 8; k++) dotOff[i * 8 + k] = Math.random() * 0.8 - 0.4;
      const r = cw * 0.14 * SIZE;
      if (D.color) { ctx.fillStyle = shade(i, v); ctx.beginPath(); }
      for (let k = 0; k < count; k++) {
        const dx = px + dotOff[i * 8 + k * 2] * cw, dy = py + dotOff[i * 8 + k * 2 + 1] * cw;
        ctx.moveTo(dx + r, dy);
        ctx.arc(dx, dy, r, 0, TAU);
      }
      if (D.color) ctx.fill();
    },
    end() { if (!D.color) ctx.fill(); },
  },
  // Linee ondulate: una linea per riga che si solleva dove c'è più inchiostro,
  // ognuna copre quelle dietro (come "Unknown Pleasures").
  linee: {
    aspect: 2, bg: pageBg,
    begin() {
      ctx.lineWidth = Math.max(1, cw * 0.18 * SIZE);
      ctx.lineJoin = ctx.lineCap = "round";
    },
    cell(i, x, y, px, py, v) {
      rowPts.push(px, py + ch * 0.45 - ink(v) * ch * 1.8 * SIZE, i);
    },
    row(y) {
      const p = rowPts;
      if (p.length < 6) { rowPts = []; return; }
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      for (let k = 3; k < p.length; k += 3) ctx.lineTo(p[k], p[k + 1]);
      ctx.lineTo(p[p.length - 3], (y + 1.5) * ch);
      ctx.lineTo(p[0], (y + 1.5) * ch);
      ctx.closePath();
      ctx.fillStyle = pageBg();
      ctx.fill();
      if (D.color) {
        for (let k = 3; k < p.length; k += 3) {
          ctx.beginPath();
          ctx.moveTo(p[k - 3], p[k - 2]);
          ctx.lineTo(p[k], p[k + 1]);
          ctx.strokeStyle = fills[p[k + 2]];
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        for (let k = 3; k < p.length; k += 3) ctx.lineTo(p[k], p[k + 1]);
        ctx.strokeStyle = D.fg;
        ctx.stroke();
      }
      rowPts = [];
    },
  },
  // Croci: un "+" per cella, con i bracci più lunghi dove c'è più inchiostro
  croci: {
    aspect: 1, bg: pageBg,
    begin() {
      ctx.lineWidth = Math.max(0.8, cw * 0.12 * SIZE);
      ctx.lineCap = "round";
    },
    cell(i, x, y, px, py, v) {
      const e = ink(v);
      if (e < 0.08) return;
      const h = cw * 0.52 * SIZE * (0.35 + 0.65 * e);
      ctx.strokeStyle = D.color ? shade(i, v) : D.fg;
      ctx.beginPath();
      ctx.moveTo(px - h, py); ctx.lineTo(px + h, py);
      ctx.moveTo(px, py - h); ctx.lineTo(px, py + h);
      ctx.stroke();
    },
  },
  // Mosaico: tessere quadrate con la fuga, ognuna con una lieve variazione di tono
  mosaico: {
    aspect: 1, bg: pageBg,
    begin() {},
    cell(i, x, y, px, py, v) {
      const s = cw * 0.9 * SIZE, tone = dotOff[i * 8] * 0.18;
      ctx.fillStyle = shade(i, Math.min(1, Math.max(0, v + tone)));
      ctx.fillRect(px - s / 2, py - s / 2, s, s);
    },
  },
  // Esagoni: nido d'ape, righe dispari spostate di mezza cella
  esagoni: {
    aspect: 0.866, extra: 0.5, bg: pageBg, maxCols: 180,   // un poligono per cella
    begin() {},
    cell(i, x, y, px, py, v) {
      const e = ink(v);
      if (e < 0.05) return;
      const R = cw * 0.577 * SIZE * (0.45 + 0.55 * Math.sqrt(e)), cx = px + (y & 1) * cw * 0.5 + cw * 0.25;
      ctx.fillStyle = shade(i, v);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + k * Math.PI / 3, qx = cx + Math.cos(a) * R, qy = py + Math.sin(a) * R;
        k ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy);
      }
      ctx.closePath();
      ctx.fill();
    },
  },
  // Voronoi: vetrata di tessere irregolari, ognuna del colore della cella sotto il suo seme
  voronoi: {
    aspect: 1, bg: pageBg,
    begin() { buildVoronoi(); },
    cell(i, x, y, px, py, v) { vBuf[i] = v; },
    end() {
      ctx.lineWidth = Math.max(0.6, cw * 0.12);
      ctx.strokeStyle = pageBg();
      ctx.lineJoin = "round";
      for (const c of voroCells) {
        const p = c.poly;
        ctx.beginPath();
        ctx.moveTo(p[0][0], p[0][1]);
        for (let k = 1; k < p.length; k++) ctx.lineTo(p[k][0], p[k][1]);
        ctx.closePath();
        ctx.fillStyle = shade(c.c, vBuf[c.c]);
        ctx.fill();
        ctx.stroke();
      }
    },
  },
  // Pennellate: tratti orientati lungo i contorni, come un quadro a olio
  pennellate: {
    aspect: 1, bg: pageBg,
    begin() { ctx.lineCap = "round"; ctx.lineWidth = Math.max(1, cw * 1.15 * SIZE); },
    cell(i, x, y, px, py, v) {
      if (ink(v) < 0.04) return;
      const a = edgeMag[i] > 0.06 ? edgeAng[i] + Math.PI / 2 : dotOff[i * 8] * Math.PI * 2;
      const l = cw * 0.8 * SIZE * (1 + dotOff[i * 8 + 1]), dx = Math.cos(a) * l, dy = Math.sin(a) * l;
      ctx.strokeStyle = shade(i, v);
      ctx.beginPath();
      ctx.moveTo(px - dx, py - dy);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();
    },
  },
};
let style = "ascii";
const STYLE_ORDER = ["ascii", "braille", "testo", "contorni", "matrix", "emoji", "retino", "dithering", "pixel", "tratteggio", "puntini", "linee", "croci", "mosaico", "esagoni", "voronoi", "pennellate"];

/* ---------------- Ciclo di disegno ---------------- */
const timing = { anim: 0, cells: 0, post: 0 };
const ema = (old, x) => old * 0.85 + x * 0.15;
let kalPhase = 0;

function draw(t) {
  const t0 = performance.now();
  stir(t);
  listen(t);
  const dt = Math.min(t - lastT, 100);
  phase += dt * 0.0025 * SPEED;
  if (fx.kal.on) kalPhase += dt * 0.0004 * fx.kal.v;
  lastT = t;
  const vary = VARY + (fx.chaos.on ? snd.rms * fx.chaos.v * 4 : 0);
  const changeProb = Math.min(1, 0.08 * vary), amp = J * vary;
  const kick = fx.bass.on ? 1 + snd.kick * fx.bass.v * 0.04 : 1;
  const midX = cw * (D.w + EXTRA) / 2, midY = ch * D.h / 2;
  const S = STYLES[style];
  const w = D.w, hh = D.h * CELL;   // dimensioni in unità uniformi (celle di larghezza)

  // Distorsioni: parametri calcolati una volta per fotogramma
  const dW = fx.dwave.on && fx.dwave.v > 0, dF = fx.fish.on, dS = fx.swirl.on, dR = fx.ripple.on && shocks.length > 0;
  const dM = fx.mirror.on, dK = fx.kal.on;
  const warp = dW || dF || dS || dR || dM || dK;
  const Rw = Math.min(w, hh) * 0.5;
  const at = where => where === "puntatore" && mouse ? [mouse.x, mouse.y * CELL] : [w / 2, hh / 2];
  const [fcx, fcy] = at(opt.fishAt), [scx, scy] = at(opt.swirlAt);
  const fExp = 1 + fx.fish.v, sAng = fx.swirl.v * 2.4, wAmp = fx.dwave.v * 1.4;
  const wedge = Math.PI / Math.max(2, opt.kal), kCx = w / 2, kCy = hh / 2;
  const mirX = dM && (opt.mirror === "h" || opt.mirror === "hv"), mirY = dM && (opt.mirror === "v" || opt.mirror === "hv");

  const t1 = performance.now();
  ctx.fillStyle = S.bg();
  ctx.fillRect(-ox, -oy, boxW, boxH);   // tutto il canvas, anche fuori dalla griglia
  S.begin();
  for (let y = 0, i = 0; y < D.h; y++) {
    for (let x = 0; x < D.w; x++, i++) {
      if (Math.random() < changeProb) jitter[i] = Math.random() * 2 - 1;
      let j = i;
      if (warp) {   // mappa inversa: da quale cella leggere il colore di questa
        let u = x + 0.5, vv = (y + 0.5) * CELL;
        if (mirX && u > w / 2) u = w - u;
        if (mirY && vv > hh / 2) vv = hh - vv;
        if (dK) {
          const dx = u - kCx, dy = vv - kCy, r = Math.hypot(dx, dy);
          let a = Math.atan2(dy, dx) + kalPhase;
          const k = Math.floor(a / wedge);
          a -= k * wedge;
          if (k & 1) a = wedge - a;
          u = kCx + Math.cos(a) * r; vv = kCy + Math.sin(a) * r;
        }
        if (dF) {
          const dx = u - fcx, dy = vv - fcy, r = Math.hypot(dx, dy);
          if (r < Rw && r > 0.001) { const f = Math.pow(r / Rw, fExp - 1); u = fcx + dx * f; vv = fcy + dy * f; }
        }
        if (dS) {
          const dx = u - scx, dy = vv - scy, r = Math.hypot(dx, dy);
          if (r < Rw) {
            const q = 1 - r / Rw, a = sAng * q * q, c = Math.cos(a), s = Math.sin(a);
            u = scx + dx * c - dy * s; vv = scy + dx * s + dy * c;
          }
        }
        if (dW) {
          const u2 = u + Math.sin(vv * 0.35 + phase * 1.6) * wAmp * 0.6;
          vv += Math.sin(u * 0.22 + phase * 1.3) * wAmp;
          u = u2;
        }
        if (dR) { u -= dispX[i]; vv -= dispY[i]; }
        let sx = Math.round(u - 0.5), sy = Math.round(vv / CELL - 0.5);
        sx = sx < 0 ? 0 : sx >= D.w ? D.w - 1 : sx;
        sy = sy < 0 ? 0 : sy >= D.h ? D.h - 1 : sy;
        j = sy * D.w + sx;
      }
      const wave = Math.sin(x * 0.12 + y * 0.18 - phase) * J * 0.6;
      let v = Math.min(1, Math.max(0, (base[j] + jitter[i] * amp + wave) / n));
      const dis = disturb[i];
      if (dis > 0.02 && Math.random() < dis) v = Math.random();   // celle agitate: luminosità casuale
      let px = (x + 0.5) * cw, py = (y + 0.5) * ch + colDy[x];
      if (kick !== 1) { px = midX + (px - midX) * kick; py = midY + (py - midY) * kick; }
      if (mouse && dis > 0.02) {   // spinta radiale lontano dal cursore
        const dx = x + 0.5 - mouse.x, dy = (y + 0.5 - mouse.y) * CELL;
        const len = Math.hypot(dx, dy) || 1, f = dis * PUSH * cw;
        px += dx / len * f;
        py += dy / len * f;
      }
      S.cell(j, x, y, px, py, v);
    }
    if (S.row) S.row(y);
  }
  if (S.end) S.end();
  const t2 = performance.now();
  post(t);
  if (fx.blob.on) { updateBlobs(t); drawBlobs(t); }   // il tracking sta sopra a tutto, nitido
  const t3 = performance.now();
  timing.anim = ema(timing.anim, t1 - t0);
  timing.cells = ema(timing.cells, t2 - t1);
  timing.post = ema(timing.post, t3 - t2);
}

/* ---------------- Risparmio, ciclo e qualità automatica ----------------
   Se niente si muove l'immagine è identica alla precedente e non si ridisegna.
   Ogni modifica dai controlli forza un nuovo disegno (needsDraw). */
let needsDraw = true, idle = false;
function isStill() {
  return SPEED === 0 && VARY === 0 && !snd.active && snd.kick < 0.01 && !mouse && !shocks.length &&
         agitated === 0 && !(fx.glitch.on && fx.glitch.v > 0) && !(fx.crt.on && fx.crt.v > 0) &&
         !fx.vhs.on && !fx.grain.on && !fx.blob.on && !(fx.kal.on && fx.kal.v > 0) && !fx.ripple.on;
}
let paused = false, last = 0;
function loop(t) {
  if (!paused && t - last > 50) {                       // ~20 fotogrammi al secondo
    idle = !needsDraw && isStill();
    if (!idle) {
      const t0 = performance.now();
      draw(t);
      noteFrame(t, performance.now() - t0);
      needsDraw = false;
    }
    last = t;
    autoTune(t);
  }
  hooks.tick(t);
  requestAnimationFrame(loop);
}
hooks.tick = () => {};

let tuneLast = 0, tuneChanged = 0;
const frameTimes = [], drawMs = [];
function noteFrame(t, ms) {
  frameTimes.push(t);
  drawMs.push(ms);
  while (frameTimes.length && t - frameTimes[0] >= 1000) { frameTimes.shift(); drawMs.shift(); }
}
// Una volta al secondo controlla il tempo medio di disegno: troppo lento scende di
// qualità, di nuovo fluido risale, senza mai superare il livello scelto.
function autoTune(t) {
  if (t - tuneLast < 1000) return;
  tuneLast = t;
  if (!autoQ || recorder || idle || drawMs.length < 5) return;
  const ms = drawMs.reduce((a, b) => a + b, 0) / drawMs.length;
  const cur = currentQuality(), dpr = qualityDpr(cur);
  let k = Q_LEVELS.indexOf(cur);
  if (ms > 40) {
    while (k > 0 && qualityDpr(Q_LEVELS[k - 1]) >= dpr) k--;
    if (k > 0) { autoLevel = Q_LEVELS[k - 1]; tuneChanged = t; fit(); needsDraw = true; }
  } else if (ms < 15 && autoLevel && t - tuneChanged > 5000) {
    autoLevel = Q_LEVELS[k + 1] === quality ? null : Q_LEVELS[k + 1];
    tuneChanged = t; fit(); needsDraw = true;
  }
}

/* ---------------- Salvataggio e registrazione ---------------- */
let recorder = null, recTimer = null;
function fileName(ext) {
  const d = new Date(), p = v => String(v).padStart(2, "0");
  return `sound-visual-art-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
         `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}
// Il link va nella pagina prima del clic (alcuni browser altrimenti aprono il file al posto
// della pagina) e resta un po' prima di essere revocato (Safari lo legge in ritardo).
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 10000);
}
function saveFrame() {
  draw(performance.now());   // fotogramma fresco, anche se in pausa o fermo
  cv.toBlob(blob => {
    if (!blob) { hooks.error("Impossibile creare il PNG."); return; }
    const name = fileName("png");
    // Su telefono si apre il foglio di condivisione ("Salva immagine"); altrimenti scarica
    if (COARSE && navigator.canShare && navigator.share) {
      const file = new File([blob], name, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file] }).catch(err => { if (err.name !== "AbortError") download(blob, name); });
        return;
      }
    }
    download(blob, name);
  }, "image/png");
}
function pickFormat(withAudio) {
  const formats = [
    ...(withAudio ? [["video/mp4;codecs=avc1,mp4a.40.2", "mp4"], ["video/webm;codecs=vp9,opus", "webm"]] : []),
    ["video/mp4;codecs=avc1", "mp4"], ["video/mp4", "mp4"],
    ["video/webm;codecs=vp9", "webm"], ["video/webm", "webm"],
  ];
  return formats.find(([type]) => MediaRecorder.isTypeSupported(type));
}
function toggleRecording() {
  if (recorder) { recorder.stop(); return; }
  if (!window.MediaRecorder || !cv.captureStream) {
    hooks.error("Questo browser non supporta la registrazione video.");
    return;
  }
  const format = pickFormat(!!audioCtx);
  if (!format) {
    hooks.error("Questo browser non supporta nessun formato video registrabile (MP4 o WebM).");
    return;
  }
  const [type, ext] = format;
  const stream = cv.captureStream(30);
  if (audioCtx) recDest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
  const chunks = [], start = performance.now();
  try {
    recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = e => hooks.error("Errore durante la registrazione: " + (e.error ? e.error.message : ""));
    recorder.onstop = () => {
      stream.getVideoTracks().forEach(tr => tr.stop());
      if (chunks.length) download(new Blob(chunks, { type }), fileName(ext));
      recorder = null;
      clearInterval(recTimer);
      hooks.rec(null);
      fit();                     // il canvas torna a seguire la finestra
      draw(performance.now());
    };
    recorder.start(1000);
  } catch (err) {
    stream.getVideoTracks().forEach(tr => tr.stop());
    recorder = null;
    hooks.error("Impossibile avviare la registrazione: " + err.message);
    return;
  }
  const tick = () => hooks.rec(Math.floor((performance.now() - start) / 1000));
  tick();
  recTimer = setInterval(tick, 250);
}
hooks.rec = () => {};

/* ---------------- Dall'immagine alla griglia ----------------
   L'immagine viene campionata a 2×4 pixel per cella (serve al Braille), poi:
   regolazioni colore → pixel sorting → medie per cella. I due passi (dati e griglia)
   sono separati: i cursori delle regolazioni rifanno solo il secondo. */
let srcImg = null, srcF = null, srcFW = 0, srcFH = 0;
function buildGrid(img, cols) {
  const h = Math.max(1, Math.round(img.naturalHeight / img.naturalWidth * cols / CELL));
  const f = document.createElement("canvas");
  f.width = cols * 2;
  f.height = h * 4;
  const o = f.getContext("2d", { willReadFrequently: true });
  o.fillStyle = D.bg;                 // le zone trasparenti prendono il colore di sfondo
  o.fillRect(0, 0, f.width, f.height);
  o.imageSmoothingQuality = "high";
  o.drawImage(img, 0, 0, f.width, f.height);
  srcF = o.getImageData(0, 0, f.width, f.height).data;
  srcFW = f.width; srcFH = f.height;
  D.w = cols;
  D.h = h;
  rebuildData();
  colDy = new Float32Array(D.w);
  if (audioCtx) mapColumns();
  shocks.length = 0;
  mouse = null;
  blobs.length = 0;
  fit();
  draw(performance.now());
}
function adjustActive() {
  return ADJ.bright !== 0 || ADJ.contrast !== 1 || ADJ.sat !== 1 || ADJ.hue !== 0 || ADJ.invert || ADJ.post > 0;
}
function rebuildData() {
  if (!srcF) return;
  const W = srcFW, H = srcFH, work = new Uint8ClampedArray(srcF);
  if (adjustActive()) applyAdjust(work);
  if (fx.psort.on) pixelSort(work, W, H);
  const cols = D.w, rows = D.h;
  D.lum = new Array(cols * rows);
  D.rgb = new Array(cols * rows * 3);
  D.sub = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++)
    D.sub[p] = Math.round(work[p * 4] * 0.299 + work[p * 4 + 1] * 0.587 + work[p * 4 + 2] * 0.114);
  for (let cy = 0, c = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++, c++) {
    let r = 0, g = 0, b = 0;
    for (let k = 0; k < 4; k++) for (let m = 0; m < 2; m++) {
      const p = ((cy * 4 + k) * W + cx * 2 + m) * 4;
      r += work[p]; g += work[p + 1]; b += work[p + 2];
    }
    r = Math.round(r / 8); g = Math.round(g / 8); b = Math.round(b / 8);
    D.rgb[c * 3] = r; D.rgb[c * 3 + 1] = g; D.rgb[c * 3 + 2] = b;
    D.lum[c] = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
  }
  setPixels();
  needsDraw = true;
}
// Luminosità, contrasto, inversione e posterizzazione passano da una tabella (LUT);
// saturazione e tinta da una matrice 3×3 (le stesse formule dei filtri CSS).
function applyAdjust(px) {
  const lut = new Uint8ClampedArray(256), L = ADJ.post;
  for (let v = 0; v < 256; v++) {
    let x = ((v / 255 - 0.5) * ADJ.contrast + 0.5 + ADJ.bright);
    x = Math.min(1, Math.max(0, x));
    if (ADJ.invert) x = 1 - x;
    if (L > 1) x = Math.round(x * (L - 1)) / (L - 1);
    lut[v] = Math.round(x * 255);
  }
  const mat = ADJ.sat !== 1 || ADJ.hue !== 0;
  let m;
  if (mat) {
    const s = ADJ.sat, a = ADJ.hue * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    const hr = [0.213 + c * 0.787 - sn * 0.213, 0.715 - c * 0.715 - sn * 0.715, 0.072 - c * 0.072 + sn * 0.928,
                0.213 - c * 0.213 + sn * 0.143, 0.715 + c * 0.285 + sn * 0.140, 0.072 - c * 0.072 - sn * 0.283,
                0.213 - c * 0.213 - sn * 0.787, 0.715 - c * 0.715 + sn * 0.715, 0.072 + c * 0.928 + sn * 0.072];
    const sa = [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
                0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
                0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
    m = new Array(9);   // prima la tinta, poi la saturazione (prodotto delle due matrici)
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++)
      m[r * 3 + q] = sa[r * 3] * hr[q] + sa[r * 3 + 1] * hr[3 + q] + sa[r * 3 + 2] * hr[6 + q];
  }
  for (let p = 0; p < px.length; p += 4) {
    let r = px[p], g = px[p + 1], b = px[p + 2];
    if (mat) {
      const r2 = m[0] * r + m[1] * g + m[2] * b, g2 = m[3] * r + m[4] * g + m[5] * b, b2 = m[6] * r + m[7] * g + m[8] * b;
      r = r2 < 0 ? 0 : r2 > 255 ? 255 : r2; g = g2 < 0 ? 0 : g2 > 255 ? 255 : g2; b = b2 < 0 ? 0 : b2 > 255 ? 255 : b2;
    }
    px[p] = lut[r | 0]; px[p + 1] = lut[g | 0]; px[p + 2] = lut[b | 0];
  }
}
// Pixel sorting: i pixel di ogni riga (o colonna) la cui luminosità sta tra due soglie
// si riordinano dal più scuro al più chiaro, e creano lunghe strisce colorate.
function pixelSort(px, W, H) {
  const u32 = new Uint32Array(px.buffer), vert = opt.psDir === "v";
  const lo = opt.psLo * 255, hi = opt.psHi * 255;
  const lines = vert ? W : H, len = vert ? H : W, maxRun = Math.max(2, Math.round(len * opt.psLen * (0.2 + fx.psort.v * 0.4)));
  const lum = p => (p & 255) * 0.299 + ((p >> 8) & 255) * 0.587 + ((p >> 16) & 255) * 0.114;   // pixel RGBA little-endian
  const run = [];
  for (let l = 0; l < lines; l++) {
    const at = k => vert ? k * W + l : l * W + k;
    let k = 0;
    while (k < len) {
      let y = lum(u32[at(k)]);
      if (y < lo || y > hi) { k++; continue; }
      const start = k;
      run.length = 0;
      while (k < len && k - start < maxRun) {
        const p = u32[at(k)], yy = lum(p);
        if (yy < lo || yy > hi) break;
        run.push(p);
        k++;
      }
      if (run.length > 1) {
        run.sort((a, b) => lum(a) - lum(b));
        for (let q = 0; q < run.length; q++) u32[at(start + q)] = run[q];
      }
    }
  }
}

/* ---------------- Stile, palette e immagine ---------------- */
function setStyle(name) {
  style = name;
  hooks.style(name);
  const aspect = STYLES[name].aspect;
  if (aspect !== CELL) {
    CELL = aspect;
    if (srcImg) { buildGrid(srcImg, D.w); return; }
    fit();
    findEdges();
  } else fit();
  needsDraw = true;
  draw(performance.now());
}
hooks.style = () => {};
function cycleStyle(step) {
  setStyle(STYLE_ORDER[(STYLE_ORDER.indexOf(style) + step + STYLE_ORDER.length) % STYLE_ORDER.length]);
}
function setPalette(name) {
  palette = name;
  hooks.palette(name);
  applyPalette();
  needsDraw = true;
  draw(performance.now());
}
hooks.palette = () => {};
// Il numero di segni per riga cambia al massimo una volta per fotogramma mentre si trascina
let colsWanted = 0, colsPending = 0;
function setCols(v) {
  if (!srcImg) { colsPending = v; return; }
  if (!colsWanted) requestAnimationFrame(() => { buildGrid(srcImg, colsWanted); colsWanted = 0; });
  colsWanted = v;
}
let rebuildQueued = false;
function scheduleRebuild() {
  if (rebuildQueued) return;
  rebuildQueued = true;
  requestAnimationFrame(() => { rebuildQueued = false; rebuildData(); draw(performance.now()); });
}
function loadImageFile(file, done) {
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    if (!img.naturalWidth || !img.naturalHeight) {
      hooks.error("Questa immagine non ha dimensioni leggibili. Prova con un file JPG, PNG, WebP o GIF.");
      return;
    }
    srcImg = img;
    buildGrid(img, colsPending || D.w);
    colsPending = 0;
    done && done(file.name);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    hooks.error("Impossibile aprire questa immagine. Prova con un file JPG, PNG, WebP o GIF.");
  };
  img.src = url;
}

/* ---------------- Interazione ---------------- */
function toCells(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left - ox) / cw, y: (e.clientY - r.top - oy) / ch };
}
cv.addEventListener("pointermove", e => { mouse = toCells(e); });
cv.addEventListener("pointerleave", () => { mouse = null; });
cv.addEventListener("pointerup", e => { if (e.pointerType === "touch") mouse = null; });
cv.addEventListener("pointerdown", e => {
  const p = toCells(e);
  addShock(p.x, p.y, performance.now());
  touchArea(p.x, p.y, RADIUS * 2.5, 1);
  if (e.pointerType === "touch") mouse = p;
});
