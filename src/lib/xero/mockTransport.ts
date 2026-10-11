export type XeroTransportRequest = {
  idempotencyKey?: string;
  method: "GET" | "POST" | "PUT";
  path: string;
  tenantId: string;
  body?: unknown;
};

export type XeroTransportResponse<T = unknown> = {
  data: T;
  status: number;
};

export interface XeroTransport {
  request<T>(input: XeroTransportRequest): Promise<XeroTransportResponse<T>>;
}

export class MockXeroTransport implements XeroTransport {
  readonly calls: XeroTransportRequest[] = [];
  private readonly responses: Array<XeroTransportResponse | Error>;
  private readonly mutations = new Map<string, XeroTransportResponse>();

  constructor(responses: Array<XeroTransportResponse | Error>) {
    this.responses = [...responses];
  }

  async request<T>(input: XeroTransportRequest): Promise<XeroTransportResponse<T>> {
    this.calls.push(input);
    if (input.method !== "GET" && input.idempotencyKey) {
      const existing = this.mutations.get(input.idempotencyKey);
      if (existing) return existing as XeroTransportResponse<T>;
    }
    const next = this.responses.shift();
    if (!next) throw new Error("Mock Xero response not configured.");
    if (next instanceof Error) throw next;
    if (input.method !== "GET" && input.idempotencyKey) {
      this.mutations.set(input.idempotencyKey, next);
    }
    return next as XeroTransportResponse<T>;
  }
}

export function getXeroRetryDecision(status: number, attempt: number) {
  const retryable = status === 401 || status === 409 || status === 429 || status >= 500;
  return {
    delayMs: retryable ? Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1)) : null,
    retryable,
  };
}

export function verifyXeroWebhookSignature(
  rawBody: string,
  signature: string,
  webhookKey: string,
  createDigest: (body: string, key: string) => string,
) {
  if (!signature || !webhookKey) return false;
  const expected = createDigest(rawBody, webhookKey);
  if (signature.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < signature.length; index += 1) {
    difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}
