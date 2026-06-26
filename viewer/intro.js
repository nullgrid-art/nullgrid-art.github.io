/**
 * The cinematic cold-open that plays on every load of the collection gallery.
 *
 * A single edition, chosen at random each visit, is rendered live through the
 * exact same pipeline as the viewer and gallery (scene.js), then swept across
 * its full ten-year life in a few seconds: the lattice pushes into frame and
 * simultaneously dissolves toward its decay limit while its inner light rises
 * toward its illumination limit. Letterbox curtains part, a title resolves,
 * then the whole thing fades to reveal the gallery underneath.
 *
 * It is deliberately self-contained and fail-safe: any error, or a
 * reduced-motion preference, removes the overlay and shows the gallery. A click,
 * Esc/Enter/Space, or the skip button ends it immediately.
 */
import { generateLattice } from "/engine/dist/src/index.js";
import { createLatticeScene, stateAtYears } from "/viewer/scene.js";

const TOTAL_TOKENS = 121;
const DURATION_MS = 4800;

const seedForToken = (id) => id * 100 + 1;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, s, e) => clamp01((p - s) / (e - s));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function playIntro({ tokens }) {
  // Resolves once the cold-open is fully gone and its WebGL context is freed,
  // so the caller can bake the gallery on a single context (some software-GL
  // fallbacks evict a second context, which would blank the intro).
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });

  const overlay = document.getElementById("intro");
  if (!overlay) return Promise.resolve();

  // Reduced-motion visitors: CSS already hides #intro, just drop it.
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    overlay.remove();
    return Promise.resolve();
  }

  const canvas = document.getElementById("introCanvas");
  const stage = document.getElementById("introStage");
  const barTop = document.getElementById("introBarTop");
  const barBottom = document.getElementById("introBarBottom");
  const title = document.getElementById("introTitle");
  const rule = document.getElementById("introRule");
  const skipBtn = document.getElementById("introSkip");

  // Pick the edition for this visit. A full ten-year sweep is dramatic for any
  // token, and a fresh one each load rewards refreshing.
  const id = 1 + Math.floor(Math.random() * TOTAL_TOKENS);
  const entry = tokens && tokens[String(id)];
  if (!entry) { overlay.remove(); return Promise.resolve(); }
  const illuminationLimit = entry.illuminationLimit;
  const decayLimit = entry.decayLimit;

  let scene = null;
  const computeSize = () => Math.min(1100, Math.ceil(Math.max(window.innerWidth, window.innerHeight)));
  try {
    scene = createLatticeScene({ canvas, size: computeSize() });
    scene.resize(computeSize());
    scene.setLattice(generateLattice(seedForToken(id)));
  } catch (_) {
    overlay.remove();
    return Promise.resolve();
  }

  const audio = makeIntroAudio();

  // ?intro=<0..1> freezes the cold-open at a given moment for inspection
  // (preview / QA). Absent in normal use, where it plays straight through.
  const freezeRaw = parseFloat(new URLSearchParams(location.search).get("intro"));
  const frozenP = Number.isFinite(freezeRaw) ? Math.min(0.999, Math.max(0, freezeRaw)) : null;

  let finished = false;
  let raf = 0;
  let startTime = performance.now();

  function onResize() {
    if (scene) scene.resize(computeSize());
  }
  window.addEventListener("resize", onResize);

  function teardown() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("keydown", onKey);
    if (audio) audio.stop();
    overlay.classList.add("intro-done");
    // Let the fade play, then free the WebGL context and remove the node.
    setTimeout(() => {
      try {
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        const lose = gl && gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      } catch (_) { /* best effort */ }
      if (overlay.parentNode) overlay.remove();
      resolveDone();
    }, 800);
  }

  function onKey(e) {
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") teardown();
  }
  skipBtn.addEventListener("click", (e) => { e.stopPropagation(); teardown(); });
  overlay.addEventListener("click", teardown);
  window.addEventListener("keydown", onKey);

  // Bespoke cinematic dolly-in (not the per-seed orbit): far + high to close +
  // near eye-level, with a touch of yaw drift and a narrowing lens.
  const camStart = { r: 20.5, y: 3.4, yaw: -0.38, fov: 52 };
  const camEnd = { r: 12.4, y: 0.7, yaw: 0.16, fov: 39 };

  function frame(now) {
    if (finished) return;
    const p = frozenP !== null ? frozenP : clamp01((now - startTime) / DURATION_MS);

    // Letterbox curtains: closed (50% each) -> cinemascope (10%) -> open (0).
    const openP = easeOutCubic(seg(p, 0.0, 0.16));
    const revealP = easeInOutCubic(seg(p, 0.86, 1.0));
    const barPct = lerp(lerp(50, 10, openP), 0, revealP);
    barTop.style.height = barPct + "%";
    barBottom.style.height = barPct + "%";

    // Camera dolly-in.
    const cp = easeInOutCubic(seg(p, 0.0, 0.84));
    const r = lerp(camStart.r, camEnd.r, cp);
    const yaw = lerp(camStart.yaw, camEnd.yaw, cp) + p * 0.06;
    const y = lerp(camStart.y, camEnd.y, cp);
    const fov = lerp(camStart.fov, camEnd.fov, cp);

    // Ten-year sweep: dissolve and illuminate together.
    const years = easeInOutCubic(seg(p, 0.05, 0.72)) * 10;
    const state = stateAtYears(years, illuminationLimit, decayLimit);

    try {
      scene.renderFrame({
        state,
        illuminationLimit,
        animTime: (now - startTime) / 1000,
        cam: {
          x: Math.sin(yaw) * r,
          y,
          z: Math.cos(yaw) * r,
          fov,
          lookAt: { x: 0, y: 0.1, z: 0 },
        },
      });
    } catch (_) { teardown(); return; }

    // Title resolve + hairline rule draw.
    const tP = easeOutCubic(seg(p, 0.5, 0.72));
    title.style.opacity = String(tP);
    title.style.transform = `translateY(${(1 - tP) * 14}px)`;
    rule.style.width = `${seg(p, 0.55, 0.8) * 240}px`;

    // Gentle pull-back on the reveal.
    stage.style.transform = `translate(-50%, -50%) scale(${lerp(1, 1.06, revealP)})`;

    if (audio) audio.update(p);

    if (frozenP === null && p >= 1) { teardown(); return; }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // Hard failsafe in case rAF stalls (backgrounded tab, etc.). Skipped while
  // frozen for inspection so the held frame stays put; in that case let the
  // caller proceed immediately rather than waiting on a teardown that won't come.
  if (frozenP === null) setTimeout(teardown, DURATION_MS + 2500);
  else resolveDone();

  return done;
}

/**
 * A soft, best-effort cinematic drone. Browsers block audio autoplay until a
 * user gesture, so on a fresh load this stays silent; it comes alive on the
 * first interaction. Kept low and unobtrusive by design.
 */
function makeIntroAudio() {
  let ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  } catch (_) { return null; }

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 500;
  filter.Q.value = 0.7;
  filter.connect(master);

  const oscA = ctx.createOscillator(); oscA.type = "sine"; oscA.frequency.value = 55;            // A1
  const oscB = ctx.createOscillator(); oscB.type = "sine"; oscB.frequency.value = 82.41;         // E2 (a fifth)
  oscB.detune.value = 5;
  const voice = ctx.createGain(); voice.gain.value = 0.5;
  oscA.connect(voice); oscB.connect(voice); voice.connect(filter);
  try { oscA.start(); oscB.start(); } catch (_) { /* ignore */ }

  const resume = () => { if (ctx.resume) ctx.resume().catch(() => {}); };
  resume();
  window.addEventListener("pointerdown", resume, { once: true });

  let stopped = false;
  return {
    update(p) {
      if (stopped) return;
      const swell = Math.min(1, p / 0.5);
      const fade = p > 0.86 ? Math.max(0, 1 - (p - 0.86) / 0.14) : 1;
      const target = Math.max(0.0001, 0.15 * swell * fade);
      master.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      filter.frequency.setTargetAtTime(380 + p * 1500, ctx.currentTime, 0.1);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.18);
        setTimeout(() => {
          try { oscA.stop(); oscB.stop(); ctx.close(); } catch (_) { /* ignore */ }
        }, 600);
      } catch (_) { /* ignore */ }
    },
  };
}
