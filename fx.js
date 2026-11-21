"use strict";
/* ==========================================================================
   Effetti sopra il disegno: bloom, separazione RGB, VHS, glitch, rumore, CRT e
   blob tracking. Lavorano sui pixel già disegnati del canvas con soli drawImage
   e riempimenti (niente getImageData a ogni fotogramma): restano veloci anche
   sui telefoni, e finiscono anche nei PNG e nei video.
   ========================================================================== */

const bloomA = document.createElement("canvas"), bloomB = document.createElement("canvas");
const glitchC = document.createElement("canvas");
const splitA = document.createElement("canvas"), splitB = document.createElement("canvas");
function sizeCanvas(c, w, h) {
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return c.getContext("2d");
}
let scanPattern = null, vignette = null, grainPattern = null;
// Sfondo scuro? Calcolato dal colore vero dello sfondo (conta per i Duotone chiari)
function darkBg() {
  const s = STYLES[style].bg();
  const c = s[0] === "#"
    ? (s.length === 4 ? [...s.slice(1)].map(h => parseInt(h + h, 16)) : [1, 3, 5].map(k => parseInt(s.slice(k, k + 2), 16)))
    : s.match(/\d+/g).map(Number);
  return c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114 < 128;
}

function post(t) {
  const W = cv.width, H = cv.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);   // pixel reali del canvas
  if (fx.bloom.on && fx.bloom.v > 0) bloom(W, H);
  if (fx.rgb.on && fx.rgb.v > 0) rgbSplit(W, H);
  if (fx.vhs.on && fx.vhs.v > 0) vhs(W, H, t);
  if (fx.glitch.on && fx.glitch.v > 0) glitch(W, H);
  if (fx.grain.on && fx.grain.v > 0) grain(W, H);
  if (fx.crt.on && fx.crt.v > 0) crt(W, H);
  ctx.restore();
}

// Bloom: l'immagine rimpicciolita e riallargata è sfocata; sommata sopra crea l'alone.
function bloom(W, H) {
  ctx.imageSmoothingEnabled = true;
  sizeCanvas(bloomA, Math.max(1, W / 6 | 0), Math.max(1, H / 6 | 0)).drawImage(cv, 0, 0, bloomA.width, bloomA.height);
  sizeCanvas(bloomB, Math.max(1, W / 18 | 0), Math.max(1, H / 18 | 0)).drawImage(bloomA, 0, 0, bloomB.width, bloomB.height);
  ctx.globalCompositeOperation = darkBg() ? "lighter" : "multiply";
  for (const [c, a] of [[bloomA, 0.35], [bloomB, 0.25]]) {
    ctx.globalAlpha = Math.min(1, a * fx.bloom.v);
    ctx.drawImage(c, 0, 0, W, H);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

// Separazione RGB: il rosso scorre a sinistra, il ciano (verde + blu) a destra. Sommando
// le due copie su nero, dove si sovrappongono torna il colore giusto: solo i bordi si
// colorano. Vale su sfondo chiaro e scuro.
function rgbSplit(W, H) {
  const s = Math.max(1, Math.round((1 + 5 * fx.rgb.v) * (W / boxW)));
  for (const [c, col] of [[splitA, "#f00"], [splitB, "#0ff"]]) {
    const g = sizeCanvas(c, W, H);
    g.globalCompositeOperation = "copy";
    g.drawImage(cv, 0, 0);
    g.globalCompositeOperation = "multiply";
    g.fillStyle = col;
    g.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(splitA, -s, 0);
  ctx.drawImage(splitB, s, 0);
  ctx.globalCompositeOperation = "source-over";
}

// VHS: righe che ondeggiano, una fascia di tracking che sale con strappi e rumore, un
// leggero alone di colore. Lavora a strisce orizzontali (drawImage sulla stessa riga).
function vhs(W, H, t) {
  const a = fx.vhs.v, sc = W / boxW, strips = 56, sh = Math.ceil(H / strips);
  const bandY = ((t * 0.00018) % 1.25 - 0.1) * H, bandH = H * 0.08;
  for (let k = 0; k < strips; k++) {
    const y = k * sh;
    let dx = Math.sin(y / H * 14 + t * 0.0025) * 1.4 * a * sc;
    const inBand = y + sh > bandY && y < bandY + bandH;
    if (inBand) dx += (Math.random() - 0.3) * 20 * a * sc;
    if (Math.abs(dx) > 0.4) ctx.drawImage(cv, 0, y, W, sh, dx, y, W, sh);
  }
  ctx.globalAlpha = Math.min(0.5, 0.22 * a);
  ctx.globalCompositeOperation = darkBg() ? "lighter" : "multiply";
  ctx.drawImage(cv, 3 * sc, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 0.5 * Math.min(1, a);
  ctx.fillStyle = "#fff";
  for (let k = 0; k < 4 * a; k++)   // righe di rumore dentro la fascia
    ctx.fillRect(Math.random() * W * 0.6, bandY + Math.random() * bandH, W * (0.1 + Math.random() * 0.4), Math.max(1, sc));
  ctx.globalAlpha = 1;
}

// Glitch: strisce spostate a caso e una copia rossa sfasata. Più forte con i colpi di basso.
function glitch(W, H) {
  const amt = fx.glitch.v * (0.4 + snd.kick * 1.5 + snd.rms);
  if (darkBg()) {
    const shift = Math.round((1 + 5 * amt) * (W / boxW));
    const a = sizeCanvas(glitchC, W, H);
    a.globalCompositeOperation = "copy";
    a.drawImage(cv, 0, 0);
    a.globalCompositeOperation = "multiply";
    a.fillStyle = "#f00";
    a.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, 0.45 * amt);
    ctx.drawImage(glitchC, shift, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  if (Math.random() < 0.25 * amt + snd.kick) {
    const count = 1 + Math.floor(Math.random() * 4 * amt);
    for (let k = 0; k < count; k++) {
      const sy = Math.random() * H, sh = H * (0.01 + Math.random() * 0.08);
      const dx = (Math.random() * 2 - 1) * W * 0.06 * amt;
      ctx.drawImage(cv, 0, sy, W, sh, dx, sy, W, sh);
    }
  }
}

// Rumore di pellicola: una texture di grigi casuali, spostata a caso a ogni fotogramma
function grain(W, H) {
  if (!grainPattern) {
    const tile = document.createElement("canvas");
    tile.width = tile.height = 256;
    const g = tile.getContext("2d"), id = g.createImageData(256, 256);
    for (let p = 0; p < id.data.length; p += 4) { id.data[p] = id.data[p + 1] = id.data[p + 2] = Math.random() * 255; id.data[p + 3] = 255; }
    g.putImageData(id, 0, 0);
    grainPattern = ctx.createPattern(tile, "repeat");
  }
  ctx.save();
  ctx.translate(Math.random() * 256 | 0, Math.random() * 256 | 0);
  ctx.globalAlpha = Math.min(0.5, 0.11 * fx.grain.v);
  ctx.fillStyle = grainPattern;
  ctx.fillRect(-256, -256, W + 256, H + 256);
  ctx.restore();
}

// CRT: righe di scansione, angoli più scuri e un leggero sfarfallio
function crt(W, H) {
  if (!scanPattern) {
    const p = document.createElement("canvas");
    p.width = 1; p.height = 3;
    const pc = p.getContext("2d");
    pc.fillStyle = "#000";
    pc.fillRect(0, 2, 1, 1);
    scanPattern = ctx.createPattern(p, "repeat");
  }
  ctx.globalAlpha = Math.min(1, 0.4 * fx.crt.v);
  ctx.fillStyle = scanPattern;
  ctx.fillRect(0, 0, W, H);
  if (!vignette || vignette.w !== W || vignette.h !== H) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.9)");
    vignette = { w: W, h: H, g };
  }
  ctx.globalAlpha = Math.min(1, 0.6 * fx.crt.v);
  ctx.fillStyle = vignette.g;
  ctx.fillRect(0, 0, W, H);
  if (darkBg()) {
    ctx.globalAlpha = Math.random() * 0.04 * fx.crt.v;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 1;
}

/* ---------------- Blob tracking ----------------
   Su un'immagine ferma: si cercano le zone che superano una soglia (chiare, scure,
   di bordo o molto colorate), si raggruppano le celle vicine in "blob" (componenti
   connesse) e ognuno riceve riquadro, sigla e coordinate, con linee verso i blob più
   vicini. La soglia "respira" piano, quindi le zone crescono, si dividono e si fondono
   come in un tracciamento dal vivo; i blob mantengono la sigla finché si riconoscono.
   Il cursore (o il dito) è a sua volta un punto tracciato. */
const BLOB = { mode: "chiari", thr: 0.6, min: 0.4, max: 12, links: 2, labels: true, shape: "angoli", color: "#ffffff" };
const blobs = [];
let blobNextId = 1, blobT = -1e9, blobDirty = true;
let blobMask = null, blobLabel = null, blobStack = null, blobVal = null, blobInt = null;
function markBlobsDirty() { blobDirty = true; needsDraw = true; }

function updateBlobs(t) {
  if (!blobDirty && t - blobT < 160) return;
  blobDirty = false;
  blobT = t;
  const w = D.w, N = total;
  if (!blobLabel || blobLabel.length !== N) { blobMask = new Uint8Array(N); blobLabel = new Int32Array(N); blobStack = new Int32Array(N); }
  blobLabel.fill(0);
  const thr = Math.min(0.98, Math.max(0.02, BLOB.thr * (1 + Math.sin(t * 0.0006) * 0.18))), mode = BLOB.mode, lum = D.lum, rgb = D.rgb;
  if (mode === "bordi") {   // i contorni più netti rispetto al più forte dell'immagine
    let top = 0.08;
    for (let i = 0; i < N; i++) if (edgeMag[i] > top) top = edgeMag[i];
    const lim = top * (0.2 + 0.5 * thr);
    for (let i = 0; i < N; i++) blobMask[i] = edgeMag[i] >= lim ? 1 : 0;
  } else {
    // Contrasto locale: una cella è "in evidenza" se si stacca dalla media dei vicini
    // (immagine integrale), così il cielo luminoso non diventa un unico blob gigante.
    const hh = D.h, W1 = w + 1;
    if (!blobVal || blobVal.length !== N) { blobVal = new Float32Array(N); blobInt = new Float64Array(W1 * (hh + 1)); }
    for (let i = 0; i < N; i++) {
      blobVal[i] = mode === "colore"
        ? (Math.max(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) - Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])) / 255
        : lum[i] / 255;
    }
    for (let y = 0; y < hh; y++) {
      let run = 0;
      for (let x = 0; x < w; x++) { run += blobVal[y * w + x]; blobInt[(y + 1) * W1 + x + 1] = blobInt[y * W1 + x + 1] + run; }
    }
    const rX = Math.max(3, Math.round(w * 0.07)), rY = Math.max(2, Math.round(rX / CELL)), delta = thr * 0.16 * (mode === "colore" ? 0.7 : 1);
    for (let y = 0; y < hh; y++) {
      const ya = Math.max(0, y - rY), yb = Math.min(hh, y + rY + 1);
      for (let x = 0; x < w; x++) {
        const xa = Math.max(0, x - rX), xb = Math.min(w, x + rX + 1);
        const mean = (blobInt[yb * W1 + xb] - blobInt[ya * W1 + xb] - blobInt[yb * W1 + xa] + blobInt[ya * W1 + xa]) / ((xb - xa) * (yb - ya));
        const d = blobVal[y * w + x] - mean;
        blobMask[y * w + x] = (mode === "scuri" ? -d : d) >= delta ? 1 : 0;
      }
    }
  }
  const minA = Math.max(2, Math.round(N * BLOB.min / 100)), found = [];
  let id = 0;
  for (let s = 0; s < N; s++) {
    if (!blobMask[s] || blobLabel[s]) continue;
    id++;
    let sp = 0, area = 0, x0 = w, x1 = 0, y0 = D.h, y1 = 0, sx = 0, sy = 0, sr = 0, sg = 0, sb = 0;
    blobStack[sp++] = s;
    blobLabel[s] = id;
    while (sp) {
      const c = blobStack[--sp], cx = c % w, cy = (c / w) | 0;
      area++; sx += cx; sy += cy; sr += rgb[c * 3]; sg += rgb[c * 3 + 1]; sb += rgb[c * 3 + 2];
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      if (cx > 0 && blobMask[c - 1] && !blobLabel[c - 1]) { blobLabel[c - 1] = id; blobStack[sp++] = c - 1; }
      if (cx < w - 1 && blobMask[c + 1] && !blobLabel[c + 1]) { blobLabel[c + 1] = id; blobStack[sp++] = c + 1; }
      if (cy > 0 && blobMask[c - w] && !blobLabel[c - w]) { blobLabel[c - w] = id; blobStack[sp++] = c - w; }
      if (cy < D.h - 1 && blobMask[c + w] && !blobLabel[c + w]) { blobLabel[c + w] = id; blobStack[sp++] = c + w; }
    }
    if (area >= minA)
      found.push({ area, x0, x1: x1 + 1, y0, y1: y1 + 1, cx: sx / area + 0.5, cy: sy / area + 0.5,
                   r: Math.round(sr / area), g: Math.round(sg / area), b: Math.round(sb / area) });
  }
  found.sort((a, b) => b.area - a.area);
  found.length = Math.min(found.length, BLOB.max);
  // Stessa sigla ai blob che si riconoscono (il più vicino entro una certa distanza)
  const prev = blobs.slice(), taken = new Set();
  for (const b of found) {
    let best = -1, bd = 8;
    prev.forEach((p, k) => {
      if (taken.has(k)) return;
      const d = Math.hypot(p.cx - b.cx, (p.cy - b.cy) * CELL);
      if (d < bd) { bd = d; best = k; }
    });
    if (best >= 0) { taken.add(best); b.id = prev[best].id; b.age = prev[best].age + 1; }
    else { b.id = blobNextId++; b.age = 0; }
  }
  blobs.splice(0, blobs.length, ...found);
}

// Tratto con un'ombra scura sotto: il riquadro resta leggibile su zone chiare e scure
function strokeBoth(color, alpha = 1) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.globalAlpha = alpha;
  ctx.stroke();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.globalAlpha = 1;
}
function drawBlobs(t) {
  const fs = Math.max(9, Math.min(12, cw * 1.3)), tint = b => BLOB.color === "img" ? `rgb(${b.r},${b.g},${b.b})` : BLOB.color;
  ctx.save();
  ctx.font = `${fs}px "Geist Mono", ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.lineWidth = 1;
  const line = BLOB.color === "img" ? "#fff" : BLOB.color;
  // Punti da collegare: i blob e, se c'è, il cursore
  const pts = blobs.map(b => ({ x: b.cx * cw, y: b.cy * ch }));
  if (mouse) pts.push({ x: mouse.x * cw, y: mouse.y * ch, ptr: true });
  if (BLOB.links > 0 && pts.length > 1) {
    const seen = new Set();
    ctx.beginPath();
    pts.forEach((p, a) => {
      pts.map((q, b) => [Math.hypot(q.x - p.x, q.y - p.y), b]).filter(([, b]) => b !== a)
        .sort((u, v) => u[0] - v[0]).slice(0, BLOB.links).forEach(([, b]) => {
          const key = a < b ? a + "-" + b : b + "-" + a;
          if (seen.has(key)) return;
          seen.add(key);
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(pts[b].x, pts[b].y);
        });
    });
    strokeBoth(line, 0.7);
  }
  for (const b of blobs) {
    const col = tint(b), k = Math.min(1, b.age / 6);   // appena trovato: il riquadro si stringe
    const jx = Math.sin(t * 0.004 + b.id * 1.7) * 0.12 * cw, jy = Math.cos(t * 0.0037 + b.id * 2.3) * 0.12 * ch;
    const grow = (1 - k) * Math.min(b.x1 - b.x0, (b.y1 - b.y0) * CELL) * cw * 0.35;
    const x0 = b.x0 * cw - cw * 0.4 + jx - grow, y0 = b.y0 * ch - ch * 0.4 + jy - grow;
    const x1 = b.x1 * cw + cw * 0.4 + jx + grow, y1 = b.y1 * ch + ch * 0.4 + jy + grow, w = x1 - x0, h = y1 - y0;
    ctx.beginPath();
    if (BLOB.shape === "riquadro") ctx.rect(x0, y0, w, h);
    else if (BLOB.shape === "cerchio") ctx.ellipse(x0 + w / 2, y0 + h / 2, w / 2, h / 2, 0, 0, TAU);
    else {
      const L = Math.min(18, Math.max(5, Math.min(w, h) * 0.28));
      ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
      ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
      ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
      ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
    }
    const cx = b.cx * cw, cy = b.cy * ch;            // croce sul baricentro
    ctx.moveTo(cx - 3, cy); ctx.lineTo(cx + 3, cy);
    ctx.moveTo(cx, cy - 3); ctx.lineTo(cx, cy + 3);
    strokeBoth(col);
    if (BLOB.labels) {
      const l1 = "ID " + String(b.id).padStart(2, "0"), l2 = `x ${(b.cx / D.w).toFixed(2)}  y ${(b.cy / D.h).toFixed(2)}`;
      const tw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 8, th = fs * 2 + 8;
      const ly = y0 - th - 2 >= 0 ? y0 - th - 2 : y0 + 2, lx = Math.min(Math.max(0, x0), cw * D.w - tw);
      ctx.fillStyle = "rgba(0,0,0,0.72)";
      ctx.fillRect(lx, ly, tw, th);
      ctx.fillStyle = col;
      ctx.fillText(l1, lx + 4, ly + 4);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText(l2, lx + 4, ly + 4 + fs);
    }
  }
  if (mouse) {   // il cursore come punto tracciato
    const x = mouse.x * cw, y = mouse.y * ch, r = cw * 2.2;
    ctx.beginPath();
    ctx.rect(x - r, y - r, r * 2, r * 2);
    ctx.moveTo(x - r * 1.6, y); ctx.lineTo(x - r * 0.4, y); ctx.moveTo(x + r * 0.4, y); ctx.lineTo(x + r * 1.6, y);
    ctx.moveTo(x, y - r * 1.6); ctx.lineTo(x, y - r * 0.4); ctx.moveTo(x, y + r * 0.4); ctx.lineTo(x, y + r * 1.6);
    strokeBoth(line);
    if (BLOB.labels) {
      ctx.fillStyle = "rgba(0,0,0,0.72)";
      ctx.fillRect(x + r + 4, y - r, fs * 5.6, fs + 6);
      ctx.fillStyle = line;
      ctx.fillText("PTR", x + r + 8, y - r + 3);
    }
  }
  ctx.restore();
}
