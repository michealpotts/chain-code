import { GalaChainContext } from "@gala-chain/chaincode";

export interface WebhookPayload {
  event: string;
  txId: string;
  timestamp: number;
  caller: string;
  data: Record<string, unknown>;
}

/**
 * Sends a webhook POST request to the configured webhook URL.
 * This function is designed to be non-blocking and will not fail the transaction
 * if the webhook call fails.
 *
 * @param ctx - GalaChain context
 * @param webhookUrl - The webhook URL to send data to
 * @param event - Event name/type
 * @param data - Additional event data to send
 */
export async function sendWebhook(
  ctx: GalaChainContext,
  webhookUrl: string | undefined,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  // Skip if no webhook URL is configured
  if (!webhookUrl || webhookUrl.trim() === "") {
    return;
  }

  try {
    const payload: WebhookPayload = {
      event,
      txId: ctx.stub.getTxID(),
      timestamp: ctx.txUnixTime,
      caller: ctx.callingUser,
      data
    };

    // Dynamically import node-fetch to handle ESM compatibility
    // node-fetch v3 is ESM-only, so we use dynamic import
    type FetchFunction = (url: string, options?: any) => Promise<any>;
    let fetchFn: FetchFunction;
    try {
      // Try to use node-fetch
      const nodeFetch = await import("node-fetch");
      fetchFn = nodeFetch.default as FetchFunction;
    } catch (importError) {
      // Fallback to global fetch if available (Node 18+)
      const globalFetch = (global as any).fetch || (global as any).window?.fetch;
      if (!globalFetch) {
        console.warn(`Webhook not sent: fetch is not available in this environment. Event: ${event}`);
        return;
      }
      fetchFn = globalFetch as FetchFunction;
    }

    // Make the webhook POST request
    // Use a timeout to prevent blocking the transaction too long
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    try {
      await fetchFn(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "EggContract/1.0.1"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // Never fail the transaction due to webhook errors
    // Log the error but continue execution
    console.error(`Webhook failed for event ${event}:`, error instanceof Error ? error.message : String(error));
  }
}

