import { generateLattice } from "/engine/dist/src/index.js";
import { createLatticeScene, stateAtYears } from "/viewer/scene.js";

const TOTAL_TOKENS = 121;
const RENDER_PX = 300;       // bake resolution per thumbnail
const ANIM_TIME = 12.0;      // fixed light-fragment animation time (deterministic)

// Lifetime stops: fraction of the 10-year maximum horizon. A token whose limit
// is 0.73 of the max (illumination 73 -> peak at year 7.3) caps at stops 0.75
// and 1.0 and simply holds at its peak, same for the decay axis.
const STOPS = [
  { frac: 0.0, label: "0%", year: "year 0.0" },
  { frac: 0.25, label: "25%", year: "year 2.5" },
  { frac: 0.5, label: "50%", year: "year 5.0" },
  { frac: 0.75, label: "75%", year: "year 7.5" },
  { frac: 1.0, label: "100%", year: "year 10" },
];
let stopIndex = 2; // default to 50%

// Fixed, consistent camera for every thumbnail so comparison isolates content.
const CAM_RADIUS = 14.5;
const CAM_ANGLE = 0.7;
const CAM = {
  x: Math.sin(CAM_ANGLE) * CAM_RADIUS,
  y: 2.2,
  z: Math.cos(CAM_ANGLE) * CAM_RADIUS,
  fov: 44,
  lookAt: { x: 0, y: 0, z: 0 },
};

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

// 1x1 transparent pixel, un-baked cells show this (a clean dark square via the
// img background) instead of a broken-image icon + alt text.
const BLANK_PX =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const els = {
  stops: document.getElementById("stops"),
  grid: document.getElementById("grid"),
  status: document.getElementById("status"),
  legend: document.getElementById("legend"),
  bakeCanvas: document.getElementById("bakeCanvas"),
};

let tokens = null;          // token-limits.json tokens map
let scene = null;
let latticeCache = new Map();   // id -> lattice (deterministic, reusable)
const imgCache = new Map();     // `${id}:${stopIndex}` -> dataURL
let bakeGeneration = 0;         // cancels an in-flight bake when the stop changes
const cellImg = {};             // id -> <img> element

function latticeFor(id) {
  if (!latticeCache.has(id)) latticeCache.set(id, generateLattice(seedForToken(id)));
  return latticeCache.get(id);
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

    const img = document.createElement("img");
    img.alt = "";
    img.src = BLANK_PX;
    cellImg[id] = img;

    const cap = document.createElement("figcaption");
    cap.innerHTML =
      `<span class="id">#${pad(id)}${e.reserved ? ' <span class="star">★</span>' : ""}</span>` +
      `<span class="tiers">L${e.illuminationLimit} · D${e.decayLimit}</span>`;

    cell.append(badges, img, cap);
    cell.addEventListener("click", () => {
      window.open(`/viewer/?token=${id}`, "_blank", "noopener");
    });
    frag.appendChild(cell);
  }
  els.grid.appendChild(frag);
}

// --- Baking -----------------------------------------------------------------

function bakeOne(id, frac) {
  const e = tokens[String(id)];
  const years = frac * 10;
  const state = stateAtYears(years, e.illuminationLimit, e.decayLimit);
  scene.setLattice(latticeFor(id));
  scene.renderFrame({
    state,
    illuminationLimit: e.illuminationLimit,
    animTime: ANIM_TIME,
    cam: CAM,
  });
  // JPEG: the scene renders on opaque black so no alpha is needed; JPEG encodes
  // several times faster than PNG and keeps the 605-thumbnail cache compact.
  return scene.snapshot("image/jpeg", 0.86);
}

async function bakeStop(idx) {
  const gen = ++bakeGeneration;
  const frac = STOPS[idx].frac;
  let done = 0;

  for (let id = 1; id <= TOTAL_TOKENS; id++) {
    if (gen !== bakeGeneration) return; // a newer stop selection superseded us

    const key = `${id}:${idx}`;
    let dataUrl = imgCache.get(key);
    if (!dataUrl) {
      dataUrl = bakeOne(id, frac);
      imgCache.set(key, dataUrl);
    }
    // dataUrl is JPEG (see bakeOne), fast to encode, small to cache.
    cellImg[id].src = dataUrl;
    done++;

    if (done % 6 === 0) {
      els.status.textContent = `baking ${done}/${TOTAL_TOKENS}…`;
      // Yield so the browser paints the freshly-baked thumbnails.
      await new Promise((r) => requestAnimationFrame(r));
    }
  }
  if (gen === bakeGeneration) {
    els.status.textContent = `${STOPS[idx].label} · ${STOPS[idx].year}`;
  }
}

function selectStop(idx) {
  if (idx === stopIndex && els.status.textContent !== "-") {
    // already showing; ignore re-click
  }
  stopIndex = idx;
  [...els.stops.children].forEach((b, i) => b.classList.toggle("active", i === idx));
  bakeStop(idx);
}

// --- Boot -------------------------------------------------------------------

(async function boot() {
  els.status.textContent = "loading…";
  const res = await fetch("/metadata/token-limits.json");
  if (!res.ok) {
    els.status.textContent = "failed to load token-limits.json";
    return;
  }
  tokens = (await res.json()).tokens;

  scene = createLatticeScene({
    canvas: els.bakeCanvas,
    size: RENDER_PX,
    preserveDrawingBuffer: true,
  });
  scene.resize(RENDER_PX);

  buildStops();
  buildLegend();
  buildGrid();

  await bakeStop(stopIndex);
})();
