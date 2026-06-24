import {
  decayTierFor,
  generateLattice,
  horizonYearsFor,
  illuminationTierFor
} from "/engine/dist/src/index.js";
import { createLatticeScene, stateAtYears, cameraProfileForSeed } from "/viewer/scene.js";

const canvas = document.getElementById("canvas");

const TOTAL_TOKENS = 121;
const TIMELINE_YEARS = 10;
const TIMELINE_STEPS = 1000;       // slider steps; 1000 -> 0.01-year resolution
const PLAYBACK_SECONDS = 10;       // 10s wallclock = 10 years

let tokenLimits = null;            // loaded from /metadata/token-limits.json
let currentTokenId = 1;
let currentEntry = null;           // tokenLimits.tokens[id]
let lifetimeYears = 0;
let isPlaying = false;
let lastTickMs = 0;

let currentLattice = null;
let currentState = null;
let currentIlluminationLimit = 85;
let currentDecayLimit = 60;
let currentCameraProfile = null;
let lastTimeMs = 0;
let elapsedSec = 0;

// The whole render pipeline lives in scene.js, shared with the gallery so the
// two views can never drift visually.
const scene = createLatticeScene({ canvas, size: 860 });

// --- Per-token QA controls --------------------------------------------------

function seedForToken(tokenId) {
  return tokenId * 100 + 1;
}

const titleCase = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function specRow(key, value, sub) {
  const subHtml = sub ? `<small>${sub}</small>` : "";
  return `<div class="spec"><div class="k">${key}</div><div class="v">${value}${subHtml}</div></div>`;
}

function paintSpecs() {
  if (!currentEntry) return;
  const e = currentEntry;
  const iHorizon = horizonYearsFor(e.illuminationLimit);
  const dHorizon = horizonYearsFor(e.decayLimit);
  const html = [
    specRow("Illumination Tier", titleCase(e.illuminationTier)),
    specRow("Illumination Limit", e.illuminationLimit, `peak brightness at year ${iHorizon.toFixed(1)}`),
    specRow("Decay Tier", titleCase(e.decayTier)),
    specRow("Decay Limit", e.decayLimit, `peak dissolution at year ${dHorizon.toFixed(1)}`),
    specRow("Seed", seedForToken(currentTokenId), "drives topology + palette"),
    specRow("Palette", currentLattice?.lightProfile?.paletteName ?? "-"),
    specRow("Light fragments", currentLattice?.lightProfile?.fragmentCount ?? "-")
  ].join("");
  document.getElementById("specs").innerHTML = html;
  document.getElementById("reservedBadge").classList.toggle("hidden", !e.reserved);
}

function paintReadout() {
  if (!currentEntry || !currentState) return;
  const e = currentEntry;
  const brightness = Math.round(currentState.currentIllumination * 100);
  const decay = Math.round(currentState.currentDecay * 100);
  const phase = currentState.phase;
  const stillness = currentState.isStill ? "still" : "active";

  const left = `Year ${lifetimeYears.toFixed(2)}  ·  ${phase}  ·  ${stillness}`;
  const right = `B ${brightness}/${e.illuminationLimit}   D ${decay}/${e.decayLimit}`;
  document.getElementById("readoutLeft").textContent = left;
  document.getElementById("readoutRight").textContent = right;
}

function paintTicks() {
  const ticks = document.getElementById("ticks");
  const labels = [];
  for (let y = 0; y <= TIMELINE_YEARS; y += 2) {
    const pct = (y / TIMELINE_YEARS) * 100;
    labels.push(`<span class="tick" style="left:${pct}%">${y}y</span>`);
  }
  ticks.innerHTML = labels.join("");
}

async function loadTokenLimits() {
  const res = await fetch("/metadata/token-limits.json");
  if (!res.ok) throw new Error("failed to load token-limits.json");
  const j = await res.json();
  return j.tokens;
}

function refreshLatticeForToken() {
  const seed = seedForToken(currentTokenId);
  currentLattice = generateLattice(seed);
  currentCameraProfile = cameraProfileForSeed(seed);
  scene.setLattice(currentLattice);
}

function applyState() {
  if (!currentEntry || !currentLattice) return;
  currentIlluminationLimit = currentEntry.illuminationLimit;
  currentDecayLimit = currentEntry.decayLimit;
  currentState = stateAtYears(lifetimeYears, currentIlluminationLimit, currentDecayLimit);
  paintReadout();
}

function setToken(id) {
  if (!Number.isFinite(id) || id < 1 || id > TOTAL_TOKENS) return;
  currentTokenId = id;
  currentEntry = tokenLimits[String(id)];
  document.getElementById("tokenId").value = String(id);
  document.getElementById("prevBtn").disabled = id <= 1;
  document.getElementById("nextBtn").disabled = id >= TOTAL_TOKENS;
  refreshLatticeForToken();
  paintSpecs();
  applyState();
}

function setLifetimeFromSlider(sliderValue) {
  lifetimeYears = (Number(sliderValue) / TIMELINE_STEPS) * TIMELINE_YEARS;
  applyState();
}

function setLifetime(years) {
  lifetimeYears = Math.min(TIMELINE_YEARS, Math.max(0, years));
  document.getElementById("timeline").value = String(
    Math.round((lifetimeYears / TIMELINE_YEARS) * TIMELINE_STEPS)
  );
  applyState();
}

function setPlaying(on) {
  isPlaying = on;
  document.getElementById("playBtn").textContent = on ? "❚❚" : "▶";
  if (on) lastTickMs = performance.now();
}

function tickPlayback(nowMs) {
  if (!isPlaying) return;
  const deltaSec = (nowMs - lastTickMs) / 1000;
  lastTickMs = nowMs;
  const yearsPerSec = TIMELINE_YEARS / PLAYBACK_SECONDS;
  setLifetime(lifetimeYears + deltaSec * yearsPerSec);
  if (lifetimeYears >= TIMELINE_YEARS) setPlaying(false);
}

// --- Render loop ------------------------------------------------------------

function resize() {
  const size = Math.min(canvas.clientWidth, canvas.clientHeight);
  if (size > 0) scene.resize(size);
}

function animate(timeMs) {
  requestAnimationFrame(animate);
  tickPlayback(timeMs);
  if (!currentLattice || !currentState || !currentCameraProfile) {
    lastTimeMs = timeMs;
    return;
  }
  const deltaSec = Math.min(0.1, (timeMs - lastTimeMs) / 1000);
  lastTimeMs = timeMs;
  elapsedSec += deltaSec;

  const cp = currentCameraProfile;
  const ct = timeMs * cp.orbitSpeed * cp.orbitDirection + cp.yawPhase;
  scene.renderFrame({
    state: currentState,
    illuminationLimit: currentIlluminationLimit,
    animTime: elapsedSec,
    cam: {
      x: Math.sin(ct) * cp.radius,
      y: Math.sin(ct * 0.5) * cp.heightAmplitude,
      z: Math.cos(ct) * cp.radius,
      fov: cp.fov,
      lookAt: { x: 0, y: 0, z: 0 },
    },
  });
}

// --- Wire DOM ---------------------------------------------------------------

document.getElementById("tokenId").addEventListener("change", (e) => {
  setToken(Number(e.target.value));
});
document.getElementById("prevBtn").addEventListener("click", () => setToken(currentTokenId - 1));
document.getElementById("nextBtn").addEventListener("click", () => setToken(currentTokenId + 1));
document.getElementById("timeline").addEventListener("input", (e) => {
  if (isPlaying) setPlaying(false);
  setLifetimeFromSlider(e.target.value);
});
document.getElementById("playBtn").addEventListener("click", () => {
  if (lifetimeYears >= TIMELINE_YEARS) setLifetime(0);
  setPlaying(!isPlaying);
});
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === " ") {
    e.preventDefault();
    if (lifetimeYears >= TIMELINE_YEARS) setLifetime(0);
    setPlaying(!isPlaying);
  } else if (e.key === "ArrowLeft" && currentTokenId > 1) setToken(currentTokenId - 1);
  else if (e.key === "ArrowRight" && currentTokenId < TOTAL_TOKENS) setToken(currentTokenId + 1);
});
window.addEventListener("resize", resize);

paintTicks();

(async function boot() {
  tokenLimits = await loadTokenLimits();
  resize();
  // Deep link: /?token=N (used by the gallery to open a specific edition).
  const requested = Number(new URLSearchParams(location.search).get("token"));
  const startToken = Number.isFinite(requested) && requested >= 1 && requested <= TOTAL_TOKENS
    ? requested
    : 1;
  setToken(startToken);
  requestAnimationFrame(animate);
})();
