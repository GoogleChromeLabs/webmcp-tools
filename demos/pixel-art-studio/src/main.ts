/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/silkscreen/400.css";
import "./style.css";
import { Studio, cssToU32, u32ToHex, CHARSET, MAX_PALETTE } from "./model";
import { View } from "./view";
import { PALETTES } from "./palettes";
import { buildTools, registerTools, type FeedApi } from "./webmcp";

type ToolId =
  | "pencil"
  | "eraser"
  | "line"
  | "rect"
  | "ellipse"
  | "fill"
  | "gradient"
  | "picker"
  | "select"
  | "lasso"
  | "move"
  | "hand";
const I = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS: Record<string, string> = {
  pencil: I('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>'),
  eraser: I(
    '<path d="M8 20h12"/><path d="M4.5 15.5l9-9a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11 19H8z"/><path d="M9 11l5 5"/>',
  ),
  line: I(
    '<path d="M5 19L19 5"/><circle cx="5" cy="19" r="1.5" fill="currentColor"/><circle cx="19" cy="5" r="1.5" fill="currentColor"/>',
  ),
  rect: I('<rect x="4" y="5" width="16" height="14" rx="1"/>'),
  ellipse: I('<ellipse cx="12" cy="12" rx="8.5" ry="7"/>'),
  fill: I(
    '<path d="M5 11l6-6 8 8-6 6a2 2 0 01-2.8 0L5 13.8a2 2 0 010-2.8z"/><path d="M5 12h14"/><path d="M20 16s1.5 2 1.5 3a1.5 1.5 0 01-3 0c0-1 1.5-3 1.5-3z" fill="currentColor"/>',
  ),
  gradient: I(
    '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16M12 4v16" stroke-dasharray="2 2"/><path d="M16 4v16" stroke-dasharray="1 3"/>',
  ),
  picker: I('<path d="M14 4l6 6-2 2-6-6z"/><path d="M13 9l-8 8v3h3l8-8"/>'),
  select: I(
    '<path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3" /><path d="M11 4h2M11 20h2M4 11v2M20 11v2"/>',
  ),
  lasso: I(
    '<path d="M7 17c-3-1.5-4-4-3-6.5C5.5 6 11 4 16 5s5 5 2.5 8-8 4-11.5 4z" stroke-dasharray="3 2.4"/><path d="M7 17c0 2 1 3 3 3"/>',
  ),
  move: I(
    '<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  ),
  hand: I(
    '<path d="M8 13V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6 7-2.5 0-4-1-5.5-3L3 13.5a1.5 1.5 0 012.3-1.9L8 14"/>',
  ),
  undo: I('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'),
  redo: I('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>'),
  grid: I(
    '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16"/>',
  ),
  bloom: I(
    '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  ),
  crt: I(
    '<rect x="3" y="4" width="18" height="13" rx="2.5"/><path d="M8 21h8M6 8h12M6 11h12M6 14h12" opacity=".6"/>',
  ),
  export: I('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19h14"/>'),
  import: I(
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
  ),
  fit: I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  eye: I(
    '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  ),
  eyeoff: I(
    '<path d="M3 3l18 18"/><path d="M10.6 5.6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.5 9.5 6.5a17 17 0 01-2.4 3.2M6.5 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/>',
  ),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  trash: I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/>'),
  up: I('<path d="M6 15l6-6 6 6"/>'),
  down: I('<path d="M6 9l6 6 6-6"/>'),
  dup: I(
    '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
  ),
  spark: I(
    '<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  ),
  swap: I('<path d="M7 4L4 7l3 3M4 7h11a4 4 0 014 4M17 20l3-3-3-3M20 17H9a4 4 0 01-4-4"/>'),
  sym: I('<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 7L4 12l5 5zM15 7l5 5-5 5z"/>'),
};
const TOOLS: { id: ToolId; name: string; key: string }[] = [
  { id: "pencil", name: "Pencil", key: "B" },
  { id: "eraser", name: "Eraser", key: "E" },
  { id: "line", name: "Line", key: "L" },
  { id: "rect", name: "Rectangle", key: "R" },
  { id: "ellipse", name: "Ellipse", key: "O" },
  { id: "fill", name: "Flood fill", key: "G" },
  { id: "gradient", name: "Dither gradient", key: "D" },
  { id: "picker", name: "Eyedropper", key: "I" },
  { id: "select", name: "Rectangle select", key: "M" },
  { id: "lasso", name: "Lasso select", key: "Q" },
  { id: "move", name: "Move selection", key: "V" },
  { id: "hand", name: "Pan", key: "H" },
];

const studio = new Studio();
const ui = {
  tool: "pencil" as ToolId,
  filled: false,
  brush: 1,
  symmetry: "none" as "none" | "x" | "y" | "xy",
  dither: 4,
  paletteId: "sunset",
};

document.querySelector("#app")!.innerHTML = `
<div class="shell">
  <header class="top">
    <div class="brand"><div class="logo">${"<i></i>".repeat(9)}</div><div><div class="title">PIXEL<span>·</span>ART<span>·</span>STUDIO</div><div class="sub">a WebMCP drawing board</div></div></div>
    <div class="top-mid">
      <div class="seg" id="sizeSeg">${[32, 64, 128].map((n) => `<button data-size="${n}">${n}</button>`).join("")}</div>
      <div class="sep"></div>
      <button class="ib" id="undo" title="Undo (Ctrl+Z)">${ICONS.undo}</button><button class="ib" id="redo" title="Redo (Ctrl+Shift+Z)">${ICONS.redo}</button>
      <div class="sep"></div>
      <button class="ib tg" id="tGrid" title="Grid (#)">${ICONS.grid}</button><button class="ib tg" id="tBloom" title="Bloom glow">${ICONS.bloom}</button><button class="ib tg" id="tCrt" title="CRT scanlines">${ICONS.crt}</button><button class="ib" id="fit" title="Fit to screen (F)">${ICONS.fit}</button>
    </div>
    <div class="top-right">
      <label class="btn ghost" title="Import image → pixelate to palette">${ICONS.import}<span>Import</span><input type="file" id="importFile" accept="image/*" hidden></label>
      <div class="export-wrap"><button class="btn primary" id="exportBtn">${ICONS.export}<span>Export PNG</span></button>
        <div class="menu" id="exportMenu">${[1, 4, 8, 16, 32].map((n) => `<button data-scale="${n}">${n}× <em></em></button>`).join("")}</div></div>
    </div>
  </header>
  <aside class="rail">
    ${TOOLS.map((t, k) => `${k === 8 ? '<div class="rsep"></div>' : ""}${k === 11 ? '<div class="rsep"></div>' : ""}<button class="tool" data-tool="${t.id}" data-tip="${t.name} · ${t.key}">${ICONS[t.id]}</button>`).join("")}
    <div class="rail-fill"></div>
    <div class="swatches" title="Primary / secondary (X to swap)"><div class="sw2" id="sw2"></div><div class="sw1" id="sw1"></div><button class="swapb" id="swap">${ICONS.swap}</button></div>
  </aside>
  <main class="stage" id="stage">
    <div class="stage-bg"></div>
    <div class="canvas-wrap"><canvas id="cv"></canvas><div class="crt" id="crt"></div><div class="blank" id="blank"><div class="big" id="blankSize">64 × 64</div><div class="small">draw something — or ask your agent: <b>“paint a sunset”</b></div></div></div>
    <div class="optbar" id="optbar">
      <div class="opt" data-for="pencil eraser"><span>Brush</span><div class="seg sm" id="brushSeg">${[1, 2, 3, 4].map((n) => `<button data-brush="${n}">${n}</button>`).join("")}</div></div>
      <div class="opt" data-for="rect ellipse"><span>Style</span><div class="seg sm" id="fillSeg"><button data-filled="0">Outline</button><button data-filled="1">Filled</button></div></div>
      <div class="opt" data-for="gradient"><span>Dither</span><div class="seg sm" id="ditherSeg">${[0, 2, 4, 8].map((n) => `<button data-dither="${n}">${n ? "Bayer " + n : "None"}</button>`).join("")}</div><span class="hint">primary → secondary, drag direction</span></div>
      <div class="opt" data-for="pencil eraser line rect ellipse fill gradient"><span>${ICONS.sym}</span><div class="seg sm" id="symSeg">${["none", "x", "y", "xy"].map((n) => `<button data-sym="${n}">${n === "none" ? "Off" : n === "xy" ? "Quad" : n.toUpperCase()}</button>`).join("")}</div></div>
      <div class="opt" data-for="select lasso move"><span class="hint">Drag to select · Esc deselects · selection is visible to agents</span></div>
    </div>
    <div class="selbar" id="selbar">
      <div class="selmeta"><b id="selDim"></b><span id="selPos"></span></div>
      <button data-sel="clear" title="Delete">${ICONS.trash}Clear</button>
      <button data-sel="fill" title="Fill with primary">${ICONS.fill}Fill</button>
      <button data-sel="gradient" title="Dithered gradient">${ICONS.gradient}Gradient</button>
      <button data-sel="move" title="Move contents">${ICONS.move}Move</button>
      <button data-sel="agent" class="agentbtn" title="Copy a prompt for your agent">${ICONS.spark}Regenerate with agent</button>
      <button data-sel="deselect" class="x" title="Deselect (Esc)">✕</button>
    </div>
    <div class="toast" id="toast"></div>
    <div class="status"><span id="stPos">–, –</span><span id="stZoom"></span><span id="stSize"></span><span id="stColor"></span></div>
  </main>
  <aside class="side">
    <section class="card">
      <div class="card-h"><h3>Palette</h3><select id="palSel">${PALETTES.map((p) => `<option value="${p.id}">${p.name}</option>`).join("")}<option value="custom">Custom</option></select></div>
      <div class="palette" id="palette"></div>
      <div class="pal-edit"><input type="color" id="colorPick" value="#ff7b5c"><input id="hexIn" spellcheck="false" value="#ff7b5c"><button class="ib sm" id="addColor" title="Add to palette">${ICONS.plus}</button></div>
      <div class="hint">Right-click swatch: secondary · Shift-click: remove · Drag: reorder</div>
    </section>
    <section class="card">
      <div class="card-h"><h3>Layers</h3><div class="row"><button class="ib sm" id="layerAdd" title="New layer">${ICONS.plus}</button><button class="ib sm" id="layerDup" title="Duplicate">${ICONS.dup}</button><button class="ib sm" id="layerUp" title="Move up">${ICONS.up}</button><button class="ib sm" id="layerDown" title="Move down">${ICONS.down}</button><button class="ib sm" id="layerDel" title="Delete">${ICONS.trash}</button></div></div>
      <div class="layers" id="layers"></div>
    </section>
    <section class="card feed-card">
      <div class="card-h"><h3>Agent activity</h3><span class="count" id="feedCount">0 calls</span></div>
      <div class="feed" id="feed"><div class="empty" id="feedEmpty">${ICONS.spark}<p>Waiting for an agent…</p><small>Tool calls arriving over WebMCP appear here, and paint themselves onto the canvas.</small></div></div>
    </section>
  </aside>
</div>`;

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const canvas = $<HTMLCanvasElement>("#cv");
const view = new View(canvas, studio);

// ---------------- toast ----------------
let toastT: any;
function toast(msg: string) {
  const t = $("#toast");
  t.innerHTML = msg;
  t.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("on"), 2400);
}

// ---------------- palette ----------------
function renderPalette() {
  const el = $("#palette");
  el.innerHTML = "";
  studio.palette.forEach((hex, i) => {
    const b = document.createElement("button");
    b.className = "swatch";
    b.style.setProperty("--c", hex);
    b.draggable = true;
    if (hex === studio.primary) b.classList.add("p");
    if (hex === studio.secondary) b.classList.add("s");
    b.title = `${hex}  ·  index ${i}  ·  char "${CHARSET[i]}"`;
    b.innerHTML = `<i>${CHARSET[i]}</i>`;
    b.onclick = (e) => {
      if (e.shiftKey) {
        if (studio.palette.length > 2) {
          studio.palette.splice(i, 1);
          markCustom();
        }
        return;
      }
      studio.primary = hex;
      studio.emit("colors");
    };
    b.oncontextmenu = (e) => {
      e.preventDefault();
      studio.secondary = hex;
      studio.emit("colors");
    };
    b.ondragstart = (e) => e.dataTransfer!.setData("text/plain", String(i));
    b.ondragover = (e) => e.preventDefault();
    b.ondrop = (e) => {
      e.preventDefault();
      const from = +e.dataTransfer!.getData("text/plain");
      const [c] = studio.palette.splice(from, 1);
      studio.palette.splice(i, 0, c);
      markCustom();
    };
    el.appendChild(b);
  });
  $<HTMLSelectElement>("#palSel").value =
    PALETTES.find((p) => p.name === studio.paletteName)?.id ?? "custom";
}
function markCustom() {
  studio.paletteName = "Custom";
  studio.emit("palette");
}
$<HTMLSelectElement>("#palSel").onchange = (e) => {
  const id = (e.target as HTMLSelectElement).value,
    p = PALETTES.find((p) => p.id === id);
  if (p) {
    studio.palette = [...p.colors];
    studio.paletteName = p.name;
    studio.emit("palette");
  }
};
const hexIn = $<HTMLInputElement>("#hexIn"),
  picker = $<HTMLInputElement>("#colorPick");
picker.oninput = () => {
  hexIn.value = picker.value;
  studio.primary = picker.value;
  studio.emit("colors");
};
hexIn.onchange = () => {
  const c = cssToU32(hexIn.value);
  if (c !== null && c) {
    studio.primary = u32ToHex(c);
    studio.emit("colors");
  }
};
$("#addColor").onclick = () => {
  if (!studio.palette.includes(studio.primary) && studio.palette.length < MAX_PALETTE) {
    studio.palette.push(studio.primary);
    markCustom();
  }
};
$("#swap").onclick = () => swapColors();
function swapColors() {
  [studio.primary, studio.secondary] = [studio.secondary, studio.primary];
  studio.emit("colors");
}

// ---------------- layers ----------------
function renderLayers() {
  const el = $("#layers");
  el.innerHTML = "";
  [...studio.layers].reverse().forEach((l) => {
    const i = studio.layers.indexOf(l);
    const row = document.createElement("div");
    row.className = "layer" + (i === studio.active ? " on" : "") + (l.visible ? "" : " hid");
    const th = document.createElement("canvas");
    th.className = "lthumb";
    th.width = studio.w;
    th.height = studio.h;
    th.getContext("2d")!.putImageData(
      new ImageData(new Uint8ClampedArray(l.data.slice().buffer), studio.w, studio.h),
      0,
      0,
    );
    row.innerHTML = `<button class="vis">${l.visible ? ICONS.eye : ICONS.eyeoff}</button>`;
    row.appendChild(th);
    const meta = document.createElement("div");
    meta.className = "lmeta";
    meta.innerHTML = `<span class="lname">${l.name}</span><div class="lop"><input type="range" min="0" max="100" value="${Math.round(l.opacity * 100)}"><em>${Math.round(l.opacity * 100)}%</em></div>`;
    row.appendChild(meta);
    row.onclick = (e) => {
      if ((e.target as HTMLElement).closest(".vis,input")) return;
      studio.active = i;
      studio.emit("layers");
    };
    (row.querySelector(".vis") as HTMLElement).onclick = () => {
      l.visible = !l.visible;
      studio.emit("layers");
    };
    const rng = meta.querySelector("input")!;
    rng.oninput = () => {
      l.opacity = +rng.value / 100;
      (meta.querySelector("em") as HTMLElement).textContent = rng.value + "%";
      studio.emit("opacity");
    };
    (meta.querySelector(".lname") as HTMLElement).ondblclick = () => {
      const n = prompt("Layer name", l.name);
      if (n) {
        l.name = n;
        studio.emit("layers");
      }
    };
    el.appendChild(row);
  });
}
$("#layerAdd").onclick = () => {
  studio.checkpoint("Add layer");
  studio.addLayer();
  studio.emit("layers");
};
$("#layerDup").onclick = () => {
  studio.checkpoint("Duplicate layer");
  const src = studio.layer,
    l = studio.addLayer(src.name + " copy");
  l.data.set(src.data);
  l.opacity = src.opacity;
  studio.emit("layers");
};
$("#layerDel").onclick = () => {
  if (studio.layers.length < 2) return;
  studio.checkpoint("Delete layer");
  studio.layers.splice(studio.active, 1);
  studio.active = Math.max(0, studio.active - 1);
  studio.emit("layers");
};
const moveLayer = (d: number) => {
  const i = studio.active,
    j = i + d;
  if (j < 0 || j >= studio.layers.length) return;
  studio.checkpoint("Reorder");
  const [l] = studio.layers.splice(i, 1);
  studio.layers.splice(j, 0, l);
  studio.active = j;
  studio.emit("layers");
};
$("#layerUp").onclick = () => moveLayer(1);
$("#layerDown").onclick = () => moveLayer(-1);

// ---------------- toolbar / options ----------------
function setTool(t: ToolId) {
  ui.tool = t;
  refresh();
}
document
  .querySelectorAll<HTMLElement>(".tool")
  .forEach((b) => (b.onclick = () => setTool(b.dataset.tool as ToolId)));
document.querySelectorAll<HTMLElement>("#brushSeg button").forEach(
  (b) =>
    (b.onclick = () => {
      ui.brush = +b.dataset.brush!;
      refresh();
    }),
);
document.querySelectorAll<HTMLElement>("#fillSeg button").forEach(
  (b) =>
    (b.onclick = () => {
      ui.filled = b.dataset.filled === "1";
      refresh();
    }),
);
document.querySelectorAll<HTMLElement>("#ditherSeg button").forEach(
  (b) =>
    (b.onclick = () => {
      ui.dither = +b.dataset.dither!;
      refresh();
    }),
);
document.querySelectorAll<HTMLElement>("#symSeg button").forEach(
  (b) =>
    (b.onclick = () => {
      ui.symmetry = b.dataset.sym as any;
      refresh();
    }),
);
document.querySelectorAll<HTMLElement>("#sizeSeg button").forEach(
  (b) =>
    (b.onclick = () => {
      const n = +b.dataset.size!;
      if (n === studio.w && n === studio.h) return;
      studio.checkpoint("Resize");
      studio.resize(n, n);
      studio.emit("resize");
      view.fit();
      toast(`Canvas resized to <b>${n}×${n}</b>`);
    }),
);
$("#undo").onclick = () => studio.undo();
$("#redo").onclick = () => studio.redo();
$("#tGrid").onclick = () => {
  view.grid = !view.grid;
  refresh();
};
$("#tBloom").onclick = () => {
  view.bloom = !view.bloom;
  refresh();
};
$("#tCrt").onclick = () => {
  view.crt = !view.crt;
  refresh();
};
$("#fit").onclick = () => view.fit();
function download(name: string, url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
$("#exportBtn").onclick = (e) => {
  e.stopPropagation();
  $("#exportMenu").classList.toggle("on");
};
document.addEventListener("click", () => $("#exportMenu").classList.remove("on"));
document.querySelectorAll<HTMLElement>("#exportMenu button").forEach(
  (b) =>
    (b.onclick = () => {
      const sc = +b.dataset.scale!;
      download(
        `pixel-art-studio-${studio.w}x${studio.h}@${sc}x.png`,
        studio.toCanvas(sc).toDataURL("image/png"),
      );
      toast(`Exported <b>${studio.w * sc}×${studio.h * sc}</b> PNG`);
    }),
);
$<HTMLInputElement>("#importFile").onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const img = new Image();
  img.src = URL.createObjectURL(f);
  await img.decode();
  const c = document.createElement("canvas");
  c.width = studio.w;
  c.height = studio.h;
  const cx = c.getContext("2d")!;
  const sc = Math.min(studio.w / img.width, studio.h / img.height),
    w = img.width * sc,
    h = img.height * sc;
  cx.imageSmoothingQuality = "high";
  cx.drawImage(img, (studio.w - w) / 2, (studio.h - h) / 2, w, h);
  const d = cx.getImageData(0, 0, studio.w, studio.h).data,
    prev = studio.composite.slice();
  studio.checkpoint("Import");
  const L = studio.addLayer("Imported · " + f.name.slice(0, 14));
  for (let i = 0; i < studio.w * studio.h; i++) {
    if (d[i * 4 + 3] < 128) continue;
    const x = i % studio.w,
      y = (i / studio.w) | 0,
      j = (x % 4) + (y % 4) * 4,
      b = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][j] / 16 - 0.47;
    L.data[i] = studio.nearestPaletteU32(
      d[i * 4] + b * 36,
      d[i * 4 + 1] + b * 36,
      d[i * 4 + 2] + b * 36,
    );
  }
  studio.emit("import");
  view.materialize(
    [...L.data.keys()].filter((i) => L.data[i]).map((i) => ({ i, before: 0 })),
    prev,
    "random",
    1200,
  );
  toast(`Imported & pixelated to <b>${studio.paletteName}</b>`);
  (e.target as HTMLInputElement).value = "";
};

// ---------------- selection bar ----------------
document.querySelectorAll<HTMLElement>("#selbar button").forEach(
  (b) =>
    (b.onclick = () => {
      const a = b.dataset.sel,
        q = studio.selection;
      if (!q) return;
      if (a === "deselect") {
        studio.selection = null;
        view.awaitingAgent = false;
        studio.emit("selection");
        return;
      }
      if (a === "move") {
        setTool("move");
        return;
      }
      if (a === "agent") {
        view.awaitingAgent = true;
        const txt = `Replace the selected area (${q.w}×${q.h} at ${q.x},${q.y}) with `;
        navigator.clipboard?.writeText(txt).catch(() => {});
        toast(`<b>Selection shared with agents</b> · prompt copied: “${txt}…”`);
        refresh();
        return;
      }
      const prev = studio.composite.slice(),
        pts = studio.regionPts();
      studio.begin("Selection " + a);
      if (a === "clear") pts.forEach(([x, y]) => studio.set(x, y, 0));
      if (a === "fill") {
        const c = cssToU32(studio.primary)!;
        pts.forEach(([x, y]) => studio.set(x, y, c));
      }
      if (a === "gradient") {
        const cs = studio.gradientColors(
          pts,
          [cssToU32(studio.primary)!, cssToU32(studio.secondary)!],
          "vertical",
          ui.dither,
        );
        pts.forEach(([x, y], k) => studio.set(x, y, cs[k]));
      }
      const ch = studio.end("paint");
      view.materialize(ch, prev, "radial", 500);
      view.burst(pts, cssToU32(studio.primary)!);
    }),
);

// ---------------- pointer interaction ----------------
let drag: any = null,
  spaceDown = false;
const symPts = (x: number, y: number): [number, number][] => {
  const s = studio,
    out: [number, number][] = [[x, y]];
  if (ui.symmetry === "x" || ui.symmetry === "xy") out.push([s.w - 1 - x, y]);
  if (ui.symmetry === "y" || ui.symmetry === "xy") out.push([x, s.h - 1 - y]);
  if (ui.symmetry === "xy") out.push([s.w - 1 - x, s.h - 1 - y]);
  return out;
};
const brushPts = (x: number, y: number) => {
  const o: [number, number][] = [],
    b = ui.brush,
    off = Math.floor((b - 1) / 2);
  for (let dy = 0; dy < b; dy++)
    for (let dx = 0; dx < b; dx++) o.push([x + dx - off, y + dy - off]);
  return o;
};
const expand = (pts: [number, number][]) => pts.flatMap(([x, y]) => symPts(x, y));
function shapePts(t: ToolId, x0: number, y0: number, x1: number, y1: number, shift: boolean) {
  if (shift && (t === "rect" || t === "ellipse")) {
    const d = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    x1 = x0 + Math.sign(x1 - x0 || 1) * d;
    y1 = y0 + Math.sign(y1 - y0 || 1) * d;
  }
  if (t === "line") return studio.linePts(x0, y0, x1, y1).flatMap(([x, y]) => brushPts(x, y));
  if (t === "rect") return studio.rectPts(x0, y0, x1, y1, ui.filled);
  return studio.ellipsePts(x0, y0, x1, y1, ui.filled);
}
function effTool(e: PointerEvent | MouseEvent): ToolId {
  if (spaceDown || e.button === 1) return "hand";
  if (e.altKey && ["pencil", "eraser", "line", "rect", "ellipse", "fill"].includes(ui.tool))
    return "picker";
  return ui.tool;
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const t = effTool(e),
    [x, y] = view.toArt(e.clientX, e.clientY),
    useSec = e.button === 2;
  const colorHex = useSec ? studio.secondary : studio.primary,
    c = t === "eraser" ? 0 : cssToU32(colorHex)!;
  drag = {
    t,
    x0: x,
    y0: y,
    lx: x,
    ly: y,
    c,
    colorHex,
    sx: e.clientX,
    sy: e.clientY,
    px: view.panX,
    py: view.panY,
    moved: false,
  };
  if (t === "hand") {
    canvas.style.cursor = "grabbing";
    return;
  }
  if (t === "pencil" || t === "eraser") {
    studio.begin(t === "pencil" ? "Pencil" : "Eraser");
    expand(brushPts(x, y)).forEach(([a, b]) => studio.set(a, b, c, true));
    studio.emit("stroke");
  }
  if (t === "fill") {
    if (x < 0 || y < 0 || x >= studio.w || y >= studio.h) return;
    const prev = studio.composite.slice();
    studio.begin("Fill");
    const all = symPts(x, y).flatMap(([a, b]) => studio.floodPts(a, b, true));
    all.forEach(([a, b]) => studio.set(a, b, c, true));
    const ch = studio.end();
    view.materialize(ch, prev, "radial", Math.min(450, 80 + ch.length));
    view.burst(all, c || 0xffffffff);
    drag = null;
  }
  if (t === "picker") {
    if (x >= 0 && y >= 0 && x < studio.w && y < studio.h) {
      const v = studio.composite[y * studio.w + x];
      if (v) {
        if (useSec) studio.secondary = u32ToHex(v | 0xff000000);
        else studio.primary = u32ToHex(v | 0xff000000);
        studio.emit("colors");
      }
    }
    drag = null;
  }
  if (t === "lasso") view.lassoPath = [view.toArt(e.clientX, e.clientY, true) as [number, number]];
  if (t === "move") {
    if (!studio.selection) {
      toast("Make a selection first");
      drag = null;
      return;
    }
    studio.checkpoint("Move selection");
    const q = studio.selection;
    drag.base = studio.layer.data.slice();
    drag.mask = q.mask.slice();
    drag.q = { ...q };
  }
});
canvas.addEventListener("pointermove", (e) => {
  const [x, y] = view.toArt(e.clientX, e.clientY);
  view.hover = [x, y];
  $("#stPos").textContent =
    x >= 0 && y >= 0 && x < studio.w && y < studio.h ? `${x}, ${y}` : "–, –";
  if (!drag) {
    canvas.style.cursor = spaceDown ? "grab" : ui.tool === "move" ? "move" : "crosshair";
    return;
  }
  const d = drag;
  if (x !== d.lx || y !== d.ly) d.moved = true;
  if (d.t === "hand") {
    view.panX = Math.round(d.px + (e.clientX - d.sx) * view.dpr);
    view.panY = Math.round(d.py + (e.clientY - d.sy) * view.dpr);
    return;
  }
  if (d.t === "pencil" || d.t === "eraser") {
    if (x !== d.lx || y !== d.ly) {
      expand(studio.linePts(d.lx, d.ly, x, y).flatMap(([a, b]) => brushPts(a, b))).forEach(
        ([a, b]) => studio.set(a, b, d.c, true),
      );
      studio.emit("stroke");
    }
  }
  if (["line", "rect", "ellipse"].includes(d.t))
    view.preview = { pts: expand(shapePts(d.t, d.x0, d.y0, x, y, e.shiftKey)), color: d.colorHex };
  if (d.t === "gradient")
    view.preview = { pts: studio.linePts(d.x0, d.y0, x, y), color: "#ffffff" };
  if (d.t === "select") {
    studio.setRectSelection(
      Math.min(d.x0, x),
      Math.min(d.y0, y),
      Math.abs(x - d.x0) + 1,
      Math.abs(y - d.y0) + 1,
    );
    studio.emit("selection");
  }
  if (d.t === "lasso")
    view.lassoPath!.push(view.toArt(e.clientX, e.clientY, true) as [number, number]);
  if (d.t === "move") {
    const dx = x - d.x0,
      dy = y - d.y0,
      L = studio.layer,
      W = studio.w,
      H = studio.h,
      q = d.q;
    L.data.set(d.base);
    const nm = new Uint8Array(W * H);
    for (let yy = q.y; yy < q.y + q.h; yy++)
      for (let xx = q.x; xx < q.x + q.w; xx++) if (d.mask[yy * W + xx]) L.data[yy * W + xx] = 0;
    for (let yy = q.y; yy < q.y + q.h; yy++)
      for (let xx = q.x; xx < q.x + q.w; xx++) {
        const i = yy * W + xx;
        if (!d.mask[i]) continue;
        const X = xx + dx,
          Y = yy + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const v = d.base[i];
        if (v) L.data[Y * W + X] = v;
        nm[Y * W + X] = 1;
      }
    studio.selection = {
      ...q,
      x: q.x + dx,
      y: q.y + dy,
      mask: nm,
      polygon: q.polygon?.map(([a, b]: [number, number]) => [a + dx, b + dy] as [number, number]),
    };
    studio.emit("move");
  }
  d.lx = x;
  d.ly = y;
});
const endDrag = (e: PointerEvent) => {
  const d = drag;
  drag = null;
  if (!d) return;
  canvas.style.cursor = "crosshair";
  const [x, y] = view.toArt(e.clientX, e.clientY);
  if (d.t === "pencil" || d.t === "eraser") studio.end();
  if (["line", "rect", "ellipse"].includes(d.t)) {
    const prev = studio.composite.slice();
    view.preview = null;
    studio.begin(d.t[0].toUpperCase() + d.t.slice(1));
    expand(shapePts(d.t, d.x0, d.y0, x, y, e.shiftKey)).forEach(([a, b]) =>
      studio.set(a, b, d.c, true),
    );
    const ch = studio.end();
    view.materialize(ch, prev, "scan", Math.min(260, ch.length * 4));
  }
  if (d.t === "gradient") {
    view.preview = null;
    const prev = studio.composite.slice(),
      pts = studio.regionPts();
    const ang = (Math.atan2(y - d.y0, x - d.x0) * 180) / Math.PI;
    const cols = [
      cssToU32(d.colorHex === studio.primary ? studio.primary : studio.secondary)!,
      cssToU32(d.colorHex === studio.primary ? studio.secondary : studio.primary)!,
    ];
    const cs = studio.gradientColors(pts, cols, "angle", ui.dither, d.moved ? ang : 90);
    studio.begin("Gradient");
    pts.forEach(([a, b], k) => studio.set(a, b, cs[k]));
    const ch = studio.end();
    view.materialize(ch, prev, "scan", 600);
    view.burst(pts, cols[0]);
  }
  if (d.t === "select" && !d.moved) {
    studio.selection = null;
    view.awaitingAgent = false;
    studio.emit("selection");
  }
  if (d.t === "select" && d.moved) view.awaitingAgent = false;
  if (d.t === "lasso") {
    const p = view.lassoPath!;
    view.lassoPath = null;
    if (p.length > 3) studio.setPolySelection(p);
    else studio.selection = null;
    view.awaitingAgent = false;
    studio.emit("selection");
  }
  if (d.t === "move") {
    if (!d.moved) studio.undoStack.pop();
    studio.emit("move");
  }
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("pointerleave", () => {
  view.hover = null;
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    if (e.ctrlKey || !e.shiftKey)
      view.zoomAt(
        e.deltaY < 0 ? 1.18 : 1 / 1.18,
        (e.clientX - r.left) * view.dpr,
        (e.clientY - r.top) * view.dpr,
      );
    else {
      view.panX -= e.deltaY;
    }
    refresh();
  },
  { passive: false },
);

window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).matches("input, select, textarea")) return;
  const k = e.key.toLowerCase(),
    mod = e.ctrlKey || e.metaKey;
  if (mod && k === "z") {
    e.preventDefault();
    if (e.shiftKey) studio.redo();
    else studio.undo();
    return;
  }
  if (mod && k === "y") {
    e.preventDefault();
    studio.redo();
    return;
  }
  if (mod && k === "d") {
    e.preventDefault();
    studio.selection = null;
    studio.emit("selection");
    return;
  }
  if (mod && k === "a") {
    e.preventDefault();
    studio.setRectSelection(0, 0, studio.w, studio.h);
    studio.emit("selection");
    return;
  }
  if (mod) return;
  if (e.key === " ") {
    spaceDown = true;
    canvas.style.cursor = "grab";
    e.preventDefault();
    return;
  }
  if (e.key === "Escape") {
    studio.selection = null;
    view.awaitingAgent = false;
    studio.emit("selection");
    return;
  }
  if ((e.key === "Delete" || e.key === "Backspace") && studio.selection) {
    (document.querySelector('[data-sel="clear"]') as HTMLElement).click();
    return;
  }
  if (e.key === "#") {
    view.grid = !view.grid;
    refresh();
    return;
  }
  if (k === "x") return swapColors();
  if (k === "f") return view.fit();
  if (e.key === "+" || e.key === "=") {
    view.zoomAt(1.25);
    return refresh();
  }
  if (e.key === "-") {
    view.zoomAt(0.8);
    return refresh();
  }
  if (e.key === "[") {
    ui.brush = Math.max(1, ui.brush - 1);
    return refresh();
  }
  if (e.key === "]") {
    ui.brush = Math.min(4, ui.brush + 1);
    return refresh();
  }
  if (k === "u") {
    ui.filled = !ui.filled;
    return refresh();
  }
  const t = TOOLS.find((t) => t.key.toLowerCase() === k);
  if (t) setTool(t.id);
});
window.addEventListener("keyup", (e) => {
  if (e.key === " ") spaceDown = false;
});

// ---------------- activity feed ----------------
let feedN = 0;
const fmtArgs = (a: any) => {
  const parts = Object.entries(a || {}).map(([k, v]) => {
    let s = Array.isArray(v)
      ? typeof v[0] === "string" && k === "rows"
        ? `[${v.length} rows]`
        : `[${v.length}]`
      : typeof v === "object" && v
        ? "{…}"
        : JSON.stringify(v);
    if (s && s.length > 22) s = s.slice(0, 20) + "…";
    return `<span class="k">${esc(k)}</span>=<span class="v">${esc(s)}</span>`;
  });
  return parts.join(" ") || '<span class="v">{}</span>';
};
const swatchOf = (a: any) => {
  const c = a?.color ?? a?.colors?.[0];
  if (c === undefined) return "";
  try {
    const v = studio.color(c);
    return v ? `<i class="fsw" style="--c:${u32ToHex(v)}"></i>` : "";
  } catch {
    return "";
  }
};
const esc = (v: unknown) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const feed: FeedApi<{ el: HTMLElement; t0: number }> = {
  start(name, args) {
    $("#feedEmpty")?.remove();
    feedN++;
    $("#feedCount").textContent = `${feedN} call${feedN === 1 ? "" : "s"}`;
    const el = document.createElement("div");
    el.className = "fe run";
    el.innerHTML = `<div class="fe-h"><b>${esc(name)}</b>${swatchOf(args)}<span class="tm">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></div><div class="fe-a">${fmtArgs(args)}</div>`;
    const f = $("#feed");
    f.prepend(el);
    while (f.children.length > 60) f.lastChild!.remove();
    return { el, t0: performance.now() };
  },
  done(entry, summary, thumbs) {
    const { el, t0 } = entry;
    el.classList.remove("run");
    el.classList.add("ok");
    const r = document.createElement("div");
    r.className = "fe-r";
    r.innerHTML = `<span>${esc(summary)}</span><em>${Math.max(1, Math.round(performance.now() - t0))} ms</em>`;
    if (thumbs) {
      const box = document.createElement("div");
      box.className = "ba";
      const mk = (c: HTMLCanvasElement, l: string) => {
        const w = document.createElement("div");
        w.className = "bat";
        c.className = "bac";
        w.append(c);
        w.insertAdjacentHTML("beforeend", `<small>${l}</small>`);
        return w;
      };
      box.append(
        mk(thumbs.before, "before"),
        document.createRange().createContextualFragment('<span class="arr">→</span>'),
        mk(thumbs.after, "after"),
      );
      box.onmouseenter = () => {
        view.onion = {
          canvas: thumbs.before,
          x: thumbs.x,
          y: thumbs.y,
          start: 0,
          dur: 0,
          label: "before",
        };
      };
      box.onmouseleave = () => {
        view.onion = null;
      };
      box.title = "Hover to onion-skin the before state on the canvas";
      el.append(r, box);
    } else el.append(r);
  },
  fail(entry, msg) {
    const { el } = entry;
    el.classList.remove("run");
    el.classList.add("err");
    el.insertAdjacentHTML("beforeend", `<div class="fe-r"><span>${esc(msg)}</span></div>`);
  },
};

// ---------------- refresh UI ----------------
function refresh() {
  document
    .querySelectorAll<HTMLElement>(".tool")
    .forEach((b) => b.classList.toggle("on", b.dataset.tool === ui.tool));
  document
    .querySelectorAll<HTMLElement>("#sizeSeg button")
    .forEach((b) =>
      b.classList.toggle("on", +b.dataset.size! === studio.w && studio.w === studio.h),
    );
  document
    .querySelectorAll<HTMLElement>("#brushSeg button")
    .forEach((b) => b.classList.toggle("on", +b.dataset.brush! === ui.brush));
  document
    .querySelectorAll<HTMLElement>("#fillSeg button")
    .forEach((b) => b.classList.toggle("on", (b.dataset.filled === "1") === ui.filled));
  document
    .querySelectorAll<HTMLElement>("#ditherSeg button")
    .forEach((b) => b.classList.toggle("on", +b.dataset.dither! === ui.dither));
  document
    .querySelectorAll<HTMLElement>("#symSeg button")
    .forEach((b) => b.classList.toggle("on", b.dataset.sym === ui.symmetry));
  document
    .querySelectorAll<HTMLElement>(".opt")
    .forEach((o) => o.classList.toggle("on", o.dataset.for!.split(" ").includes(ui.tool)));
  $("#tGrid").classList.toggle("on", view.grid);
  $("#tBloom").classList.toggle("on", view.bloom);
  $("#tCrt").classList.toggle("on", view.crt);
  $("#crt").classList.toggle("on", view.crt);
  $<HTMLButtonElement>("#undo").disabled = !studio.undoStack.length;
  $<HTMLButtonElement>("#redo").disabled = !studio.redoStack.length;
  $("#sw1").style.background = studio.primary;
  $("#sw2").style.background = studio.secondary;
  if (document.activeElement !== hexIn) hexIn.value = studio.primary;
  if (/^#[0-9a-f]{6}$/.test(studio.primary)) picker.value = studio.primary;
  $("#stZoom").textContent = `${Math.round((view.zoom / view.dpr) * 100)}%`;
  $("#stSize").textContent = `${studio.w}×${studio.h}`;
  $("#stColor").innerHTML = `<i style="background:${studio.primary}"></i>${studio.primary}`;
  const q = studio.selection,
    sb = $("#selbar");
  sb.classList.toggle("on", !!q);
  if (q) {
    $("#selDim").textContent = `${q.w}×${q.h}`;
    $("#selPos").textContent = `${q.kind} · ${q.x},${q.y}`;
  }
  sb.classList.toggle("await", view.awaitingAgent);
  $("#blank").classList.toggle(
    "gone",
    studio.composite.some((c) => c !== 0),
  );
  $("#blankSize").textContent = `${studio.w} × ${studio.h}`;
}
let lastPal = "",
  layerT: any;
studio.on((why) => {
  const ps = studio.palette.join() + studio.primary + studio.secondary;
  if (ps !== lastPal) {
    lastPal = ps;
    renderPalette();
  }
  if (why === "stroke" || why === "opacity") {
    clearTimeout(layerT);
    layerT = setTimeout(renderLayers, 120);
  } else renderLayers();
  refresh();
});

// ---------------- WebMCP ----------------
const tools = buildTools({ studio, view, feed, refresh });
/** Debug handle: same tools, callable without a WebMCP-enabled browser. */
(window as any).pixelStudio = {
  studio,
  view,
  tools,
  call: (
    name: string,
    input: Record<string, unknown> = {},
    signal: AbortSignal = new AbortController().signal,
  ) => {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) throw new Error("No tool " + name);
    return tool.execute(input, { signal });
  },
};
registerTools(tools).then((reg) => {
  (window as any).pixelStudio.registration = { supported: reg.supported, count: reg.count };
  import.meta.hot?.dispose(() => reg.controller.abort());
  if (!reg.count)
    console.info(
      "[pixel-art-studio] WebMCP is not available in this browser, so agents cannot see the tools. They stay callable via window.pixelStudio.call(name, args).",
    );
});

studio.emit("init");
setTimeout(() => view.fit(), 50);
