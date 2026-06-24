export { generateLattice, FAMILIES, FAMILY_NAMES, NODE_COUNT, CELLS_X, CELLS_Y, CELLS_Z, NODES_X, NODES_Y, NODES_Z, SEGMENTS_PER_BEAM, } from "./geometry.js";
export { CURATED_PALETTES, pickCuratedPalette } from "./palettes.js";
export const BLOCKS_PER_YEAR = 2_628_000; // ~12s block time
export const MIN_ILLUMINATION = 69;
export const MAX_ILLUMINATION = 97;
export const MIN_DECAY = 40;
export const MAX_DECAY = 95;
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
/**
 * The horizon (years to reach the limit) is just `limit / 10` for either
 * axis. So L69 reaches its illumination peak at year 6.9, D39 reaches its
 * decay peak at year 3.9. Same pace, different stopping heights.
 */
export function horizonYearsFor(limit) {
    return limit / 10;
}
export function illuminationTierFor(limit) {
    if (limit <= 78)
        return "resilient";
    if (limit <= 88)
        return "balanced";
    if (limit <= 94)
        return "fragile";
    return "transcendent";
}
export function decayTierFor(limit) {
    if (limit <= 52)
        return "intact";
    if (limit <= 67)
        return "weathered";
    if (limit <= 81)
        return "skeletal";
    return "dissolved";
}
function horizonBlocks(limit) {
    return Math.max(1, Math.round(horizonYearsFor(limit) * BLOCKS_PER_YEAR));
}
export function computeBrightnessState(input) {
    const elapsed = Math.max(0, input.currentBlock - input.birthBlock);
    return clamp(elapsed / horizonBlocks(input.illuminationLimit), 0, 1);
}
export function computeDecayState(input) {
    const elapsed = Math.max(0, input.currentBlock - input.birthBlock);
    return clamp(elapsed / horizonBlocks(input.decayLimit), 0, 1);
}
export function computePhase(brightnessState) {
    if (brightnessState < 0.2)
        return "structure";
    if (brightnessState < 0.72)
        return "decay";
    return "enlightenment";
}
export function computeState(input) {
    const brightnessState = computeBrightnessState(input);
    const decayState = computeDecayState(input);
    const phase = computePhase(brightnessState);
    const isStill = brightnessState >= 1 && decayState >= 1;
    const currentIllumination = brightnessState * (input.illuminationLimit / 100);
    const currentDecay = decayState * (input.decayLimit / 100);
    const glowIntensity = clamp(0.15 + brightnessState * 0.85, 0, 1);
    const structuralDrift = clamp((input.seed % 1000) / 1000, 0, 1);
    return {
        phase,
        brightnessState,
        decayState,
        currentIllumination,
        currentDecay,
        isStill,
        glowIntensity,
        structuralDrift
    };
}
