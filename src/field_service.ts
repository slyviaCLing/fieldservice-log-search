import { createHmac } from "node:crypto";
import { z } from "zod";
import { InfraiClient } from "./infrai_client.ts";

export const WorkOrderBody = z.object({
  work_order_id: z.string().min(1),
  dispatch_status: z.enum(["dispatched", "en_route", "on_site", "complete"]),
  photos: z.array(z.string()).default([]),
  technician_follow_up: z.string().min(1),
});
export type WorkOrder = z.infer<typeof WorkOrderBody>;

export function buildLog(input: WorkOrder, eventId = "work-order-demo-001") {
  return { event_id: eventId, message: "field-service work order", level: "info", work_order_id: input.work_order_id, dispatch_status: input.dispatch_status, photos: input.photos, technician_follow_up: input.technician_follow_up };
}

export async function shipWorkOrder(input: unknown, client = new InfraiClient()) {
  const workOrder = WorkOrderBody.parse(input);
  const log = buildLog(workOrder);
  await client.ingestLog(log);
  return { workOrder, log, search: await client.searchLogs(workOrder.work_order_id) };
}

export async function runDemo() {
  const client = new InfraiClient();
  let temporaryKeyId: string | undefined;
  let webhookId: string | undefined;
  try {
    const temporary = await client.createKey({ name: "field-service-demo", scopes: ["logs.ingest", "logs.search"], idempotency_key: "field-service-demo-key-001" }) as { id?: string };
    temporaryKeyId = temporary.id;
    await client.setBudget({ hard_cap_usd: 5, period: "monthly", alert_threshold_usd: 4 });
    const secret = "field-service-webhook-secret";
    const webhook = await client.registerWebhook({ url: "https://example.com/infrai-events", events: ["error.captured"], description: "Field service audit events", secret }) as { id?: string };
    webhookId = webhook.id;
    await client.setRouting({ capability: "logs.ingest", exclude: [] });
    await client.configureAutorecharge({ trigger_balance: 1, recharge_amount: 5 });
    const result = await shipWorkOrder({ work_order_id: "WO-1042", dispatch_status: "complete", photos: ["arrival.jpg", "repair.jpg"], technician_follow_up: "Return with a replacement valve" }, client);
    const payload = JSON.stringify({ event: "logs.ingest", work_order_id: result.workOrder.work_order_id });
    const signature = createSignature(payload, secret);
    console.log(JSON.stringify({ temporaryKeyCreated: Boolean(temporary), webhookVerified: client.verifyWebhook(payload, signature, secret), result }, null, 2));
  } finally {
    if (webhookId) await client.deleteWebhook(webhookId);
    if (temporaryKeyId) await client.revokeKey(temporaryKeyId);
  }
}

function createSignature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

if (process.argv[1]?.endsWith("field_service.ts")) await runDemo();
