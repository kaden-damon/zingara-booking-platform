export { MockXeroTransport } from "./transport.ts";
export type { XeroRequest as XeroTransportRequest, XeroResponse as XeroTransportResponse, XeroTransport } from "./transport.ts";
import { XeroApiError, xeroRetryDelay } from "./transport.ts";
export { verifyXeroWebhook as verifyXeroWebhookSignature } from "./webhook.ts";

export function getXeroRetryDecision(status: number, attempt: number) {
  const retryable = status === 401 || status === 409 || status === 429 || status >= 500;
  const delayMs = xeroRetryDelay(new XeroApiError("Mock failure", status, null, retryable), attempt);
  return { delayMs, retryable: delayMs !== null };
}
