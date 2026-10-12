/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Studio, Change, unpack } from "./model";

interface Fx {
  i: number;
  old: number;
  nw: number;
  start: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
interface Ghost {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  start: number;
  dur: number;
  label?: string;
}

const easeOutBack = (t: number) => {
  const c1 = 1.70158,
    c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

export class View {
  ctx: CanvasRenderingContext2D;
  dpr = 1;
  zoom = 10;
  panX = 0;
  panY = 0;
  grid = true;
  bloom = true;
  crt = false;
  hover: [number, number] | null = null;
  preview: { pts: [number, number][]; color: string } | null = null;
  lassoPath: [number, number][] | null = null;
  fx: Fx[] = [];
  fxMap = new Map<number, Fx>();
  particles: Particle[] = [];
  ghosts: Ghost[] = [];
  onion: Ghost | null = null;
  agent = { x: 0, y: 0, tx: 0, ty: 0, label: "", until: 0, seen: false };
  awaitingAgent = false;
  private art = document.createElement("canvas");
  private artCtx = this.art.getContext("2d")!;
  private disp: Uint32Array = new Uint32Array(0);
  private lastVersion = -1;
  private checker: CanvasPattern | null = null;

  constructor(
    public canvas: HTMLCanvasElement,
    public studio: Studio,
  ) {
    this.ctx = canvas.getContext("2d")!;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
    this.fit();
    const loop = (t: number) => {
      this.draw(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  resize() {
    const p = this.canvas.parentElement!.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(p.width * this.dpr);
    this.canvas.height = Math.round(p.height * this.dpr);
    this.canvas.style.width = p.width + "px";
    this.canvas.style.height = p.height + "px";
  }
  fit() {
    const s = this.studio,
      W = this.canvas.width,
      H = this.canvas.height;
    this.zoom = Math.max(1, Math.floor(Math.min((W * 0.82) / s.w, (H * 0.82) / s.h)));
    this.panX = Math.round((W - s.w * this.zoom) / 2);
    this.panY = Math.round((H - s.h * this.zoom) / 2);
  }
  zoomAt(factor: number, sx?: number, sy?: number) {
    sx = sx ?? this.canvas.width / 2;
    sy = sy ?? this.canvas.height / 2;
    const nz = Math.max(1, Math.min(80, Math.round(this.zoom * factor) || 1));
    const z = nz === this.zoom ? this.zoom + Math.sign(factor - 1) : nz;
    const nzz = Math.max(1, Math.min(80, z));
    this.panX = Math.round(sx - ((sx - this.panX) * nzz) / this.zoom);
    this.panY = Math.round(sy - ((sy - this.panY) * nzz) / this.zoom);
    this.zoom = nzz;
  }
  toArt(clientX: number, clientY: number, float = false) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) * this.dpr - this.panX) / this.zoom,
      y = ((clientY - r.top) * this.dpr - this.panY) / this.zoom;
    return float ? [x, y] : [Math.floor(x), Math.floor(y)];
  }

  /** Animate a set of changed pixels materializing (agent paint). */
  materialize(
    changes: Change[],
    prevComposite: Uint32Array,
    order: "scan" | "random" | "radial" = "scan",
    spread?: number,
  ) {
    const s = this.studio,
      now = performance.now();
    let list = changes.map((c) => c.i).filter((i) => prevComposite[i] !== s.composite[i]);
    if (!list.length) return;
    if (order === "scan") list.sort((a, b) => a - b);
    else if (order === "random") list.sort(() => Math.random() - 0.5);
    else {
      const cx = list.reduce((a, i) => a + (i % s.w), 0) / list.length,
        cy = list.reduce((a, i) => a + Math.floor(i / s.w), 0) / list.length;
      list.sort(
        (a, b) =>
          Math.hypot((a % s.w) - cx, Math.floor(a / s.w) - cy) -
          Math.hypot((b % s.w) - cx, Math.floor(b / s.w) - cy),
      );
    }
    const total = spread ?? Math.min(1400, 120 + list.length * 3);
    const step = total / list.length;
    list.forEach((i, k) => {
      const f: Fx = { i, old: prevComposite[i], nw: s.composite[i], start: now + k * step };
      const prev = this.fxMap.get(i);
      if (prev) f.old = prev.old;
      this.fxMap.set(i, f);
    });
    this.fx = [...this.fxMap.values()];
    // sparkles along the way
    const n = Math.min(70, Math.ceil(list.length / 12));
    for (let k = 0; k < n; k++) {
      const idx = Math.floor(Math.random() * list.length),
        i = list[idx];
      setTimeout(
        () => this.sparkle((i % s.w) + 0.5, Math.floor(i / s.w) + 0.5, s.composite[i], 2),
        idx * step,
      );
    }
  }
  sparkle(x: number, y: number, c: number, n = 6) {
    const [r, g, b] = unpack(c);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2,
        sp = 0.02 + Math.random() * 0.06;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.02,
        life: 0,
        max: 500 + Math.random() * 600,
        color: `rgb(${Math.min(255, r + 90)},${Math.min(255, g + 90)},${Math.min(255, b + 90)})`,
        size: 0.35 + Math.random() * 0.45,
      });
    }
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
  }
  burst(pts: [number, number][], c: number) {
    for (let k = 0; k < Math.min(40, pts.length / 4 + 4); k++) {
      const p = pts[Math.floor(Math.random() * pts.length)];
      if (p) this.sparkle(p[0] + 0.5, p[1] + 0.5, c, 2);
    }
  }
  pointAgent(x: number, y: number, label: string) {
    const a = this.agent;
    if (!a.seen || performance.now() > a.until + 800) {
      a.x = x;
      a.y = y;
      a.seen = true;
    }
    a.tx = x;
    a.ty = y;
    a.label = label;
    a.until = performance.now() + 2600;
  }
  ghost(canvas: HTMLCanvasElement, x: number, y: number, label = "before") {
    this.ghosts.push({ canvas, x, y, start: performance.now(), dur: 1900, label });
  }

  private draw(t: number) {
    const { ctx, studio: s } = this,
      W = this.canvas.width,
      H = this.canvas.height,
      z = this.zoom,
      dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (this.art.width !== s.w || this.art.height !== s.h) {
      this.art.width = s.w;
      this.art.height = s.h;
      this.disp = new Uint32Array(s.w * s.h);
      this.lastVersion = -1;
    }
    // --- build displayed buffer (composite, with pending fx showing old colour)
    const anyFx = this.fx.length > 0;
    if (anyFx || this.lastVersion !== s.version) {
      this.disp.set(s.composite);
      if (anyFx) {
        const keep: Fx[] = [];
        for (const f of this.fx) {
          if (t < f.start + 300) {
            this.disp[f.i] = f.old;
            keep.push(f);
          } else this.fxMap.delete(f.i);
        }
        this.fx = keep;
      }
      const img = new ImageData(
        new Uint8ClampedArray(this.disp.buffer.slice(0) as ArrayBuffer),
        s.w,
        s.h,
      );
      this.artCtx.putImageData(img, 0, 0);
      this.lastVersion = anyFx ? -1 : s.version;
    }
    const ax = this.panX,
      ay = this.panY,
      aw = s.w * z,
      ah = s.h * z;
    // --- shadow / board
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 60 * dpr;
    ctx.shadowOffsetY = 24 * dpr;
    ctx.fillStyle = "#14131c";
    ctx.fillRect(ax, ay, aw, ah);
    ctx.shadowColor = "rgba(255,77,141,0.16)";
    ctx.shadowBlur = 120 * dpr;
    ctx.shadowOffsetY = 0;
    ctx.fillRect(ax, ay, aw, ah);
    ctx.restore();
    // checkerboard
    if (!this.checker) {
      const c = document.createElement("canvas");
      c.width = c.height = 2;
      const cx = c.getContext("2d")!;
      cx.fillStyle = "#1b1a26";
      cx.fillRect(0, 0, 2, 2);
      cx.fillStyle = "#211f2e";
      cx.fillRect(0, 0, 1, 1);
      cx.fillRect(1, 1, 1, 1);
      this.checker = ctx.createPattern(c, "repeat");
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(ax, ay, aw, ah);
    ctx.clip();
    const cs = Math.max(4, Math.round((z * Math.max(1, s.w / 16)) / 4));
    this.checker!.setTransform(new DOMMatrix().translate(ax, ay).scale(cs));
    ctx.fillStyle = this.checker!;
    ctx.fillRect(ax, ay, aw, ah);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.art, ax, ay, aw, ah);
    // fx (materializing pixels)
    for (const f of this.fx) {
      const p = (t - f.start) / 300;
      if (p < 0 || p > 1) continue;
      const x = (f.i % s.w) * z + ax,
        y = Math.floor(f.i / s.w) * z + ay;
      const [r, g, b, a] = unpack(f.nw),
        sc = Math.max(0, easeOutBack(p)),
        sz = z * sc,
        o = (z - sz) / 2;
      ctx.fillStyle = `rgba(${r},${g},${b},${0.35 * (1 - p)})`;
      ctx.fillRect(
        x - z * 0.6 * (1 - p),
        y - z * 0.6 * (1 - p),
        z + z * 1.2 * (1 - p),
        z + z * 1.2 * (1 - p),
      );
      ctx.fillStyle = a ? `rgb(${r},${g},${b})` : "#1b1a26";
      ctx.fillRect(x + o, y + o, sz, sz);
      if (p < 0.45) {
        ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - p / 0.45)})`;
        ctx.fillRect(x + o, y + o, sz, sz);
      }
    }
    ctx.restore();
    // bloom
    if (this.bloom) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.38;
      ctx.filter = `blur(${Math.max(4, z * 0.9)}px)`;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.art, ax, ay, aw, ah);
      ctx.restore();
    }
    // ghosts (onion of before-state)
    const drawGhost = (g: Ghost, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(g.canvas, ax + g.x * z, ay + g.y * z, g.canvas.width * z, g.canvas.height * z);
      ctx.globalAlpha = Math.min(1, alpha * 1.4);
      ctx.strokeStyle = "#5ef2ff";
      ctx.lineWidth = dpr;
      ctx.setLineDash([3 * dpr, 3 * dpr]);
      ctx.strokeRect(
        ax + g.x * z + 0.5,
        ay + g.y * z + 0.5,
        g.canvas.width * z,
        g.canvas.height * z,
      );
      if (g.label) {
        ctx.setLineDash([]);
        ctx.font = `600 ${10 * dpr}px Inter`;
        ctx.fillStyle = "#5ef2ff";
        ctx.fillText(g.label.toUpperCase(), ax + g.x * z + 4 * dpr, ay + g.y * z - 6 * dpr);
      }
      ctx.restore();
    };
    this.ghosts = this.ghosts.filter((g) => t - g.start < g.dur);
    for (const g of this.ghosts) {
      const p = (t - g.start) / g.dur;
      drawGhost(g, 0.85 * (1 - p) ** 1.5);
    }
    if (this.onion) drawGhost(this.onion, 0.9);
    // grid
    if (this.grid && z >= 5) {
      ctx.save();
      ctx.beginPath();
      for (let x = 1; x < s.w; x++) {
        if (x % 8) {
          ctx.moveTo(ax + x * z + 0.5, ay);
          ctx.lineTo(ax + x * z + 0.5, ay + ah);
        }
      }
      for (let y = 1; y < s.h; y++) {
        if (y % 8) {
          ctx.moveTo(ax, ay + y * z + 0.5);
          ctx.lineTo(ax + aw, ay + y * z + 0.5);
        }
      }
      ctx.strokeStyle = "rgba(255,255,255,0.045)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      for (let x = 8; x < s.w; x += 8) {
        ctx.moveTo(ax + x * z + 0.5, ay);
        ctx.lineTo(ax + x * z + 0.5, ay + ah);
      }
      for (let y = 8; y < s.h; y += 8) {
        ctx.moveTo(ax, ay + y * z + 0.5);
        ctx.lineTo(ax + aw, ay + y * z + 0.5);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.stroke();
      ctx.restore();
    }
    // frame
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = dpr;
    ctx.strokeRect(ax - 0.5 * dpr, ay - 0.5 * dpr, aw + dpr, ah + dpr);
    // preview
    if (this.preview) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = this.preview.color;
      for (const [x, y] of this.preview.pts)
        if (x >= 0 && y >= 0 && x < s.w && y < s.h) ctx.fillRect(ax + x * z, ay + y * z, z, z);
      ctx.restore();
    }
    // selection marching ants
    const sel = s.selection;
    if (sel) {
      const path = new Path2D();
      if (sel.kind === "rect")
        path.rect(ax + sel.x * z + 0.5, ay + sel.y * z + 0.5, sel.w * z, sel.h * z);
      else {
        const m = sel.mask,
          w = s.w;
        for (let y = sel.y; y < sel.y + sel.h; y++)
          for (let x = sel.x; x < sel.x + sel.w; x++) {
            if (!m[y * w + x]) continue;
            const X = ax + x * z + 0.5,
              Y = ay + y * z + 0.5;
            if (y === 0 || !m[(y - 1) * w + x]) {
              path.moveTo(X, Y);
              path.lineTo(X + z, Y);
            }
            if (y === s.h - 1 || !m[(y + 1) * w + x]) {
              path.moveTo(X, Y + z);
              path.lineTo(X + z, Y + z);
            }
            if (x === 0 || !m[y * w + x - 1]) {
              path.moveTo(X, Y);
              path.lineTo(X, Y + z);
            }
            if (x === s.w - 1 || !m[y * w + x + 1]) {
              path.moveTo(X + z, Y);
              path.lineTo(X + z, Y + z);
            }
          }
      }
      ctx.save();
      if (this.awaitingAgent) {
        const pulse = 0.5 + 0.5 * Math.sin(t / 260);
        ctx.shadowColor = "#5ef2ff";
        ctx.shadowBlur = (10 + 14 * pulse) * dpr;
        ctx.strokeStyle = `rgba(94,242,255,${0.4 + 0.4 * pulse})`;
        ctx.lineWidth = 3 * dpr;
        ctx.stroke(path);
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = "rgba(94,242,255,0.05)";
      if (sel.kind === "rect") ctx.fill(path);
      ctx.lineWidth = 1.25 * dpr;
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.strokeStyle = "#05050a";
      ctx.lineDashOffset = 0;
      ctx.stroke(path);
      ctx.strokeStyle = "#ffffff";
      ctx.lineDashOffset = -(t / 60) % (9 * dpr);
      ctx.stroke(path);
      ctx.setLineDash([]);
      ctx.font = `600 ${10.5 * dpr}px "JetBrains Mono"`;
      const lbl = `${sel.w}×${sel.h}  @ ${sel.x},${sel.y}`;
      const lw = ctx.measureText(lbl).width + 12 * dpr,
        lx = ax + sel.x * z,
        ly = ay + sel.y * z - 22 * dpr;
      ctx.fillStyle = "rgba(10,10,18,0.85)";
      ctx.beginPath();
      ctx.roundRect(lx, Math.max(4 * dpr, ly), lw, 17 * dpr, 5 * dpr);
      ctx.fill();
      ctx.fillStyle = "#d9fbff";
      ctx.fillText(lbl, lx + 6 * dpr, Math.max(4 * dpr, ly) + 12 * dpr);
      ctx.restore();
    }
    if (this.lassoPath && this.lassoPath.length > 1) {
      ctx.save();
      ctx.beginPath();
      this.lassoPath.forEach(([x, y], k) =>
        k ? ctx.lineTo(ax + x * z, ay + y * z) : ctx.moveTo(ax + x * z, ay + y * z),
      );
      ctx.strokeStyle = "#fff";
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.lineDashOffset = -(t / 60);
      ctx.lineWidth = 1.25 * dpr;
      ctx.stroke();
      ctx.restore();
    }
    // hover cell
    if (this.hover) {
      const [x, y] = this.hover;
      if (x >= 0 && y >= 0 && x < s.w && y < s.h) {
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = dpr;
        ctx.strokeRect(ax + x * z + 0.5, ay + y * z + 0.5, z - 1, z - 1);
      }
    }
    // particles
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    this.particles = this.particles.filter((p) => (p.life += 16) < p.max);
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.0012;
      const k = 1 - p.life / p.max,
        X = ax + p.x * z,
        Y = ay + p.y * z,
        r = p.size * z * k * (0.6 + 0.4 * Math.sin(p.life / 40));
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(X, Y - r * 2);
      ctx.lineTo(X + r * 0.35, Y - r * 0.35);
      ctx.lineTo(X + r * 2, Y);
      ctx.lineTo(X + r * 0.35, Y + r * 0.35);
      ctx.lineTo(X, Y + r * 2);
      ctx.lineTo(X - r * 0.35, Y + r * 0.35);
      ctx.lineTo(X - r * 2, Y);
      ctx.lineTo(X - r * 0.35, Y - r * 0.35);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // agent cursor
    const a = this.agent;
    if (t < a.until) {
      a.x += (a.tx - a.x) * 0.14;
      a.y += (a.ty - a.y) * 0.14;
      const fade = Math.min(1, (a.until - t) / 600),
        X = ax + a.x * z,
        Y = ay + a.y * z,
        pulse = 1 + 0.15 * Math.sin(t / 120);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = "#5ef2ff";
      ctx.shadowColor = "#5ef2ff";
      ctx.shadowBlur = 16 * dpr;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(X, Y, 11 * dpr * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(X, Y, 3 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = "#5ef2ff";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = `600 ${11 * dpr}px "JetBrains Mono"`;
      const label = "✦ agent · " + a.label,
        w = ctx.measureText(label).width + 16 * dpr;
      ctx.fillStyle = "rgba(8,24,32,0.92)";
      ctx.beginPath();
      ctx.roundRect(X + 16 * dpr, Y + 10 * dpr, w, 22 * dpr, 11 * dpr);
      ctx.fill();
      ctx.strokeStyle = "rgba(94,242,255,0.55)";
      ctx.lineWidth = dpr;
      ctx.stroke();
      ctx.fillStyle = "#c9fbff";
      ctx.fillText(label, X + 24 * dpr, Y + 25 * dpr);
      ctx.restore();
    }
  }
}
