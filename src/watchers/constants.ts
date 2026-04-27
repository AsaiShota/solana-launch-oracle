// Solana program IDs we monitor.
// Source: published program addresses from each project's docs/repos.

export const PROGRAM_IDS = {
  PUMPFUN: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  RAYDIUM_AMM_V4: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  RAYDIUM_CPMM: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  PUMPSWAP: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
  SPL_TOKEN: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  TOKEN_2022: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  METAPLEX_METADATA: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  WSOL: "So11111111111111111111111111111111111111112",
} as const;

// Heuristic log markers used to detect "a new pool / mint was created".
// These are deliberately broad — false positives are filtered downstream by
// metadata fetch + dedupe keyed on (mint, source).
export const LAUNCH_LOG_MARKERS = {
  PUMPFUN: [
    "Program log: Instruction: Create",
    "Program log: Instruction: InitializeBondingCurve",
    "Program log: Instruction: CreateBondingCurve",
  ],
  RAYDIUM_AMM_V4: [
    "Program log: initialize2",
    "Program log: Instruction: Initialize2",
  ],
  RAYDIUM_CPMM: [
    "Program log: Instruction: Initialize",
    "Program log: Instruction: CreatePool",
  ],
  PUMPSWAP: [
    "Program log: Instruction: CreatePool",
    "Program log: Instruction: Initialize",
  ],
};
