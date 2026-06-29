import { generateLattice } from "/engine/dist/src/index.js";
import { createLatticeScene, stateAtYears, cameraProfileForSeed } from "/viewer/scene.js";
import { playIntro } from "/viewer/intro.js";

const TOTAL_TOKENS = 121;
const RENDER_PX = 300;          // shared offscreen render size; cells blit from this
const FRAME_BUDGET_MS = 11;     // per-frame render budget; visible cells round-robin within it
const ROTATION_SPEED = 1.6;     // multiplier on the per-seed orbit speed, a touch more life
const STATIC_TIME = 7200;       // fixed clock for reduced-motion (a flattering still angle)

// Lifetime stops: fraction of the 10-year maximum horizon. The lattices rotate
// live AT the selected stop, so you can watch the whole collection turn at
// year 0, year 5, year 10, etc.
const STOPS = [
  { frac: 0.0, label: "0%", year: "year 0.0" },
  { frac: 0.25, label: "25%", year: "year 2.5" },
  { frac: 0.5, label: "50%", year: "year 5.0" },
  { frac: 0.75, label: "75%", year: "year 7.5" },
  { frac: 1.0, label: "100%", year: "year 10" },
];
let stopIndex = 2; // default to 50%
let currentFrac = STOPS[stopIndex].frac;

const ILLUM_TIER_COLOUR = {
  resilient: "#6aa1ff",
  balanced: "#6dd0a0",
  fragile: "#e6a85a",
  transcendent: "#fff4d6",
};
const DECAY_TIER_COLOUR = {
  intact: "#6dd0a0",
  weathered: "#c7b38b",
  skeletal: "#e6a85a",
  dissolved: "#ff6e6e",
};

const seedForToken = (id) => id * 100 + 1;
const pad = (id) => String(id).padStart(3, "0");
const titleCase = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const els = {
  stops: document.getElementById("stops"),
  grid: document.getElementById("grid"),
  status: document.getElementById("status"),
  legend: document.getElementById("legend"),
  bakeCanvas: document.getElementById("bakeCanvas"),
};

let tokens = null;
let scene = null;
const latticeCache = new Map();   // id -> lattice (deterministic, reusable)
const camCache = new Map();       // id -> per-seed camera profile
const stateCache = new Map();     // id -> engine state at the current stop
const cellCtx = {};               // id -> 2d context of the cell's canvas

let reducedMotion = false;
const visible = new Set();         // ids currently in (or near) the viewport
let order = [];                    // round-robin order over visible ids
let orderDirty = false;
let cursor = 0;
let running = false;
const renderedStatic = new Set();  // reduced-motion: cells already drawn once

function latticeFor(id) {
  if (!latticeCache.has(id)) latticeCache.set(id, generateLattice(seedForToken(id)));
  return latticeCache.get(id);
}
function camFor(id) {
  if (!camCache.has(id)) camCache.set(id, cameraProfileForSeed(seedForToken(id)));
  return camCache.get(id);
}
function stateFor(id) {
  if (!stateCache.has(id)) {
    const e = tokens[String(id)];
    stateCache.set(id, stateAtYears(currentFrac * 10, e.illuminationLimit, e.decayLimit));
  }
  return stateCache.get(id);
}

// --- Build UI ---------------------------------------------------------------

function buildStops() {
  STOPS.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "stop" + (i === stopIndex ? " active" : "");
    b.innerHTML = `${s.label}<small>${s.year}</small>`;
    b.addEventListener("click", () => selectStop(i));
    els.stops.appendChild(b);
  });
}

function buildLegend() {
  const ill = Object.entries(ILLUM_TIER_COLOUR)
    .map(([k, c]) => `<span><span class="tdot" style="background:${c}"></span>${titleCase(k)}</span>`)
    .join("");
  const dec = Object.entries(DECAY_TIER_COLOUR)
    .map(([k, c]) => `<span><span class="tdot" style="background:${c}"></span>${titleCase(k)}</span>`)
    .join("");
  els.legend.innerHTML =
    `<span style="color:var(--text)">Illumination:</span> ${ill}` +
    `<span style="margin-left:8px;color:var(--text)">Decay:</span> ${dec}` +
    `<span style="margin-left:8px">★ reserved</span>`;
}

function buildGrid() {
  const frag = document.createDocumentFragment();
  for (let id = 1; id <= TOTAL_TOKENS; id++) {
    const e = tokens[String(id)];
    const cell = document.createElement("figure");
    cell.className = "cell" + (e.reserved ? " reserved" : "");
    cell.dataset.id = String(id);
    cell.title =
      `#${pad(id)}  ·  ${titleCase(e.illuminationTier)} (L${e.illuminationLimit})  ·  ` +
      `${titleCase(e.decayTier)} (D${e.decayLimit})  ·  seed ${seedForToken(id)}`;

    const badges = document.createElement("div");
    badges.className = "badge-row";
    badges.innerHTML =
      `<span class="tdot" style="background:${ILLUM_TIER_COLOUR[e.illuminationTier]}"></span>` +
      `<span class="tdot" style="background:${DECAY_TIER_COLOUR[e.decayTier]}"></span>`;

    // Each cell is its own live canvas; the shared renderer blits into it.
    const cv = document.createElement("canvas");
    cv.width = RENDER_PX;
    cv.height = RENDER_PX;
    cellCtx[id] = cv.getContext("2d");

    const cap = document.createElement("figcaption");
    cap.innerHTML =
      `<span class="id">#${pad(id)}${e.reserved ? ' <span class="star">★</span>' : ""}</span>` +
      `<span class="tiers">L${e.illuminationLimit} · D${e.decayLimit}</span>`;

    cell.append(badges, cv, cap);
    cell.addEventListener("click", () => {
      window.open(`/viewer/?token=${id}`, "_blank", "noopener");
    });
    frag.appendChild(cell);
  }
  els.grid.appendChild(frag);
}

// --- Live rendering ---------------------------------------------------------

function renderCell(id, now) {
  const e = tokens[String(id)];
  const cp = camFor(id);
  const ct = now * cp.orbitSpeed * ROTATION_SPEED * cp.orbitDirection + cp.yawPhase;
  scene.setLattice(latticeFor(id));
  scene.renderFrame({
    state: stateFor(id),
    illuminationLimit: e.illuminationLimit,
    animTime: now / 1000,
    cam: {
      x: Math.sin(ct) * cp.radius,
      y: Math.sin(ct * 0.5) * cp.heightAmplitude,
      z: Math.cos(ct) * cp.radius,
      fov: cp.fov,
      lookAt: { x: 0, y: 0, z: 0 },
    },
  });
  cellCtx[id].drawImage(scene.canvas, 0, 0, RENDER_PX, RENDER_PX);
}

let raf = 0;
function frame(now) {
  if (!running) return;
  if (document.hidden) { raf = requestAnimationFrame(frame); return; }
  if (orderDirty) { order = [...visible]; orderDirty = false; if (cursor >= order.length) cursor = 0; }

  if (order.length) {
    const start = performance.now();
    let done = 0;
    // Round-robin the visible cells within a per-frame time budget. With slow
    // orbits, even a few updates per second per cell read as smooth rotation.
    while (done < order.length && performance.now() - start < FRAME_BUDGET_MS) {
      renderCell(order[cursor % order.length], now);
      cursor++;
      done++;
    }
  }
  raf = requestAnimationFrame(frame);
}

// --- Stops ------------------------------------------------------------------

function selectStop(idx) {
  stopIndex = idx;
  currentFrac = STOPS[idx].frac;
  stateCache.clear();
  [...els.stops.children].forEach((b, i) => b.classList.toggle("active", i === idx));
  els.status.textContent = `${STOPS[idx].label} · ${STOPS[idx].year}`;
  if (reducedMotion) {
    // Re-draw the cells that are on screen at the new lifetime stop.
    renderedStatic.clear();
    for (const id of visible) { renderCell(id, STATIC_TIME); renderedStatic.add(id); }
  }
}

// --- Viewport tracking ------------------------------------------------------

function observeCells() {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const id = Number(en.target.dataset.id);
      if (en.isIntersecting) {
        visible.add(id);
        orderDirty = true;
        if (reducedMotion && !renderedStatic.has(id)) {
          renderCell(id, STATIC_TIME);
          renderedStatic.add(id);
        }
      } else {
        visible.delete(id);
        orderDirty = true;
      }
    }
  }, { root: null, rootMargin: "150px 0px", threshold: 0.01 });
  for (const cell of els.grid.children) io.observe(cell);
}

// --- Boot -------------------------------------------------------------------

(async function boot() {
  reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  els.status.textContent = "loading…";
  const res = await fetch("/metadata/token-limits.json");
  if (!res.ok) {
    els.status.textContent = "failed to load token-limits.json";
    return;
  }
  tokens = (await res.json()).tokens;

  // Gallery skeleton (DOM only) so it is ready underneath the cold-open.
  buildStops();
  buildLegend();
  buildGrid();

  // Cinematic cold-open first, on a single WebGL context. Wait for it to finish
  // and free its context before creating the gallery renderer.
  await playIntro({ tokens });

  scene = createLatticeScene({
    canvas: els.bakeCanvas,
    size: RENDER_PX,
    preserveDrawingBuffer: true, // required: cells blit from this canvas
  });
  scene.resize(RENDER_PX);

  els.status.textContent = `${STOPS[stopIndex].label} · ${STOPS[stopIndex].year}`;
  observeCells();

  if (reducedMotion) {
    // Static gallery: each cell draws once when it scrolls into view.
    return;
  }
  running = true;
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && running) { /* loop resumes on next rAF */ }
  });
  raf = requestAnimationFrame(frame);
})();
