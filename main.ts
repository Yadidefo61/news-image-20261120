// The World in One Day — Friday 20 November 2026
// A deterministic program that draws a newspaper front page summing up the
// world's news of Friday 20 November 2026 and writes it to /output/entry.png.
// Node 22, standard library only. No network, no clock, no randomness:
// every run writes byte-identical output.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const W = 1024;
const H = 1024;

// ---- palette (newsprint) ----
const PAPER = [246, 241, 227];
const PANEL = [255, 253, 246];
const INK = [23, 21, 18];
const RED = [166, 30, 30];
const BLUE = [29, 79, 138];
const GOLD = [178, 138, 52];
const GREEN = [46, 125, 70];
const SKY = [216, 230, 242];
const SAND = [232, 217, 184];
const GREY = [120, 112, 98];

// ---- CRC32 (standard polynomial) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- PNG encoder (RGBA, filter 0, zlib level 9) ----
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- canvas ----
const px = Buffer.alloc(W * H * 4);
function set(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
  px[i + 3] = 255;
}
function fillRect(x, y, w, h, c) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++)
    for (let xx = x0; xx < x1; xx++) set(xx, yy, c);
}
function hline(x, y, w, c, t = 1) {
  fillRect(x, y, w, t, c);
}
function vline(x, y, h, c, t = 1) {
  fillRect(x, y, t, h, c);
}
function line(x0, y0, x1, y1, c, t = 1) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (;;) {
    fillRect(x - Math.floor(t / 2), y - Math.floor(t / 2), t, t, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}
function fillEllipse(cx, cy, rx, ry, c) {
  for (let y = -ry; y <= ry; y++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    for (let x = -half; x <= half; x++) set(cx + x, cy + y, c);
  }
}
function circle(cx, cy, r, c, t = 1) {
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    fillRect(
      Math.round(cx + r * Math.cos(rad)) - Math.floor(t / 2),
      Math.round(cy + r * Math.sin(rad)) - Math.floor(t / 2),
      t,
      t,
      c
    );
  }
}
function fillPoly(points, c) {
  // scanline fill, even-odd
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) set(x, y, c);
    }
  }
}
function star(cx, cy, r, c) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.42;
    pts.push([cx + rr * Math.cos(rad), cy + rr * Math.sin(rad)]);
  }
  fillPoly(pts, c);
}
// deterministic pseudo-random (mulberry32, fixed seed)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 5x7 bitmap font (hand-drawn) ----
const FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "'": ["01100", "01100", "00100", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "01110", "00100", "00100", "00000"],
  "%": ["10001", "10010", "00100", "01000", "01001", "10001", "10001"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "•": ["00000", "00000", "01100", "01100", "01100", "00000", "00000"],
};
function textWidth(text, scale) {
  return text.length * 6 * scale - scale;
}
function drawText(text, x, y, scale, c) {
  const t = text.toUpperCase();
  for (let i = 0; i < t.length; i++) {
    const g = FONT[t[i]];
    if (!g) continue;
    const ox = x + i * 6 * scale;
    for (let r = 0; r < 7; r++)
      for (let col = 0; col < 5; col++)
        if (g[r][col] === "1") fillRect(ox + col * scale, y + r * scale, scale, scale, c);
  }
}
function drawTextCentered(text, cx, y, scale, c) {
  drawText(text, cx - Math.floor(textWidth(text, scale) / 2), y, scale, c);
}
function fitScale(text, maxWidth, maxScale) {
  for (let s = maxScale; s >= 1; s--) if (textWidth(text, s) <= maxWidth) return s;
  return 1;
}
function wrapText(text, maxWidth, scale) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (textWidth(trial, scale) <= maxWidth) cur = trial;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawWrapped(text, x, y, maxWidth, scale, c, lineGap = 4) {
  const lines = wrapText(text.toUpperCase(), maxWidth, scale);
  lines.forEach((ln, i) => drawText(ln, x, y + i * (7 * scale + lineGap), scale, c));
  return lines.length;
}

// ---- panel helper ----
function panel(x, y, w, h) {
  fillRect(x, y, w, h, PANEL);
  fillRect(x, y, w, 3, INK);
  fillRect(x, y + h - 3, w, 3, INK);
  fillRect(x, y, 3, h, INK);
  fillRect(x + w - 3, y, 3, h, INK);
}

// ---- flags ----
function flagUS(x, y, w, h) {
  const stripe = h / 13;
  for (let i = 0; i < 13; i++)
    fillRect(x, y + Math.floor(i * stripe), w, Math.ceil(stripe), i % 2 === 0 ? RED : PANEL);
  fillRect(x, y, Math.floor(w * 0.4), Math.floor(h * 0.54), BLUE);
  const r = rng(11);
  for (let i = 0; i < 12; i++) {
    const sx = x + 4 + r() * (w * 0.4 - 10);
    const sy = y + 4 + r() * (h * 0.54 - 10);
    fillRect(Math.floor(sx), Math.floor(sy), 3, 3, PANEL);
  }
}
function flagCN(x, y, w, h) {
  fillRect(x, y, w, h, RED);
  star(x + Math.floor(w * 0.22), y + Math.floor(h * 0.28), 11, GOLD);
  star(x + Math.floor(w * 0.62), y + Math.floor(h * 0.16), 5, GOLD);
  star(x + Math.floor(w * 0.78), y + Math.floor(h * 0.32), 5, GOLD);
  star(x + Math.floor(w * 0.72), y + Math.floor(h * 0.58), 5, GOLD);
  star(x + Math.floor(w * 0.52), y + Math.floor(h * 0.68), 5, GOLD);
}
function flagRU(x, y, w, h) {
  fillRect(x, y, w, Math.ceil(h / 3), PANEL);
  fillRect(x, y + Math.floor(h / 3), w, Math.ceil(h / 3), BLUE);
  fillRect(x, y + Math.floor((2 * h) / 3), w, Math.ceil(h / 3), RED);
}

// ---- icons ----
function drawScales(cx, cy, s, c) {
  // justice scales: pole, beam, two pans
  vline(cx, cy - 42 * s, 84 * s, c, 3 * s);
  hline(cx - 34 * s, cy - 42 * s, 68 * s, c, 3 * s);
  fillEllipse(cx, cy - 46 * s, 5 * s, 4 * s, c);
  for (const dir of [-1, 1]) {
    const px0 = cx + dir * 34 * s;
    line(px0, cy - 42 * s, px0 - 10 * s, cy - 8 * s, c, 2 * s);
    line(px0, cy - 42 * s, px0 + 10 * s, cy - 8 * s, c, 2 * s);
    fillPoly(
      [
        [px0 - 16 * s, cy - 8 * s],
        [px0 + 16 * s, cy - 8 * s],
        [px0, cy + 8 * s],
      ],
      c
    );
  }
  fillRect(cx - 22 * s, cy + 42 * s, 44 * s, 4 * s, c);
}
function drawCyclone(cx, cy, r, c1, c2) {
  // spiral storm: concentric arcs + rain
  for (let i = 0; i < 5; i++) {
    const rr = r - i * 9;
    if (rr <= 0) break;
    circle(cx, cy, rr, i % 2 === 0 ? c1 : c2, 4);
  }
  fillEllipse(cx, cy, 10, 10, RED);
  for (let i = 0; i < 6; i++) {
    const x = cx - 48 + i * 19;
    line(x, cy + r + 6, x - 4, cy + r + 18, BLUE, 3);
  }
}
function drawChart(x, y, w, h) {
  // axes
  hline(x, y + h - 14, w, INK, 3);
  vline(x + 8, y, h - 14, INK, 3);
  const base = y + h - 14;
  const bw = 34;
  const gap = 22;
  // ANT bar (green, up)
  fillRect(x + 20, base - 96, bw, 96, GREEN);
  // DOW bar (red, down)
  fillRect(x + 20 + bw + gap, base - 52, bw, 52, RED);
  // S&P bar (red, down)
  fillRect(x + 20 + 2 * (bw + gap), base - 38, bw, 38, RED);
  // arrows
  line(x + 20 + 17, base - 118, x + 20 + 17, base - 104, GREEN, 4);
  fillPoly(
    [
      [x + 20 + 9, base - 106],
      [x + 20 + 25, base - 106],
      [x + 20 + 17, base - 120],
    ],
    GREEN
  );
  line(x + 20 + bw + gap + 17, base - 30, x + 20 + bw + gap + 17, base - 16, RED, 4);
  fillPoly(
    [
      [x + 20 + bw + gap + 9, base - 28],
      [x + 20 + bw + gap + 25, base - 28],
      [x + 20 + bw + gap + 17, base - 14],
    ],
    RED
  );
  drawText("ANT", x + 20, base + 4, 2, GREEN);
  drawText("DOW", x + 20 + bw + gap, base + 4, 2, RED);
  drawText("S&P", x + 20 + 2 * (bw + gap), base + 4, 2, RED);
}
function drawClock(cx, cy, r, c) {
  fillEllipse(cx, cy, r, r, PANEL);
  circle(cx, cy, r, c, 4);
  circle(cx, cy, r - 12, c, 2);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const x1 = cx + Math.round((r - 6) * Math.sin(a));
    const y1 = cy - Math.round((r - 6) * Math.cos(a));
    const x2 = cx + Math.round((r - 16) * Math.sin(a));
    const y2 = cy - Math.round((r - 16) * Math.cos(a));
    line(x1, y1, x2, y2, c, 3);
  }
  line(cx, cy, cx, cy - r + 26, c, 5);
  line(cx, cy, cx + 26, cy + 12, c, 5);
  fillEllipse(cx, cy, 6, 6, RED);
}
function drawVoyager(cx, cy, c) {
  const r = rng(20261120);
  // starfield
  for (let i = 0; i < 46; i++) {
    const x = cx - 130 + Math.floor(r() * 260);
    const y = cy - 62 + Math.floor(r() * 124);
    fillRect(x, y, 3, 3, i % 5 === 0 ? GOLD : PANEL);
  }
  // orbit ring
  for (let a = 0; a < 360; a += 3) {
    const rad = (a * Math.PI) / 180;
    set(Math.round(cx + 118 * Math.cos(rad)), Math.round(cy + 34 * Math.sin(rad)), BLUE);
    set(Math.round(cx + 118 * Math.cos(rad)), Math.round(cy + 34 * Math.sin(rad)) + 1, BLUE);
  }
  // spacecraft body
  fillPoly(
    [
      [cx - 52, cy + 8],
      [cx + 8, cy - 18],
      [cx + 8, cy + 30],
    ],
    c
  );
  // dish
  fillEllipse(cx + 32, cy + 6, 18, 12, PANEL);
  circle(cx + 32, cy + 6, 18, c, 3);
  line(cx + 8, cy + 6, cx + 32, cy + 6, c, 3);
  // antenna
  line(cx - 52, cy + 8, cx - 78, cy - 22, c, 3);
  fillEllipse(cx - 78, cy - 22, 4, 4, RED);
  // engine glow
  fillPoly(
    [
      [cx - 52, cy + 2],
      [cx - 52, cy + 14],
      [cx - 76, cy + 8],
    ],
    GOLD
  );
}

// ---- main drawing ----
function main() {
  fillRect(0, 0, W, H, PAPER);
  // double outer border
  fillRect(14, 14, W - 28, 3, INK);
  fillRect(14, H - 17, W - 28, 3, INK);
  fillRect(14, 14, 3, H - 28, INK);
  fillRect(W - 17, 14, 3, H - 28, INK);
  fillRect(22, 22, W - 44, 2, INK);
  fillRect(22, H - 24, W - 44, 2, INK);
  fillRect(22, 22, 2, H - 44, INK);
  fillRect(W - 24, 22, 2, H - 44, INK);

  // ---- masthead ----
  drawTextCentered("WORLD NEWS  •  ONE DAY  •  SIX STORIES", 512, 38, 2, GREY);
  drawTextCentered("THE WORLD IN ONE DAY", 512, 66, 7, INK);
  drawTextCentered("FRIDAY, 20 NOVEMBER 2026", 512, 126, 5, RED);
  hline(28, 164, W - 56, INK, 3);
  hline(28, 170, W - 56, INK, 1);

  // ---- lead story: three leaders ----
  const LX = 28;
  const LY = 182;
  const LW = 620;
  const LH = 422;
  panel(LX, LY, LW, LH);
  // scene
  const sx = LX + 14;
  const sy = LY + 12;
  const sw = LW - 28;
  const sh = 188;
  fillRect(sx, sy, sw, sh, SKY);
  fillRect(sx, sy + sh - 44, sw, 44, SAND);
  // flag poles
  const poleY0 = sy + 18;
  const poleY1 = sy + sh - 44;
  const flagW = 118;
  const flagH = 72;
  const flagXs = [sx + 52, sx + 238, sx + 424];
  for (const fx of flagXs) vline(fx - 4, poleY0, poleY1 - poleY0, INK, 4);
  flagUS(flagXs[0], poleY0 + 4, flagW, flagH);
  flagCN(flagXs[1], poleY0 + 4, flagW, flagH);
  flagRU(flagXs[2], poleY0 + 4, flagW, flagH);
  // round table
  fillEllipse(sx + Math.floor(sw / 2), poleY1 - 6, 168, 24, [138, 106, 66]);
  fillRect(sx + Math.floor(sw / 2) - 120, poleY1 + 8, 10, 30, [110, 84, 50]);
  fillRect(sx + Math.floor(sw / 2) + 110, poleY1 + 8, 10, 30, [110, 84, 50]);
  // olive branch on the table
  line(sx + 150, poleY1 - 14, sx + 250, poleY1 - 30, GREEN, 4);
  for (let i = 0; i < 5; i++) {
    fillEllipse(sx + 160 + i * 18, poleY1 - 16 - i * 3, 9, 5, GREEN);
    fillEllipse(sx + 166 + i * 18, poleY1 - 30 - i * 2, 8, 5, GREEN);
  }
  // headline
  drawText("THREE LEADERS,", LX + 18, LY + 216, 5, INK);
  drawText("ONE DECLARATION", LX + 18, LY + 258, 5, INK);
  hline(LX + 18, LY + 306, LW - 36, RED, 4);
  drawText("TRUMP, XI AND PUTIN MEET", LX + 18, LY + 322, 3, INK);
  drawText("IN SHENZHEN, CHINA", LX + 18, LY + 350, 3, INK);
  drawText("NUCLEAR WAR 'CANNOT BE WON'", LX + 18, LY + 374, 3, RED);
  drawWrapped(
    "FOUR-POINT PACT LEAVES OUT UKRAINE AND IRAN",
    LX + 18,
    LY + 402,
    LW - 36,
    2,
    GREY
  );

  // ---- right column, top: ICJ / Myanmar ----
  const RX = 660;
  const RW = 336;
  panel(RX, 182, RW, 206);
  drawScales(RX + 62, 258, 1, BLUE);
  drawText("MYANMAR", RX + 118, 216, 4, INK);
  drawText("GENOCIDE", RX + 118, 248, 4, RED);
  drawWrapped("UN COURT RULES ON THE ROHINGYA, 2017", RX + 16, 322, RW - 32, 2, INK);

  // ---- right column, bottom: Cyclone Akvan ----
  panel(RX, 400, RW, 204);
  drawCyclone(RX + 62, 470, 40, BLUE, INK);
  drawText("CYCLONE", RX + 118, 434, 4, INK);
  drawText("AKVAN", RX + 118, 466, 4, INK);
  drawWrapped("300,000 EVACUATED AS STORM NEARS ODISHA COAST", RX + 16, 546, RW - 32, 2, INK);

  // ---- bottom row ----
  const BY = 616;
  const BH = 340;
  // markets
  panel(28, BY, 328, BH);
  drawTextCentered("RECORD IPO,", 192, BY + 16, 4, INK);
  drawTextCentered("RED MARKETS", 192, BY + 48, 4, RED);
  drawChart(56, BY + 96, 272, 150);
  drawWrapped("ANTHROPIC +17% ON DEBUT; DOW -1,101 PTS, BELOW 50,000", 44, BY + 268, 296, 2, INK);
  // Iran
  panel(368, BY, 288, BH);
  drawTextCentered("IRAN CALL", 512, BY + 16, 4, INK);
  drawTextCentered("DELAYED", 512, BY + 48, 4, INK);
  drawTextCentered("TO 2027", 512, BY + 80, 4, RED);
  drawClock(512, BY + 196, 52, INK);
  drawWrapped("TRUMP: NO RUSH, 'SEE WHAT HAPPENS' AFTER JAN 1", 384, BY + 268, 256, 2, INK);
  // Voyager 1
  panel(668, BY, 328, BH);
  drawTextCentered("VOYAGER 1", 832, BY + 16, 4, INK);
  drawTextCentered("ONE LIGHT-DAY", 832, BY + 48, 3, RED);
  fillRect(684, BY + 92, 296, 140, [16, 22, 38]);
  drawVoyager(832, BY + 162, PANEL);
  drawWrapped("NASA: SIGNALS NOW TAKE A FULL DAY TO ARRIVE", 684, BY + 268, 296, 2, INK);

  // ---- footer ----
  hline(28, 968, W - 56, INK, 2);
  drawTextCentered(
    "DRAWN FROM NEWS REPORTED 20 NOVEMBER 2026  •  BBC  •  REUTERS  •  THE HINDU",
    512,
    980,
    2,
    GREY
  );

  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outDir + "/entry.png", encodePng(px, W, H));
}

main();
