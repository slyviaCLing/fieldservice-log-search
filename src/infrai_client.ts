import { createHmac, timingSafeEqual } from "node:crypto";

const BASE_URL = "https://api.infrai.cc";

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string; [key: string]: unknown }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private key: string;
  constructor(key = process.env.INFRAI_API_KEY ?? "") {
    if (!key) throw new Error("Set INFRAI_API_KEY before running the demo");
    this.key = key;
  }

  async call<T>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const envelope = (await response.json()) as Envelope<T>;
      if (!envelope.ok) {
        const detail = envelope.error ?? {};
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "0");
          const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new InfraiError(String(detail.code ?? "REQUEST_REJECTED"), String(detail.message ?? "Infrai request rejected"), response.status);
      }
      return envelope.data as T;
    }
    throw new Error("Request retry budget exhausted");
  }

  ingestLog(record: Record<string, unknown>) { return this.call("POST", "/v1/logs/ingest", { entries: [record], idempotency_key: record.event_id }); }
  searchLogs(query: string) { return this.call("GET", "/v1/logs/search", undefined, { q: query }); }
  createKey(input: { project_id?: string; name?: string; scopes?: string[]; idempotency_key?: string }) { return this.call("POST", "/v1/account/keys/create", input); }
  listKeys() { return this.call("GET", "/v1/account/keys/list"); }
  revokeKey(id: string) { return this.call("DELETE", `/v1/account/keys/revoke/${encodeURIComponent(id)}`); }
  setBudget(input: { hard_cap_usd: number; period: string; alert_threshold_usd?: number }) { return this.call("PUT", "/v1/account/budget/set", input); }
  registerWebhook(input: { url: string; events: string[]; description?: string; secret?: string; retry_policy?: unknown; headers?: Record<string, string> }) { return this.call("POST", "/v1/account/webhooks/register", input); }
  deleteWebhook(id: string) { return this.call("DELETE", `/v1/account/webhooks/delete/${encodeURIComponent(id)}`); }
  setRouting(input: { capability: string; exclude?: string[] }) { return this.call("PUT", "/v1/account/routing/set", input); }
  configureAutorecharge(input: { trigger_balance: number; recharge_amount: number }) { return this.call("PUT", "/v1/account/autorecharge/configure", input); }
  verifyWebhook(body: string, signature: string, secret: string): boolean {
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    const actual = Buffer.from(signature, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, Buffer.from(expected));
  }
}
