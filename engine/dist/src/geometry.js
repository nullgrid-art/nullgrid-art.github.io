import { pickCuratedPalette } from "./palettes.js";
/**
 * Geometry generator for Entropy Protocol lattices.
 *
 * Each token shares the same base envelope (4 cells wide, 6 tall, 4 deep,
 * giving a 5 x 7 x 5 = 175-node grid). Per-token variation comes from a
 * deterministic warp applied to each node's position. The warp roughly
 * mirrors left-to-right (bilateral symmetry) with small intentional
 * imperfections so no two halves match exactly.
 *
 * Each node also carries a `decayVector`: the direction it drifts as the
 * lattice ages. The renderer applies `node + decayVector * decayFactor`
 * each frame to deform the lattice over time.
 *
 * Each beam carries a `beamFadeThreshold`: a decay value above which the
 * beam disappears. Most beams have a threshold above 1 (they never fade),
 * but a deterministic subset fade between decay 0.55 and 0.95. Like Jenga
 * pieces being removed: structure stays standing but gradually thins.
 *
 * Each lattice also carries a `lightProfile`: how many light traces it
 * carries, which colours, how fast they move, and how their intensity
 * grows with age. This is the "personality" of the token's illumination.
 */
export const CELLS_X = 4;
export const CELLS_Y = 6;
export const CELLS_Z = 4;
export const NODES_X = CELLS_X + 1; // 5
export const NODES_Y = CELLS_Y + 1; // 7
export const NODES_Z = CELLS_Z + 1; // 5
export const NODE_COUNT = NODES_X * NODES_Y * NODES_Z; // 175
/**
 * Each beam is rendered as this many short sub-segments. Each sub-segment
 * has its own erosion threshold, so beams can look weathered (some pieces
 * gone, some still present) instead of binary on/off.
 */
export const SEGMENTS_PER_BEAM = 5;
/**
 * Curated colour families. Each family has 4 variants so there's always
 * subtle differentiation between two tokens that share a family. Tones are
 * vibrant but harmonious within each family. Reads as fuzzy-Chromie-Squiggle
 * energy through bloom, not muted.
 */
export const FAMILIES = {
    amber: [[0.95, 0.70, 0.35], [1.00, 0.60, 0.20], [0.90, 0.55, 0.15], [1.00, 0.80, 0.45]],
    gold: [[1.00, 0.85, 0.35], [1.00, 0.75, 0.20], [0.90, 0.70, 0.15], [1.00, 0.90, 0.50]],
    rose: [[1.00, 0.55, 0.70], [0.95, 0.40, 0.60], [0.85, 0.35, 0.55], [1.00, 0.70, 0.80]],
    coral: [[1.00, 0.50, 0.35], [0.95, 0.35, 0.20], [0.85, 0.30, 0.15], [1.00, 0.60, 0.45]],
    teal: [[0.30, 0.85, 0.85], [0.15, 0.75, 0.75], [0.40, 0.95, 0.95], [0.10, 0.65, 0.65]],
    mint: [[0.50, 0.95, 0.55], [0.30, 0.85, 0.40], [0.40, 0.90, 0.50], [0.60, 1.00, 0.60]],
    violet: [[0.65, 0.35, 1.00], [0.55, 0.25, 0.95], [0.75, 0.45, 1.00], [0.50, 0.20, 0.85]],
    slate: [[0.45, 0.70, 1.00], [0.30, 0.60, 0.95], [0.55, 0.80, 1.00], [0.25, 0.50, 0.90]],
    cream: [[1.00, 0.95, 0.85], [0.95, 0.90, 0.75], [1.00, 0.92, 0.80], [0.90, 0.85, 0.70]],
    indigo: [[0.40, 0.45, 1.00], [0.30, 0.35, 0.95], [0.50, 0.55, 1.00], [0.25, 0.30, 0.85]],
    magenta: [[1.00, 0.30, 0.85], [0.95, 0.20, 0.75], [0.85, 0.15, 0.65], [1.00, 0.45, 0.95]],
};
export const FAMILY_NAMES = Object.keys(FAMILIES);
/** Mulberry32 PRNG: small, fast, good enough for visual variation. */
function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function buildWarpParams(rng, ampLo, ampHi) {
    const range = (lo, hi) => lo + rng() * (hi - lo);
    const phase = () => rng() * Math.PI * 2;
    return {
        ampX: range(ampLo, ampHi),
        ampY: range(ampLo * 0.6, ampHi * 0.7),
        ampZ: range(ampLo, ampHi),
        fxY: range(0.4, 1.0),
        fxZ: range(0.4, 1.0),
        fyX: range(0.4, 1.0),
        fyZ: range(0.4, 1.0),
        fzX: range(0.4, 1.0),
        fzY: range(0.4, 1.0),
        pxY: phase(),
        pxZ: phase(),
        pyX: phase(),
        pyZ: phase(),
        pzX: phase(),
        pzY: phase(),
    };
}
function buildCharacterParams(rng) {
    return {
        // Birth warp: 10-18% of cell spacing.
        warp: buildWarpParams(rng, 0.10, 0.18),
        // Decay-time additional drift: 8-18%. Subtle. The dominant decay mechanic
        // is beam removal, not deformation.
        decay: buildWarpParams(rng, 0.08, 0.18),
        leanX: (rng() - 0.5) * 0.05,
        leanZ: (rng() - 0.5) * 0.05,
        breakage: 0.02 + rng() * 0.04,
    };
}
function deterministicWarp(baseX, baseY, baseZ, p) {
    const sX = Math.abs(baseX);
    const sign = baseX === 0 ? 0 : baseX > 0 ? 1 : -1;
    const dx = sign *
        p.ampX *
        (Math.sin(p.fxY * baseY + p.pxY) + Math.sin(p.fxZ * baseZ + p.pxZ)) *
        0.5;
    const dy = p.ampY *
        (Math.sin(p.fyX * sX + p.pyX) + Math.sin(p.fyZ * baseZ + p.pyZ)) *
        0.5;
    const dz = p.ampZ *
        (Math.sin(p.fzX * sX + p.pzX) + Math.sin(p.fzY * baseZ + p.pzY)) *
        0.5;
    return { x: dx, y: dy, z: dz };
}
const nodeIndex = (ix, iy, iz) => iz * (NODES_X * NODES_Y) + iy * NODES_X + ix;
/**
 * Build a unit vector in a deterministic random direction.
 */
function randomUnitVec(rng) {
    // Marsaglia: uniform on the unit sphere.
    let x, y, s;
    do {
        x = rng() * 2 - 1;
        y = rng() * 2 - 1;
        s = x * x + y * y;
    } while (s >= 1);
    const z = 1 - 2 * s;
    const r = 2 * Math.sqrt(1 - s);
    return { x: x * r, y: y * r, z };
}
function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}
function normalise(v) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}
function perpendicularTo(v) {
    // Pick any vector not parallel to v, then cross to get a perpendicular.
    const seed = Math.abs(v.y) < 0.9
        ? { x: 0, y: 1, z: 0 }
        : { x: 1, y: 0, z: 0 };
    return normalise(cross(v, seed));
}
/**
 * Build one short beam of light. A coherent fragment with a centre point,
 * a random orientation, and a small amount of perpendicular wobble so it
 * doesn't look mechanically straight. Length is in the same units as the
 * lattice (cells), so a length of 4 spans the lattice's narrower axis.
 */
function buildLightFragment(rng, colours) {
    const pointCount = 4 + Math.floor(rng() * 3); // 4-6 control points
    // Centre the tadpole inside the lattice envelope (4x6x4 cells, half-extents
    // 2x3x2). Pulled in slightly so even with drift the tadpole stays in/near
    // the structure rather than flying off into empty space.
    const centre = {
        x: (rng() - 0.5) * 3.4,
        y: (rng() - 0.5) * 5.0,
        z: (rng() - 0.5) * 3.4,
    };
    const direction = randomUnitVec(rng);
    const length = 0.8 + rng() * 1.7; // 0.8-2.5 units (small tadpoles)
    const perp1 = perpendicularTo(direction);
    const perp2 = normalise(cross(direction, perp1));
    // Subtle perpendicular wobble so the beam isn't perfectly straight.
    const wobble = 0.15 + rng() * 0.4;
    const wobblePhase = rng() * Math.PI * 2;
    const controlPoints = [];
    for (let i = 0; i < pointCount; i++) {
        const t = i / (pointCount - 1);
        const u = (t - 0.5) * length;
        const w1 = Math.sin(t * Math.PI + wobblePhase) * wobble;
        const w2 = Math.cos(t * Math.PI + wobblePhase) * wobble * 0.6;
        controlPoints.push({
            base: {
                x: centre.x + direction.x * u + perp1.x * w1 + perp2.x * w2,
                y: centre.y + direction.y * u + perp1.y * w1 + perp2.y * w2,
                z: centre.z + direction.z * u + perp1.z * w1 + perp2.z * w2,
            },
            // Per-point wobble: each control point swings gently around its
            // base position so the tadpole flexes as it moves.
            amplitude: {
                x: 0.10 + rng() * 0.18,
                y: 0.10 + rng() * 0.18,
                z: 0.10 + rng() * 0.18,
            },
            freq: {
                x: 0.10 + rng() * 0.25,
                y: 0.10 + rng() * 0.25,
                z: 0.10 + rng() * 0.25,
            },
            phase: {
                x: rng() * Math.PI * 2,
                y: rng() * Math.PI * 2,
                z: rng() * Math.PI * 2,
            },
        });
    }
    // Whole-tadpole drift. Slower than the lifecycle so each tadpole has barely
    // moved between fades - the same tadpole reappears near where it was, which
    // reads as continuous flow rather than teleportation.
    const centreFlow = {
        base: { x: 0, y: 0, z: 0 }, // unused; centreFlow is added to point bases
        amplitude: {
            x: 0.20 + rng() * 0.35,
            y: 0.20 + rng() * 0.35,
            z: 0.20 + rng() * 0.35,
        },
        freq: {
            x: 0.03 + rng() * 0.08,
            y: 0.03 + rng() * 0.08,
            z: 0.03 + rng() * 0.08,
        },
        phase: {
            x: rng() * Math.PI * 2,
            y: rng() * Math.PI * 2,
            z: rng() * Math.PI * 2,
        },
    };
    // Lifecycle: each tadpole on its own fade-in/out cycle, 12-40s period.
    const lifecycleFreq = 0.15 + rng() * 0.35;
    const lifecyclePhase = rng() * Math.PI * 2;
    return { colours, centreFlow, controlPoints, lifecycleFreq, lifecyclePhase };
}
function buildLightProfile(rng) {
    // 25-40 small tadpole light fragments per token.
    const fragmentCount = 25 + Math.floor(rng() * 16);
    // Pick a curated palette from the library. Each palette is hand-tuned to
    // look beautiful as a set, replacing the previous random family mixing.
    const curated = pickCuratedPalette(rng);
    const palette = curated.colours.map((c) => [c[0], c[1], c[2]]);
    // Build tadpoles. Each gets 1-7 colour stops along its length. Distribution
    // skews toward 3-4 stops so most tadpoles read as Chromie-Squiggle-style
    // colour-shifting beams rather than solid lines.
    const fragments = [];
    for (let i = 0; i < fragmentCount; i++) {
        const r = rng();
        let stopCount;
        if (r < 0.10)
            stopCount = 1;
        else if (r < 0.30)
            stopCount = 2;
        else if (r < 0.55)
            stopCount = 3;
        else if (r < 0.80)
            stopCount = 4;
        else if (r < 0.92)
            stopCount = 5;
        else
            stopCount = 6 + Math.floor(rng() * 2);
        const colours = [];
        for (let s = 0; s < stopCount; s++) {
            let colour = palette[Math.floor(rng() * palette.length)];
            // Avoid two consecutive identical stops.
            let safety = 0;
            while (s > 0 &&
                colours[s - 1].join() === colour.join() &&
                safety++ < palette.length) {
                colour = palette[(palette.indexOf(colour) + 1) % palette.length];
            }
            colours.push(colour);
        }
        fragments.push(buildLightFragment(rng, colours));
    }
    const gr = rng();
    const growthCurve = gr < 0.35 ? "talent" : gr < 0.7 ? "work" : "balanced";
    return {
        fragmentCount,
        paletteId: curated.id,
        paletteName: curated.name,
        palette,
        growthCurve,
        fragments,
    };
}
/**
 * Build per-sub-segment erosion thresholds, uniform random in (0, 1].
 * A segment is visible while `currentDecay <= threshold`. Decay is capped
 * per-token at `decayLimit / 100`, so a token with decayLimit = 39 ends
 * with ~39% of segments gone (those with threshold < 0.39) and the rest
 * preserved indefinitely.
 */
function buildSegmentThresholds(rng, beamCount) {
    const total = beamCount * SEGMENTS_PER_BEAM;
    const thresholds = new Array(total);
    for (let i = 0; i < total; i++) {
        // Pull from (0, 1]. Avoid exactly 0 so a segment can't be invisible at
        // birth. A small floor keeps the lowest-ranked segments alive briefly.
        thresholds[i] = Math.max(rng(), 0.001);
    }
    return thresholds;
}
/** Deterministic: same seed always produces the same lattice. */
export function generateLattice(seed) {
    const rng = makeRng(seed);
    const params = buildCharacterParams(rng);
    const nodes = [];
    const basePositions = [];
    const decayVectors = [];
    for (let iz = 0; iz < NODES_Z; iz++) {
        for (let iy = 0; iy < NODES_Y; iy++) {
            for (let ix = 0; ix < NODES_X; ix++) {
                const baseX = ix - (NODES_X - 1) / 2;
                const baseY = iy - (NODES_Y - 1) / 2;
                const baseZ = iz - (NODES_Z - 1) / 2;
                const warp = deterministicWarp(baseX, baseY, baseZ, params.warp);
                const breakX = (rng() - 0.5) * params.breakage;
                const breakY = (rng() - 0.5) * params.breakage;
                const breakZ = (rng() - 0.5) * params.breakage;
                const leanX = params.leanX * baseY;
                const leanZ = params.leanZ * baseY;
                basePositions.push({ x: baseX, y: baseY, z: baseZ });
                nodes.push({
                    x: baseX + warp.x + breakX + leanX,
                    y: baseY + warp.y + breakY,
                    z: baseZ + warp.z + breakZ + leanZ,
                });
                decayVectors.push(deterministicWarp(baseX, baseY, baseZ, params.decay));
            }
        }
    }
    const beams = [];
    for (let iz = 0; iz < NODES_Z; iz++) {
        for (let iy = 0; iy < NODES_Y; iy++) {
            for (let ix = 0; ix < NODES_X; ix++) {
                const here = nodeIndex(ix, iy, iz);
                if (ix < NODES_X - 1)
                    beams.push({ from: here, to: nodeIndex(ix + 1, iy, iz) });
                if (iy < NODES_Y - 1)
                    beams.push({ from: here, to: nodeIndex(ix, iy + 1, iz) });
                if (iz < NODES_Z - 1)
                    beams.push({ from: here, to: nodeIndex(ix, iy, iz + 1) });
            }
        }
    }
    const segmentThresholds = buildSegmentThresholds(rng, beams.length);
    const lightProfile = buildLightProfile(rng);
    return {
        nodes,
        basePositions,
        decayVectors,
        beams,
        segmentThresholds,
        lightProfile,
    };
}
