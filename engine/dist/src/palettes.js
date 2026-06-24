/**
 * Curated palette library.
 *
 * Each palette is a hand-composed set of 5-7 colours intended to look
 * intentional and beautiful together. Tokens pick one palette by seed
 * rather than randomly mixing colours from family pools.
 *
 * Naming each palette gives the work a metadata "trait" that marketplaces
 * and collectors can talk about.
 *
 * All RGB values are in 0-1 normalised linear space. Saturated enough to
 * bloom cleanly; not so vivid as to feel garish.
 */
export const CURATED_PALETTES = [
    {
        id: "aurora",
        name: "Aurora",
        colours: [
            [0.20, 0.95, 0.65],
            [0.30, 0.80, 0.95],
            [0.45, 0.45, 0.95],
            [0.75, 0.45, 0.95],
            [0.95, 0.55, 0.85],
        ],
    },
    {
        id: "magma",
        name: "Magma",
        colours: [
            [0.95, 0.20, 0.35],
            [1.00, 0.45, 0.20],
            [1.00, 0.75, 0.30],
            [0.95, 0.92, 0.55],
            [0.55, 0.10, 0.25],
        ],
    },
    {
        id: "twilight",
        name: "Twilight",
        colours: [
            [0.30, 0.20, 0.55],
            [0.55, 0.30, 0.85],
            [0.85, 0.40, 0.85],
            [1.00, 0.55, 0.70],
            [0.20, 0.30, 0.65],
        ],
    },
    {
        id: "glacier",
        name: "Glacier",
        colours: [
            [0.65, 0.85, 1.00],
            [0.40, 0.70, 0.95],
            [0.85, 0.95, 1.00],
            [0.55, 0.85, 0.90],
            [0.25, 0.50, 0.85],
        ],
    },
    {
        id: "coral-reef",
        name: "Coral Reef",
        colours: [
            [1.00, 0.45, 0.45],
            [1.00, 0.70, 0.50],
            [0.30, 0.85, 0.85],
            [0.20, 0.65, 0.80],
            [1.00, 0.80, 0.65],
        ],
    },
    {
        id: "forest-cathedral",
        name: "Forest Cathedral",
        colours: [
            [0.40, 0.65, 0.35],
            [0.65, 0.80, 0.40],
            [0.95, 0.80, 0.45],
            [0.85, 0.55, 0.25],
            [0.25, 0.45, 0.30],
        ],
    },
    {
        id: "berry-wine",
        name: "Berry Wine",
        colours: [
            [0.85, 0.30, 0.55],
            [0.55, 0.20, 0.55],
            [1.00, 0.55, 0.75],
            [0.40, 0.10, 0.30],
            [0.95, 0.75, 0.85],
        ],
    },
    {
        id: "sakura",
        name: "Sakura",
        colours: [
            [1.00, 0.75, 0.85],
            [1.00, 0.55, 0.70],
            [0.95, 0.95, 0.85],
            [0.75, 0.85, 0.70],
            [0.95, 0.85, 0.55],
        ],
    },
    {
        id: "cyberpunk",
        name: "Cyberpunk",
        colours: [
            [1.00, 0.20, 0.85],
            [0.20, 0.95, 1.00],
            [1.00, 0.85, 0.20],
            [0.55, 0.20, 1.00],
            [0.20, 0.45, 1.00],
        ],
    },
    {
        id: "desert-dawn",
        name: "Desert Dawn",
        colours: [
            [0.95, 0.60, 0.35],
            [1.00, 0.80, 0.50],
            [0.85, 0.45, 0.55],
            [0.55, 0.65, 0.85],
            [0.95, 0.90, 0.75],
        ],
    },
    {
        id: "ocean-depths",
        name: "Ocean Depths",
        colours: [
            [0.20, 0.65, 0.75],
            [0.30, 0.45, 0.85],
            [0.20, 0.30, 0.55],
            [0.55, 0.85, 0.85],
            [0.85, 0.95, 0.90],
        ],
    },
    {
        id: "sunset-bloom",
        name: "Sunset Bloom",
        colours: [
            [1.00, 0.55, 0.55],
            [1.00, 0.70, 0.40],
            [1.00, 0.85, 0.35],
            [0.95, 0.50, 0.75],
            [0.85, 0.30, 0.45],
        ],
    },
    {
        id: "cosmic",
        name: "Cosmic",
        colours: [
            [0.30, 0.20, 0.65],
            [0.85, 0.30, 0.85],
            [1.00, 0.50, 0.55],
            [0.40, 0.55, 0.95],
            [0.95, 0.85, 0.95],
        ],
    },
    {
        id: "ember",
        name: "Ember",
        colours: [
            [1.00, 0.40, 0.20],
            [0.95, 0.65, 0.25],
            [1.00, 0.85, 0.40],
            [0.65, 0.20, 0.20],
            [0.95, 0.95, 0.75],
        ],
    },
    {
        id: "sage-meadow",
        name: "Sage Meadow",
        colours: [
            [0.65, 0.80, 0.65],
            [0.85, 0.85, 0.65],
            [0.85, 0.65, 0.65],
            [0.95, 0.90, 0.80],
            [0.55, 0.70, 0.55],
        ],
    },
    {
        id: "iron-forge",
        name: "Iron Forge",
        colours: [
            [0.85, 0.55, 0.30],
            [0.65, 0.40, 0.25],
            [0.95, 0.75, 0.45],
            [0.40, 0.30, 0.25],
            [1.00, 0.85, 0.55],
        ],
    },
    {
        id: "lily-pond",
        name: "Lily Pond",
        colours: [
            [1.00, 0.75, 0.85],
            [0.65, 0.85, 0.75],
            [0.95, 0.95, 0.85],
            [0.75, 0.65, 0.85],
            [0.55, 0.85, 0.85],
        ],
    },
    {
        id: "mediterranean",
        name: "Mediterranean",
        colours: [
            [0.20, 0.65, 0.85],
            [0.85, 0.50, 0.30],
            [0.95, 0.85, 0.55],
            [0.95, 0.95, 0.85],
            [0.30, 0.45, 0.75],
        ],
    },
    {
        id: "northern-lights",
        name: "Northern Lights",
        colours: [
            [0.30, 0.95, 0.55],
            [0.20, 0.65, 0.85],
            [0.65, 0.45, 0.95],
            [0.95, 0.65, 0.85],
            [0.20, 0.35, 0.55],
        ],
    },
    {
        id: "pastel-dream",
        name: "Pastel Dream",
        colours: [
            [1.00, 0.85, 0.85],
            [0.85, 0.95, 0.95],
            [0.95, 0.95, 0.85],
            [0.85, 0.85, 0.95],
            [0.95, 0.85, 0.95],
        ],
    },
    {
        id: "vintage-film",
        name: "Vintage Film",
        colours: [
            [0.85, 0.65, 0.55],
            [0.55, 0.65, 0.65],
            [0.95, 0.85, 0.65],
            [0.65, 0.45, 0.45],
            [0.85, 0.85, 0.75],
        ],
    },
    {
        id: "tropical",
        name: "Tropical",
        colours: [
            [0.20, 0.85, 0.65],
            [1.00, 0.55, 0.45],
            [1.00, 0.85, 0.30],
            [0.30, 0.65, 0.95],
            [1.00, 0.45, 0.85],
        ],
    },
    {
        id: "mineral",
        name: "Mineral",
        colours: [
            [0.85, 0.65, 0.30],
            [0.55, 0.45, 0.65],
            [0.30, 0.55, 0.55],
            [0.95, 0.85, 0.65],
            [0.65, 0.30, 0.30],
        ],
    },
    {
        id: "ethereal",
        name: "Ethereal",
        colours: [
            [0.95, 0.95, 1.00],
            [0.85, 0.75, 0.95],
            [0.95, 0.85, 0.85],
            [0.85, 0.95, 0.85],
            [0.95, 0.95, 0.85],
        ],
    },
    {
        id: "volcanic",
        name: "Volcanic",
        colours: [
            [1.00, 0.30, 0.20],
            [0.95, 0.55, 0.20],
            [0.95, 0.85, 0.30],
            [0.30, 0.15, 0.15],
            [0.65, 0.20, 0.10],
        ],
    },
    {
        id: "harvest",
        name: "Harvest",
        colours: [
            [0.95, 0.65, 0.25],
            [0.85, 0.45, 0.20],
            [0.95, 0.85, 0.45],
            [0.55, 0.35, 0.20],
            [0.95, 0.95, 0.75],
        ],
    },
    {
        id: "midnight-bloom",
        name: "Midnight Bloom",
        colours: [
            [0.20, 0.30, 0.65],
            [0.65, 0.30, 0.85],
            [0.95, 0.55, 0.85],
            [0.30, 0.55, 0.85],
            [0.85, 0.85, 0.95],
        ],
    },
    {
        id: "smoke-rose",
        name: "Smoke and Rose",
        colours: [
            [0.85, 0.65, 0.65],
            [0.55, 0.45, 0.55],
            [0.95, 0.85, 0.85],
            [0.65, 0.55, 0.65],
            [0.95, 0.75, 0.75],
        ],
    },
];
/**
 * Pick a deterministic palette for a token from its rng stream.
 */
export function pickCuratedPalette(rng) {
    const idx = Math.floor(rng() * CURATED_PALETTES.length);
    return CURATED_PALETTES[idx];
}
