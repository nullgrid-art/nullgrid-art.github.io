import { generateLattice } from "/engine/dist/src/index.js";
import { createLatticeScene, stateAtYears, cameraProfileForSeed } from "/viewer/scene.js";
import { RENDER_CONFIG } from "/render/config.js";

const canvas = document.getElementById("canvas");
const note = document.getElementById("note");

const seedForToken = (id) => id * 100 + 1;

function params() {
  // Read from the query string and the hash fragment, so the animation_url
  // works across IPFS gateways regardless of how they pass params:
  //   token.html?tokenId=42   or   token.html#tokenId=42
  const q = new URLSearchParams(location.search);
  const h = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  const get = (k) => q.get(k) ?? h.get(k);
  const tokenId = Number(get("tokenId") || get("id") || 1);
  const yearStr = get("year");
  const yearOverride = yearStr != null ? Number(yearStr) : null;
  const addrOverride = get("address");
  const rpcOverride = get("rpc"); // test/dev: point chain mode at e.g. a local anvil
  // Asset production: ?cam=<seed> frames this token through another seed's
  // deterministic camera profile (angle/radius/fov), e.g. to bake a set of
  // pieces from one consistent viewpoint.
  const camStr = get("cam");
  const camSeed = camStr != null ? Number(camStr) : null;
  return { tokenId, yearOverride, addrOverride, rpcOverride, camSeed };
}

// --- Identity resolution ----------------------------------------------------
//
// Chain mode uses a minimal hand-rolled JSON-RPC client instead of a library,
// so the pinned bundle has zero external dependencies: the artwork's claim to
// permanence shouldn't rest on a CDN staying alive. getIdentity returns five
// static words, so encoding/decoding is trivial.

// bytes4(keccak256("getIdentity(uint256)"))
const GET_IDENTITY_SELECTOR = "0x85e3f058";

async function rpc(url, method, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    const json = await res.json();
    if (json.error || json.result == null) throw new Error(json.error?.message || "empty result");
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

/** Slice word `i` (32 bytes) out of an abi-encoded hex result as a BigInt. */
function word(hex, i) {
  const body = hex.replace(/^0x/, "");
  const w = body.slice(i * 64, (i + 1) * 64);
  if (w.length !== 64) throw new Error("short return data");
  return BigInt("0x" + w);
}

/**
 * Chain mode: read the token's identity and the current block over a public
 * RPC, so the piece renders at its true elapsed age. Returns null on failure
 * so the caller can fall back to preview mode.
 */
async function resolveFromChain(tokenId, contractAddress, rpcOverride) {
  // getIdentity(uint256): selector + the token id left-padded to 32 bytes.
  const calldata =
    GET_IDENTITY_SELECTOR + BigInt(tokenId).toString(16).padStart(64, "0");

  const urls = rpcOverride
    ? [rpcOverride, ...RENDER_CONFIG.rpcUrls]
    : RENDER_CONFIG.rpcUrls;

  for (const url of urls) {
    try {
      const [ret, blockHex] = await Promise.all([
        rpc(url, "eth_call", [{ to: contractAddress, data: calldata }, "latest"]),
        rpc(url, "eth_blockNumber", []),
      ]);
      // Return layout: (uint64 birthBlock, uint8 illuminationLimit,
      // uint8 decayLimit, uint96 seed, uint8 generation), five static words.
      const birthBlock = Number(word(ret, 0));
      const illuminationLimit = Number(word(ret, 1));
      const decayLimit = Number(word(ret, 2));
      const seed = Number(word(ret, 3));
      const currentBlock = Number(BigInt(blockHex));
      // An unconfigured/unminted token can't reach here (getIdentity reverts),
      // but guard against nonsense anyway.
      if (illuminationLimit < 1 || decayLimit < 1 || seed < 1) throw new Error("bad identity");
      const elapsedBlocks = Math.max(0, currentBlock - birthBlock);
      const years = elapsedBlocks / RENDER_CONFIG.blocksPerYear;
      return { seed, illuminationLimit, decayLimit, years, source: "chain" };
    } catch {
      // try next RPC
    }
  }
  return null;
}

/** Preview mode: token params from the static config, age from previewYear. */
async function resolveFromConfig(tokenId, yearOverride) {
  const res = await fetch(RENDER_CONFIG.tokenConfigUrl);
  if (!res.ok) throw new Error("token config unavailable");
  const json = await res.json();
  const e = json.tokens[String(tokenId)];
  if (!e) throw new Error(`token ${tokenId} not found`);
  return {
    seed: seedForToken(tokenId),
    illuminationLimit: e.illuminationLimit,
    decayLimit: e.decayLimit,
    years: yearOverride != null ? yearOverride : RENDER_CONFIG.previewYear,
    source: "preview",
  };
}

async function resolveIdentity() {
  const { tokenId, yearOverride, addrOverride, rpcOverride } = params();
  const contractAddress = addrOverride || RENDER_CONFIG.contractAddress;
  if (contractAddress) {
    const chain = await resolveFromChain(tokenId, contractAddress, rpcOverride);
    if (chain) return { tokenId, ...chain };
  }
  const cfg = await resolveFromConfig(tokenId, yearOverride);
  return { tokenId, ...cfg };
}

// --- Render -----------------------------------------------------------------

let scene = null;
let cameraProfile = null;
let renderState = null;
let illuminationLimit = 85;
let elapsedSec = 0;
let lastMs = 0;

function resize() {
  const px = Math.min(window.innerWidth, window.innerHeight);
  canvas.style.width = px + "px";
  canvas.style.height = px + "px";
  if (scene) scene.resize(px);
}

function animate(ms) {
  requestAnimationFrame(animate);
  if (!scene || !renderState || !cameraProfile) {
    lastMs = ms;
    return;
  }
  const dt = Math.min(0.1, (ms - lastMs) / 1000);
  lastMs = ms;
  elapsedSec += dt;

  const cp = cameraProfile;
  const ct = ms * cp.orbitSpeed * cp.orbitDirection + cp.yawPhase;
  scene.renderFrame({
    state: renderState,
    illuminationLimit,
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

(async function boot() {
  try {
    const idn = await resolveIdentity();
    const lattice = generateLattice(idn.seed);
    illuminationLimit = idn.illuminationLimit;
    renderState = stateAtYears(idn.years, idn.illuminationLimit, idn.decayLimit);
    const { camSeed } = params();
    cameraProfile = cameraProfileForSeed(camSeed != null && Number.isFinite(camSeed) ? camSeed : idn.seed);

    scene = createLatticeScene({ canvas, size: Math.min(window.innerWidth, window.innerHeight) });
    scene.setLattice(lattice);
    resize();

    note.classList.add("hidden");
    window.addEventListener("resize", resize);
    requestAnimationFrame(animate);

    // Expose a tiny status for tooling/automation (e.g. preview baker).
    window.__entropyReady = true;
    window.__entropyInfo = idn;
  } catch (err) {
    console.error("renderer boot failed", err);
    note.textContent = "unavailable";
    note.classList.remove("hidden");
    window.__entropyError = String(err);
  }
})();
