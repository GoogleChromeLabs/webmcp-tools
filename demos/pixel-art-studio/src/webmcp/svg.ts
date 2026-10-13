/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SVG → pixel rasterizer behind draw_svg. Models write SVG far better than they type
 * character grids, so agents describe shapes in SVG and the studio turns them into pixel
 * art: crisp (aliased) edges, colors snapped to the palette, and an optional 1-px outline.
 */
import { cssToU32, pack } from "../model";

/** Longest markup draw_svg accepts, so one call cannot stall the page. */
export const MAX_SVG_CHARS = 20_000;

/** Pixels at least this opaque (0–255) are painted; fainter edge leftovers are dropped. */
const ALPHA_THRESHOLD = 128;

/** A rasterized pixel in region coordinates; `color` is packed like the studio's layers. */
export interface RasterPixel {
  x: number;
  y: number;
  color: number;
}

export interface SvgRaster {
  /** Opaque pixels of the drawing. */
  pixels: RasterPixel[];
  /** Transparent pixels touching the drawing (4-neighbourhood), used for the outline. */
  outline: { x: number; y: number }[];
}

/** A plain number or a px length (e.g. "64", "64px"); anything else (%, em) is ignored. */
const lengthOf = (v: string | null): number =>
  v !== null && /^\s*\d+(\.\d+)?\s*(px)?\s*$/.test(v) ? parseFloat(v) : NaN;

/**
 * Parse agent-written markup into a standalone SVG document rendered at `width`×`height`.
 * The HTML parser is used on purpose: it accepts a missing xmlns and other small slips that
 * models make, and it never runs scripts. Active content is still removed, a viewBox is
 * filled in when missing, and edges are forced crisp so shapes land on whole pixels.
 */
export function normalizeSvg(markup: unknown, width: number, height: number): string {
  if (typeof markup !== "string" || !markup.trim()) {
    throw new Error(
      'svg must be SVG markup, e.g. <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="8" fill="#ffc145"/></svg>',
    );
  }
  if (markup.length > MAX_SVG_CHARS) {
    throw new Error(
      `svg is ${markup.length} chars, over the ${MAX_SVG_CHARS} limit. Split the picture into several draw_svg calls.`,
    );
  }
  const svg = new DOMParser().parseFromString(markup, "text/html").querySelector("svg");
  if (!svg)
    throw new Error('No <svg> element found. Wrap the shapes in <svg viewBox="0 0 W H">…</svg>.');

  svg.querySelectorAll("script, foreignObject").forEach((node) => node.remove());
  for (const el of [svg, ...svg.querySelectorAll("*")]) {
    // Copy first: removing from the live attribute map while iterating it would skip entries.
    for (const { name } of Array.from(el.attributes))
      if (/^on/i.test(name)) el.removeAttribute(name);
  }
  if (!svg.hasAttribute("viewBox")) {
    const w = lengthOf(svg.getAttribute("width")),
      h = lengthOf(svg.getAttribute("height"));
    svg.setAttribute("viewBox", w > 0 && h > 0 ? `0 0 ${w} ${h}` : `0 0 ${width} ${height}`);
  }
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  if (!svg.hasAttribute("shape-rendering")) svg.setAttribute("shape-rendering", "crispEdges");
  return new XMLSerializer().serializeToString(svg);
}

/** Render normalized SVG markup to RGBA pixels at exactly `width`×`height`. */
export async function renderSvg(
  svgText: string,
  width: number,
  height: number,
): Promise<ImageData> {
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
  try {
    const img = new Image(width, height);
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error(
        "The browser could not render this SVG. Use plain shapes (rect, circle, ellipse, line, polyline, polygon, path) with fill or stroke colors.",
      );
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) throw new Error("Canvas 2D is not available in this browser.");
    g.drawImage(img, 0, 0, width, height);
    return g.getImageData(0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "Redmean" weighted RGB distance: a cheap, perceptually reasonable color difference. */
function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const rm = (r1 + r2) / 2,
    dr = r1 - r2,
    dg = g1 - g2,
    db = b1 - b2;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

/**
 * Turn rendered RGBA into studio pixels. Opaque pixels snap to the nearest `palette` color;
 * pass an empty palette to keep the exact colors. Also returns the outline ring.
 */
export function quantize(img: ImageData, palette: readonly string[]): SvgRaster {
  const { width: w, height: h, data } = img;
  const swatches = palette
    .map((hex) => cssToU32(hex))
    .filter((c): c is number => c !== null && c >>> 24 > 0)
    .map((c) => ({ c, r: c & 255, g: (c >>> 8) & 255, b: (c >>> 16) & 255 }));
  const cache = new Map<number, number>();
  const toColor = (r: number, g: number, b: number): number => {
    if (!swatches.length) return pack(r, g, b);
    const key = (r << 16) | (g << 8) | b;
    let best = cache.get(key);
    if (best === undefined) {
      let bestDistance = Infinity;
      for (const s of swatches) {
        const d = colorDistance(r, g, b, s.r, s.g, s.b);
        if (d < bestDistance) {
          bestDistance = d;
          best = s.c;
        }
      }
      cache.set(key, best!);
    }
    return best!;
  };

  const mask = new Uint8Array(w * h);
  const pixels: RasterPixel[] = [];
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (data[o + 3] < ALPHA_THRESHOLD) continue;
    mask[i] = 1;
    pixels.push({ x: i % w, y: (i / w) | 0, color: toColor(data[o], data[o + 1], data[o + 2]) });
  }

  const outline: { x: number; y: number }[] = [];
  for (let i = 0; i < w * h; i++) {
    if (mask[i]) continue;
    const x = i % w,
      y = (i / w) | 0;
    if (
      (x > 0 && mask[i - 1]) ||
      (x < w - 1 && mask[i + 1]) ||
      (y > 0 && mask[i - w]) ||
      (y < h - 1 && mask[i + w])
    ) {
      outline.push({ x, y });
    }
  }
  return { pixels, outline };
}
