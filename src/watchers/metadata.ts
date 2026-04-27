import { Connection, PublicKey } from "@solana/web3.js";
import { logger } from "../logger";
import { PROGRAM_IDS } from "./constants";

export interface TokenMetadata {
  name: string;
  symbol: string;
  uri: string;
  updateAuthority: string | null;
}

const METAPLEX = new PublicKey(PROGRAM_IDS.METAPLEX_METADATA);

function getMetadataPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METAPLEX.toBuffer(), mint.toBuffer()],
    METAPLEX,
  );
  return pda;
}

function readU32LE(buf: Buffer, off: number): number {
  return buf.readUInt32LE(off);
}

function parseMetaplexMetadata(data: Buffer): TokenMetadata | null {
  try {
    const updateAuthority = new PublicKey(data.subarray(1, 33)).toBase58();
    let offset = 1 + 32 + 32;

    const nameLen = readU32LE(data, offset); offset += 4;
    const name = data.subarray(offset, offset + nameLen).toString("utf-8").replace(/\0/g, "").trim();
    offset += nameLen;

    const symbolLen = readU32LE(data, offset); offset += 4;
    const symbol = data.subarray(offset, offset + symbolLen).toString("utf-8").replace(/\0/g, "").trim();
    offset += symbolLen;

    const uriLen = readU32LE(data, offset); offset += 4;
    const uri = data.subarray(offset, offset + uriLen).toString("utf-8").replace(/\0/g, "").trim();

    return { name, symbol, uri, updateAuthority };
  } catch {
    return null;
  }
}

function parseToken2022MetadataExtension(data: Buffer, start: number): TokenMetadata | null {
  try {
    let offset = start;
    let updateAuthority: string | null = null;
    try {
      updateAuthority = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    } catch { /* ignore */ }
    offset += 32 + 32; // updateAuthority + mint

    const readString = (): string => {
      const len = readU32LE(data, offset); offset += 4;
      const s = data.subarray(offset, offset + len).toString("utf-8").replace(/\0/g, "").trim();
      offset += len;
      return s;
    };

    const name = readString();
    const symbol = readString();
    const uri = readString();
    return { name, symbol, uri, updateAuthority };
  } catch {
    return null;
  }
}

async function getToken2022Metadata(connection: Connection, mint: PublicKey): Promise<TokenMetadata | null> {
  try {
    const accountInfo = await connection.getAccountInfo(mint);
    if (!accountInfo?.data) return null;
    const data = accountInfo.data;
    if (data.length <= 166) return null;

    let offset = 166;
    while (offset + 4 < data.length) {
      const extType = data.readUInt16LE(offset);
      const extLen = data.readUInt16LE(offset + 2);
      offset += 4;
      // 19 = TokenMetadata extension type
      if (extType === 19 && extLen > 0) {
        return parseToken2022MetadataExtension(data, offset);
      }
      offset += extLen;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchMetadata(
  connection: Connection,
  mintAddress: string,
  isToken2022 = false,
): Promise<TokenMetadata | null> {
  const mint = new PublicKey(mintAddress);

  if (isToken2022) {
    const ext = await getToken2022Metadata(connection, mint);
    if (ext) return ext;
  }

  const pda = getMetadataPDA(mint);
  const accountInfo = await connection.getAccountInfo(pda);
  if (!accountInfo?.data) return null;
  return parseMetaplexMetadata(accountInfo.data);
}

// Metadata accounts can lag behind mint creation by a few seconds; retry briefly.
const RETRY_DELAYS_MS = [0, 1500, 4000, 9000];

export async function fetchMetadataWithRetry(
  connection: Connection,
  mintAddress: string,
  isToken2022 = false,
): Promise<TokenMetadata | null> {
  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    if (RETRY_DELAYS_MS[i] > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
    try {
      const meta = await fetchMetadata(connection, mintAddress, isToken2022);
      if (meta && (meta.symbol || meta.name)) return meta;
    } catch (err) {
      logger.debug(`metadata attempt ${i + 1} failed for ${mintAddress}`, err);
    }
  }
  return null;
}
