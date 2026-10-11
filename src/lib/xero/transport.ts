import { redactXeroSecrets } from "./tokenVault.ts";

export type XeroRequest = { body?: unknown; headers?: Record<string, string>; idempotencyKey?: string; method: "DELETE" | "GET" | "POST" | "PUT"; path: string; tenantId?: string };
export type XeroResponse<T> = { correlationId: string | null; data: T; retryAfterSeconds: number | null; status: number };
export interface XeroTransport { request<T>(input: XeroRequest): Promise<XeroResponse<T>> }

export class XeroApiError extends Error {
  readonly retryAfterSeconds: number | null; readonly retryable: boolean; readonly status: number;
  constructor(message: string, status: number, retryAfterSeconds: number | null, retryable: boolean) { super(message); this.status = status; this.retryAfterSeconds = retryAfterSeconds; this.retryable = retryable; }
}

export class FetchXeroTransport implements XeroTransport {
  private readonly accessToken: string; private readonly baseUrl: string; private readonly http: typeof fetch; private readonly timeoutMs: number;
  constructor(accessToken: string, baseUrl = "https://api.xero.com/api.xro/2.0", http: typeof fetch = fetch, timeoutMs = 15_000) { this.accessToken = accessToken; this.baseUrl = baseUrl; this.http = http; this.timeoutMs = timeoutMs; }
  async request<T>(input: XeroRequest): Promise<XeroResponse<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.http(`${this.baseUrl}${input.path}`, {
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        headers: { Accept: "application/json", Authorization: `Bearer ${this.accessToken}`, ...(input.body === undefined ? {} : { "Content-Type": "application/json" }), ...(input.tenantId ? { "Xero-Tenant-Id": input.tenantId } : {}), ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}), ...input.headers },
        method: input.method,
        signal: controller.signal,
      });
      const retryAfterSeconds = Number(response.headers.get("retry-after")) || null;
      const correlationId = response.headers.get("xero-correlation-id");
      const data = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) throw new XeroApiError(`Xero request failed (${response.status}).`, response.status, retryAfterSeconds, response.status === 401 || response.status === 409 || response.status === 429 || response.status >= 500);
      return { correlationId, data: data as T, retryAfterSeconds, status: response.status };
    } catch (error) {
      if (error instanceof XeroApiError) throw error;
      const message = error instanceof Error ? redactXeroSecrets(error.message) : "Xero request failed.";
      throw new XeroApiError(message, 0, null, true);
    } finally { clearTimeout(timeout); }
  }
}

export class MockXeroTransport implements XeroTransport {
  readonly calls: XeroRequest[] = [];
  private readonly cached = new Map<string, XeroResponse<unknown>>();
  private readonly responses: Array<XeroResponse<unknown> | Error>;
  constructor(responses: Array<XeroResponse<unknown> | Error>) { this.responses = [...responses]; }
  async request<T>(input: XeroRequest) {
    this.calls.push(input);
    if (input.method !== "GET" && input.idempotencyKey && this.cached.has(input.idempotencyKey)) return this.cached.get(input.idempotencyKey) as XeroResponse<T>;
    const next = this.responses.shift();
    if (!next) throw new Error("Mock Xero response not configured.");
    if (next instanceof Error) throw next;
    if (input.method !== "GET" && input.idempotencyKey) this.cached.set(input.idempotencyKey, next);
    return next as XeroResponse<T>;
  }
}

export function xeroRetryDelay(error: unknown, attempt: number) {
  if (!(error instanceof XeroApiError) || !error.retryable) return null;
  if (error.retryAfterSeconds) return Math.min(3_600_000, error.retryAfterSeconds * 1000);
  const ceiling = Math.min(300_000, 1000 * 2 ** Math.max(0, attempt - 1));
  return Math.floor(ceiling * 0.75);
}
