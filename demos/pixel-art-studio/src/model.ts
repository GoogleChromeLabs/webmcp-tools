/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PALETTES } from "./palettes";

/** Palette characters used by paint_rows / get_region_pixels. '.' = skip/transparent, '~' = erase. */
export const CHARSET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&*+-:;<=>?@^_";
export const MAX_PALETTE = CHARSET.length;

const pctx = document.createElement("canvas").getContext("2d")!;
export function cssToU32(s: string): number | null {
  s = String(s).trim();
  if (/^(transparent|none|clear|erase)$/i.test(s)) return 0;
  let m = /^#?([0-9a-f]{3,8})$/i.exec(s);
  if (m && [3, 4, 6, 8].includes(m[1].length)) {
    let x = m[1];
    if (x.length <= 4)
      x = x
        .split("")
        .map((c) => c + c)
        .join("");
    const r = parseInt(x.slice(0, 2), 16),
      g = parseInt(x.slice(2, 4), 16),
      b = parseInt(x.slice(4, 6), 16);
    const a = x.length === 8 ? parseInt(x.slice(6, 8), 16) : 255;
    return pack(r, g, b, a);
  }
  pctx.fillStyle = "#010203";
  pctx.fillStyle = s;
  const v = pctx.fillStyle as string;
  if (v === "#010203" && !/^#?010203$/i.test(s)) return null;
  if (v.startsWith("#")) return cssToU32(v);
  m = /rgba?\(([^)]+)\)/.exec(v);
  if (m) {
    const p = m[1].split(",").map(Number);
    return pack(p[0], p[1], p[2], Math.round((p[3] ?? 1) * 255));
  }
  return null;
}
export const pack = (r: number, g: number, b: number, a = 255) =>
  ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
export const unpack = (c: number) => [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24];
export function u32ToHex(c: number): string {
  const [r, g, b, a] = unpack(c);
  if (a === 0) return "transparent";
  const x = (n: number) => n.toString(16).padStart(2, "0");
  return "#" + x(r) + x(g) + x(b) + (a < 255 ? x(a) : "");
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  data: Uint32Array;
}
export interface Selection {
  kind: "rect" | "lasso";
  x: number;
  y: number;
  w: number;
  h: number;
  mask: Uint8Array;
  polygon?: [number, number][];
}
interface Snapshot {
  w: number;
  h: number;
  layers: Layer[];
  active: number;
  label: string;
}
export interface Change {
  i: number;
  before: number;
}

let lid = 1;
const newId = () => "L" + lid++;

const BAYER: Record<number, number[][]> = {
  2: [
    [0, 2],
    [3, 1],
  ],
  4: [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ],
};
BAYER[8] = (() => {
  const b4 = BAYER[4],
    m: number[][] = [];
  for (let y = 0; y < 8; y++) {
    m[y] = [];
    for (let x = 0; x < 8; x++)
      m[y][x] =
        4 * b4[y % 4][x % 4] +
        [
          [0, 2],
          [3, 1],
        ][y >> 2][x >> 2];
  }
  return m;
})();
export function bayer(n: number, x: number, y: number) {
  const m = BAYER[n];
  return (m[y % n][x % n] + 0.5) / (n * n);
}

export class Studio {
  w = 64;
  h = 64;
  layers: Layer[] = [];
  active = 0;
  palette: string[] = [...PALETTES[0].colors];
  paletteName = PALETTES[0].name;
  primary = "#ff7b5c";
  secondary = "#1b0f3b";
  selection: Selection | null = null;
  undoStack: Snapshot[] = [];
  redoStack: Snapshot[] = [];
  /** set during a mutation to collect per-pixel changes (composite-independent) */
  private rec: Map<number, number> | null = null;
  private recLayer: Layer | null = null;
  composite: Uint32Array = new Uint32Array(0);
  private listeners = new Set<(why: string) => void>();
  version = 0;

  constructor() {
    this.reset(64, 64);
  }

  on(fn: (why: string) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(why: string) {
    this.version++;
    this.recomposite();
    this.listeners.forEach((f) => f(why));
  }

  reset(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.layers = [
      { id: newId(), name: "Background", visible: true, opacity: 1, data: new Uint32Array(w * h) },
    ];
    this.active = 0;
    this.selection = null;
    this.composite = new Uint32Array(w * h);
  }

  get layer() {
    return this.layers[this.active];
  }

  findLayer(ref?: string | number): Layer {
    if (ref === undefined || ref === null || ref === "") return this.layer;
    if (typeof ref === "number") {
      const l = this.layers[ref];
      if (!l) throw new Error(`No layer at index ${ref}`);
      return l;
    }
    const l = this.layers.find(
      (l) => l.id === ref || l.name.toLowerCase() === String(ref).toLowerCase(),
    );
    if (!l) {
      if (/^\d+$/.test(String(ref))) return this.findLayer(Number(ref));
      throw new Error(`Unknown layer "${ref}"`);
    }
    return l;
  }

  // ---------- history ----------
  checkpoint(label: string) {
    this.undoStack.push({
      w: this.w,
      h: this.h,
      active: this.active,
      label,
      layers: this.layers.map((l) => ({ ...l, data: l.data.slice() })),
    });
    if (this.undoStack.length > 150) this.undoStack.shift();
    this.redoStack = [];
  }
  private snap(label: string): Snapshot {
    return {
      w: this.w,
      h: this.h,
      active: this.active,
      label,
      layers: this.layers.map((l) => ({ ...l, data: l.data.slice() })),
    };
  }
  private restore(s: Snapshot) {
    const sizeChanged = s.w !== this.w || s.h !== this.h;
    this.w = s.w;
    this.h = s.h;
    this.layers = s.layers;
    this.active = Math.min(s.active, s.layers.length - 1);
    if (sizeChanged) {
      this.selection = null;
      this.composite = new Uint32Array(this.w * this.h);
    }
  }
  undo(): string | null {
    const s = this.undoStack.pop();
    if (!s) return null;
    this.redoStack.push(this.snap(s.label));
    this.restore(s);
    this.emit("undo");
    return s.label;
  }
  redo(): string | null {
    const s = this.redoStack.pop();
    if (!s) return null;
    this.undoStack.push(this.snap(s.label));
    this.restore(s);
    this.emit("redo");
    return s.label;
  }

  // ---------- mutation recording ----------
  begin(label: string, layer?: Layer) {
    this.checkpoint(label);
    this.rec = new Map();
    this.recLayer = layer ?? this.layer;
  }
  end(why = "paint"): Change[] {
    const out: Change[] = [];
    if (this.rec)
      this.rec.forEach((before, i) => {
        if (this.recLayer!.data[i] !== before) out.push({ i, before });
      });
    if (this.rec && out.length === 0) this.undoStack.pop(); // no-op: drop checkpoint
    this.rec = null;
    this.recLayer = null;
    this.emit(why);
    return out;
  }
  inSel(x: number, y: number) {
    return !this.selection || this.selection.mask[y * this.w + x] === 1;
  }
  set(x: number, y: number, c: number, clip = false, L?: Layer) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (clip && !this.inSel(x, y)) return;
    const layer = L ?? this.recLayer ?? this.layer,
      i = y * this.w + x;
    if (this.rec && layer === this.recLayer && !this.rec.has(i)) this.rec.set(i, layer.data[i]);
    layer.data[i] = c;
  }

  // ---------- color helpers ----------
  color(v: any): number {
    if (v === undefined || v === null) return cssToU32(this.primary)!;
    if (typeof v === "number") {
      const c = this.palette[v];
      if (!c) throw new Error(`Palette index ${v} out of range (0..${this.palette.length - 1})`);
      return cssToU32(c)!;
    }
    const s = String(v).trim();
    if (/^\d{2,}$/.test(s)) return this.color(Number(s));
    if (s.length === 1) {
      const k = CHARSET.indexOf(s);
      if (k >= 0 && this.palette[k]) return cssToU32(this.palette[k])!;
      if (s === "." || s === "~") return 0;
    }
    const c = cssToU32(s);
    if (c === null)
      throw new Error(
        `Unrecognised color "${s}". Use #rrggbb, a CSS color, a palette index, or "transparent".`,
      );
    return c;
  }

  // ---------- primitives ----------
  linePts(x0: number, y0: number, x1: number, y1: number) {
    const pts: [number, number][] = [];
    x0 |= 0;
    y0 |= 0;
    x1 |= 0;
    y1 |= 0;
    const dx = Math.abs(x1 - x0),
      dy = -Math.abs(y1 - y0),
      sx = x0 < x1 ? 1 : -1,
      sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      pts.push([x0, y0]);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) {
        e += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        e += dx;
        y0 += sy;
      }
    }
    return pts;
  }
  rectPts(x0: number, y0: number, x1: number, y1: number, filled: boolean) {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)],
      [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)],
      pts: [number, number][] = [];
    for (let y = ay; y <= by; y++)
      for (let x = ax; x <= bx; x++)
        if (filled || x === ax || x === bx || y === ay || y === by) pts.push([x, y]);
    return pts;
  }
  ellipsePts(x0: number, y0: number, x1: number, y1: number, filled: boolean) {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)],
      [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    const cx = (ax + bx + 1) / 2,
      cy = (ay + by + 1) / 2,
      rx = (bx - ax + 1) / 2,
      ry = (by - ay + 1) / 2;
    const inside = (x: number, y: number) =>
      ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0001;
    const pts: [number, number][] = [];
    for (let y = ay; y <= by; y++)
      for (let x = ax; x <= bx; x++) {
        if (!inside(x, y)) continue;
        if (
          filled ||
          !inside(x - 1, y) ||
          !inside(x + 1, y) ||
          !inside(x, y - 1) ||
          !inside(x, y + 1)
        )
          pts.push([x, y]);
      }
    return pts;
  }
  floodPts(sx: number, sy: number, clip: boolean, L?: Layer) {
    const layer = L ?? this.layer,
      W = this.w,
      H = this.h,
      target = layer.data[sy * W + sx];
    const seen = new Uint8Array(W * H),
      pts: [number, number][] = [],
      stack = [sx, sy];
    while (stack.length) {
      const y = stack.pop()!,
        x = stack.pop()!;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (seen[i] || layer.data[i] !== target || (clip && !this.inSel(x, y))) continue;
      seen[i] = 1;
      pts.push([x, y]);
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    return pts;
  }
  /** points inside a rect region or the selection */
  regionPts(r?: { x: number; y: number; width: number; height: number }, useSel = true) {
    const pts: [number, number][] = [];
    if (r) {
      for (let y = r.y; y < r.y + r.height; y++)
        for (let x = r.x; x < r.x + r.width; x++)
          if (x >= 0 && y >= 0 && x < this.w && y < this.h) pts.push([x, y]);
      return pts;
    }
    if (useSel && this.selection) {
      const s = this.selection;
      for (let y = s.y; y < s.y + s.h; y++)
        for (let x = s.x; x < s.x + s.w; x++) if (s.mask[y * this.w + x]) pts.push([x, y]);
      return pts;
    }
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) pts.push([x, y]);
    return pts;
  }
  gradientColors(
    pts: [number, number][],
    colors: number[],
    dir: string,
    dither: number,
    angle?: number,
  ) {
    let minx = 1e9,
      miny = 1e9,
      maxx = -1e9,
      maxy = -1e9;
    for (const [x, y] of pts) {
      minx = Math.min(minx, x);
      miny = Math.min(miny, y);
      maxx = Math.max(maxx, x);
      maxy = Math.max(maxy, y);
    }
    const cx = (minx + maxx) / 2,
      cy = (miny + maxy) / 2,
      rw = Math.max(1, maxx - minx),
      rh = Math.max(1, maxy - miny);
    const a =
      ((angle ?? { horizontal: 0, vertical: 90, diagonal: 45, "diagonal-up": -45 }[dir] ?? 90) *
        Math.PI) /
      180;
    const ux = Math.cos(a),
      uy = Math.sin(a);
    const proj = (x: number, y: number) => (x - cx) * ux + (y - cy) * uy;
    const ext = Math.abs((rw / 2) * ux) + Math.abs((rh / 2) * uy) || 1;
    const n = colors.length;
    return pts.map(([x, y]) => {
      let t =
        dir === "radial"
          ? Math.min(
              1,
              (Math.hypot((x - cx) / (rw / 2 || 1), (y - cy) / (rh / 2 || 1)) / Math.SQRT2) * 1.25,
            )
          : (proj(x, y) / ext + 1) / 2;
      t = Math.max(0, Math.min(1, t)) * (n - 1);
      const i = Math.min(n - 2, Math.floor(t)),
        f = t - i;
      const th = dither ? bayer(dither, x, y) : 0.5;
      return f > th ? colors[i + 1] : colors[i];
    });
  }

  recomposite() {
    const out = this.composite,
      N = this.w * this.h;
    out.fill(0);
    for (const l of this.layers) {
      if (!l.visible || l.opacity <= 0) continue;
      const d = l.data,
        op = l.opacity;
      for (let i = 0; i < N; i++) {
        const s = d[i];
        if (!s) continue;
        const sa = ((s >>> 24) / 255) * op;
        if (sa >= 0.999) {
          out[i] = s | 0xff000000;
          continue;
        }
        const b = out[i],
          ba = (b >>> 24) / 255,
          oa = sa + ba * (1 - sa);
        if (oa <= 0) continue;
        const mix = (sh: number) =>
          Math.round((((s >>> sh) & 255) * sa + ((b >>> sh) & 255) * ba * (1 - sa)) / oa);
        out[i] = pack(mix(0), mix(8), mix(16), Math.round(oa * 255));
      }
    }
  }

  // ---------- selection ----------
  setRectSelection(x: number, y: number, w: number, h: number) {
    const x0 = Math.max(0, Math.min(x, x + w)),
      y0 = Math.max(0, Math.min(y, y + h));
    const x1 = Math.min(this.w, Math.max(x, x + w)),
      y1 = Math.min(this.h, Math.max(y, y + h));
    if (x1 - x0 < 1 || y1 - y0 < 1) {
      this.selection = null;
      return null;
    }
    const mask = new Uint8Array(this.w * this.h);
    for (let yy = y0; yy < y1; yy++) mask.fill(1, yy * this.w + x0, yy * this.w + x1);
    this.selection = { kind: "rect", x: x0, y: y0, w: x1 - x0, h: y1 - y0, mask };
    return this.selection;
  }
  setPolySelection(poly: [number, number][]) {
    if (poly.length < 3) {
      this.selection = null;
      return null;
    }
    const mask = new Uint8Array(this.w * this.h);
    let minx = 1e9,
      miny = 1e9,
      maxx = -1,
      maxy = -1;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const px = x + 0.5,
          py = y + 0.5;
        let ins = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, yi] = poly[i],
            [xj, yj] = poly[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ins = !ins;
        }
        if (ins) {
          mask[y * this.w + x] = 1;
          minx = Math.min(minx, x);
          miny = Math.min(miny, y);
          maxx = Math.max(maxx, x);
          maxy = Math.max(maxy, y);
        }
      }
    if (maxx < 0) {
      this.selection = null;
      return null;
    }
    this.selection = {
      kind: "lasso",
      x: minx,
      y: miny,
      w: maxx - minx + 1,
      h: maxy - miny + 1,
      mask,
      polygon: poly,
    };
    return this.selection;
  }
  maskRows(): string[] {
    const s = this.selection;
    if (!s) return [];
    const rows: string[] = [];
    for (let y = s.y; y < s.y + s.h; y++) {
      let r = "";
      for (let x = s.x; x < s.x + s.w; x++) r += s.mask[y * this.w + x] ? "#" : ".";
      rows.push(r);
    }
    return rows;
  }

  resize(nw: number, nh: number, anchor: "center" | "top-left" = "center") {
    const ox = anchor === "center" ? Math.floor((nw - this.w) / 2) : 0,
      oy = anchor === "center" ? Math.floor((nh - this.h) / 2) : 0;
    for (const l of this.layers) {
      const d = new Uint32Array(nw * nh);
      for (let y = 0; y < this.h; y++)
        for (let x = 0; x < this.w; x++) {
          const X = x + ox,
            Y = y + oy;
          if (X >= 0 && Y >= 0 && X < nw && Y < nh) d[Y * nw + X] = l.data[y * this.w + x];
        }
      l.data = d;
    }
    this.w = nw;
    this.h = nh;
    this.selection = null;
    this.composite = new Uint32Array(nw * nh);
  }

  addLayer(name?: string, at?: number) {
    const l: Layer = {
      id: newId(),
      name: name || `Layer ${this.layers.length + 1}`,
      visible: true,
      opacity: 1,
      data: new Uint32Array(this.w * this.h),
    };
    const idx = at ?? this.active + 1;
    this.layers.splice(idx, 0, l);
    this.active = idx;
    return l;
  }

  toCanvas(scale = 1, src = this.composite, rx = 0, ry = 0, rw = this.w, rh = this.h) {
    const c = document.createElement("canvas");
    c.width = rw;
    c.height = rh;
    const img = new ImageData(rw, rh),
      v = new Uint32Array(img.data.buffer);
    for (let y = 0; y < rh; y++)
      for (let x = 0; x < rw; x++) v[y * rw + x] = src[(y + ry) * this.w + x + rx];
    c.getContext("2d")!.putImageData(img, 0, 0);
    if (scale === 1) return c;
    const s = document.createElement("canvas");
    s.width = rw * scale;
    s.height = rh * scale;
    const sx = s.getContext("2d")!;
    sx.imageSmoothingEnabled = false;
    sx.drawImage(c, 0, 0, s.width, s.height);
    return s;
  }
  nearestPaletteU32(r: number, g: number, b: number) {
    let best = 0,
      bd = 1e12;
    this.palette.forEach((hex, i) => {
      const [pr, pg, pb] = unpack(cssToU32(hex)!);
      const d = (pr - r) ** 2 * 0.3 + (pg - g) ** 2 * 0.59 + (pb - b) ** 2 * 0.11;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return cssToU32(this.palette[best])!;
  }
}
