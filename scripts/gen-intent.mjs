const en = `New x402 endpoint: real-time Solana launch detection for AI agents.

Streams Pump.fun, Raydium V4/CPMM, PumpSwap mints with initial liquidity. $0.001 USDC per call on @base. Bazaar-discoverable, no API keys, no signup.

https://oracle-production-d5ba.up.railway.app/launches/recent`;

const ja = `solana-launch-oracle 公開しました。

Solana の新規トークン Launch（Pump.fun / Raydium V4・CPMM / PumpSwap）をリアルタイムで返す x402 API。
1コール $0.001 USDC（Base）、API キー不要、Bazaar 登録済み。

https://oracle-production-d5ba.up.railway.app/launches/recent`;

const qrt = `Built one in an afternoon with x402 + Bazaar.

solana-launch-oracle: pay-per-call detection of new Solana token launches across Pump.fun, Raydium V4/CPMM, and PumpSwap. $0.001 USDC on Base, no API keys.

https://oracle-production-d5ba.up.railway.app/launches/recent`;

function twitterWeight(text) {
  // URLs collapse to 23 chars each (t.co). CJK chars count as 2; everything else 1.
  const urlRe = /https?:\/\/\S+/g;
  let s = text.replace(urlRe, "U".repeat(23));
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x1100 && cp <= 0x11FF) || (cp >= 0x2E80 && cp <= 0x9FFF) || (cp >= 0xA000 && cp <= 0xA4CF) || (cp >= 0xAC00 && cp <= 0xD7AF) || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFE30 && cp <= 0xFE4F) || (cp >= 0xFF00 && cp <= 0xFFEF) || (cp >= 0x20000 && cp <= 0x2FFFF)) w += 2;
    else w += 1;
  }
  return w;
}
console.log("EN raw=", en.length, " twitter weight=", twitterWeight(en), "/280");
console.log("JA raw=", ja.length, " twitter weight=", twitterWeight(ja), "/280");
console.log("QRT raw=", qrt.length, " twitter weight=", twitterWeight(qrt), "/280");
console.log();
console.log("EN intent:\nhttps://twitter.com/intent/tweet?text=" + encodeURIComponent(en));
console.log();
console.log("JA intent:\nhttps://twitter.com/intent/tweet?text=" + encodeURIComponent(ja));
console.log();
console.log("QRT intent:\nhttps://twitter.com/intent/tweet?text=" + encodeURIComponent(qrt));
