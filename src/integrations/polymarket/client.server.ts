// Server-only Polymarket CLOB helper.
// Uses @polymarket/clob-client + ethers v5 to sign and submit limit orders.
import { ClobClient, OrderType, Side, type ApiKeyCreds } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";

const HOST = "https://clob.polymarket.com";
const CHAIN_ID = 137; // Polygon mainnet

let cachedClient: ClobClient | null = null;

function getClient(): ClobClient {
  if (cachedClient) return cachedClient;

  const pk = process.env.POLYMARKET_PRIVATE_KEY;
  const apiKey = process.env.POLYMARKET_API_KEY;
  const apiSecret = process.env.POLYMARKET_API_SECRET;
  const passphrase = process.env.POLYMARKET_API_PASSPHRASE;
  if (!pk || !apiKey || !apiSecret || !passphrase) {
    throw new Error("missing POLYMARKET_* env vars");
  }

  const wallet = new Wallet(pk.startsWith("0x") ? pk : `0x${pk}`);
  const creds: ApiKeyCreds = { key: apiKey, secret: apiSecret, passphrase };

  // signatureType: 0 = EOA (default for a regular private key with its own API creds).
  // If the funder is a Polygon proxy/safe, set POLYMARKET_FUNDER_ADDRESS + POLYMARKET_SIG_TYPE.
  const funder = process.env.POLYMARKET_FUNDER_ADDRESS;
  const sigTypeRaw = process.env.POLYMARKET_SIG_TYPE;
  const signatureType = sigTypeRaw ? Number(sigTypeRaw) : undefined;

  cachedClient = new ClobClient(HOST, CHAIN_ID, wallet as any, creds, signatureType, funder);
  return cachedClient;
}

export type PlaceOrderResult = {
  success: boolean;
  orderId: string | null;
  status: string | null;
  error: string | null;
};

/**
 * Place a BUY limit order on Polymarket CLOB.
 * @param tokenId  outcome token id (a.k.a. asset id)
 * @param price    limit price (0..1)
 * @param shares   size in shares (USDC amount = price * shares)
 */
export async function placeBuyOrder(
  tokenId: string,
  price: number,
  shares: number,
): Promise<PlaceOrderResult> {
  try {
    const client = getClient();
    const roundedPrice = Math.round(price * 1000) / 1000; // 3 decimals
    const roundedSize = Math.round(shares * 100) / 100; // 2 decimals
    const signed = await client.createOrder({
      tokenID: tokenId,
      price: roundedPrice,
      side: Side.BUY,
      size: roundedSize,
      feeRateBps: 0,
    });
    const resp: any = await client.postOrder(signed, OrderType.GTC);
    return {
      success: !!resp?.success,
      orderId: resp?.orderID ?? resp?.orderId ?? null,
      status: resp?.status ?? null,
      error: resp?.errorMsg || (resp?.success ? null : "unknown error"),
    };
  } catch (e: any) {
    return { success: false, orderId: null, status: null, error: e?.message ?? String(e) };
  }
}
