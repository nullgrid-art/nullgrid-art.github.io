/**
 * Production renderer configuration.
 *
 * This is the artwork that a token's `animation_url` points to. It reads a
 * token's identity (seed, illumination limit, decay limit, birth block) and
 * renders the lattice at its real, current age.
 *
 * Two modes:
 *   - chain mode:  set `contractAddress` after the mainnet deploy. The renderer
 *                  reads getIdentity(tokenId) and the current block over a public
 *                  RPC, so every piece shows its true elapsed age. This is the
 *                  canonical, self-describing mode for the live collection.
 *   - preview mode: when `contractAddress` is empty, token params come from
 *                  `tokenConfigUrl` and the age is `previewYear` (override with
 *                  ?year=). Used for development and pre-deploy review.
 */
export const RENDER_CONFIG = {
  // Set to the deployed EntropyProtocol address to enable chain mode.
  contractAddress: "",

  // Public RPCs, tried in order. Multiple for resilience.
  rpcUrls: [
    "https://eth.llamarpc.com",
    "https://rpc.ankr.com/eth",
    "https://cloudflare-eth.com",
  ],

  // ~12s Ethereum block time. Must match the engine's BLOCKS_PER_YEAR basis.
  blocksPerYear: 2_628_000,

  // Preview-mode token parameters (used only when contractAddress is empty).
  tokenConfigUrl: "/metadata/token-limits.json",

  // Preview-mode lifetime in years (overridable with ?year=N). A "hero" moment
  // where structure and light coexist; not used in chain mode.
  previewYear: 3.5,
};
