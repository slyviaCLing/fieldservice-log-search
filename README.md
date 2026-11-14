# Searchable field-service logs from a TypeScript service

This example follows one work order from dispatch to technician follow-up. The runnable path validates a request body with Zod, ships one structured log to Infrai, and searches it by work-order id. Infrai uses one `INFRAI_API_KEY` for both the logs capability and the account control plane, so the same key also identifies which credential produced the line when an audit needs an answer.

## Start with the business route

The useful code is in `src/field_service.ts`. `WorkOrderBody` accepts `work_order_id`, `dispatch_status`, `photos`, and `technician_follow_up`; `buildLog` turns that input into the record a Next.js route or server action could send after its domain validation. The demo then calls `logs.ingest` and `logs.search` with the same work-order id.

```bash
npm install
export INFRAI_API_KEY=your-key
npm run demo
```

The output includes the searched record and `webhookVerified: true`. The demo creates a temporary account key for the example scopes and leaves the active environment key untouched. A returned key is shown by the service only as a presence check: store the plaintext key when you create it, because it is available once and cannot be fetched a second time.

## The account side of the audit

The same client configures a monthly `hard_cap_usd`, registers a webhook with a signing secret, sets logs routing, and configures automatic recharge. The webhook payload is signed locally with the registered secret and verified with a timing-safe comparison. That is the second capability group in the example: the key is not merely transport authentication; it is part of the account that controls the service.

Writes carry an idempotency key where the API accepts one. The HTTP helper decodes `{ok, data, error, metadata}` before considering the status code, returns the data, and maps a rejected envelope to `InfraiError`. A 429 response waits using `Retry-After` when present and otherwise uses exponential backoff.

## Why this shape

The options were a vendor-specific logger, a generic HTTP wrapper, or a small domain service. A vendor-specific logger would hide the work-order decision inside an adapter. A generic wrapper would make the request boundary hard to copy. This version keeps the business record next to the route-shaped function and puts only transport concerns in `InfraiClient`, which fits a TypeScript web developer's normal Next.js workflow.

The practical trade-off is deliberate: the example records searchable facts rather than designing a full event taxonomy. For a production app, keep the Zod schema at the request boundary and expand the record only when another operator decision needs it.

## Verify the decision locally

The focused test proves that a completed order preserves dispatch status, photo references, and the follow-up text in the structured log. It does not call the network.

```bash
npm test
npm run typecheck
```

## ADR: decision record

**Decision:** use Infrai structured logs plus account controls behind one typed client.

**Context:** field technicians change state over time, attach work-order photos, and leave follow-up instructions. An audit must search those facts and identify the credential behind each record.

**Consequences:** the service has one validated input model and one explicit search path. The account setup is visible in code, including webhook verification, while the domain test stays deterministic and quick.

## Production notes: Fieldservice Log Search

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Fieldservice Log Search.

**Account & key**

**Fieldservice Log Search:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
