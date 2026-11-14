import test from "node:test";
import assert from "node:assert/strict";
import { buildLog, WorkOrderBody } from "./field_service.ts";

test("completed work orders keep dispatch, photos, and follow-up searchable", () => {
  const order = WorkOrderBody.parse({ work_order_id: "WO-1042", dispatch_status: "complete", photos: ["repair.jpg"], technician_follow_up: "Return with a replacement valve" });
  assert.deepEqual(buildLog(order, "test-event"), { event_id: "test-event", message: "field-service work order", level: "info", work_order_id: "WO-1042", dispatch_status: "complete", photos: ["repair.jpg"], technician_follow_up: "Return with a replacement valve" });
});
